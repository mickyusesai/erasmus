import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { parseParticipantCsv, alignCountry, CsvReadError, FIELD_LABELS, type CsvParticipant, type ParticipantCsvResult } from '../../utils/participantCsv.js';
import prisma from '../../utils/prisma.js';
import { asyncHandler, ValidationError, NotFoundError, ForbiddenError } from '../../middleware/errorHandler.js';
import { organisationAuth, ensureOwnProject, changeLogActor } from '../../middleware/auth.js';
import { Organisation, PurchaseType, ParticipantStatus, AiReviewStatus, TransportMode, DocumentType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { bankAccountProblem, maskAccountNumber, normaliseAccountNumber } from '../../utils/bankAccount.js';
import path from 'path';
import { ADDABLE_TYPES, type StoredAttachment } from '../../services/email/inbound.js';
import { getEmailService } from '../../services/email/index.js';
import { projectEmailContext } from '../../services/email/context.js';
import { getStorageService } from '../../services/storage/index.js';
import { generateAuditPdf } from '../../services/pdf/index.js';
import { sortTravelItemsByJourney } from '../../utils/sortTravelItems.js';
import { getEffectiveLimit } from '../../utils/effectiveLimit.js';
import { summarizeTravelDays } from '../../utils/travelDays.js';
import { GREEN_TRAVEL_EXTRA_MODES } from '../../utils/greenTravelExtra.js';
import { buildGreenTravelSuggestion } from '../../services/greenTravel/suggestion.js';
import { findSharedDocuments } from '../../services/checks/sharedDocuments.js';
import { findSameFile, fileHash } from '../../services/checks/sameFile.js';
import { findOtherProjectOverlaps } from '../../services/checks/otherProjects.js';
import { reviewOutdated } from '../../services/checks/reviewOutdated.js';
import { convertToEurForParticipant } from '../../services/exchangeRate/index.js';
import { sanitizePdfBuffer } from '../../utils/pdfSanitize.js';
import archiver from 'archiver';
import multer from 'multer';

const router = Router();

// All routes require organisation authentication
router.use(organisationAuth);

// =============================================================================
// CREDIT MANAGEMENT HELPERS
// =============================================================================

interface CreditStatus {
  canCreateProject: boolean;
  reason?: string;
  availableCredits: number;
}

function getCreditStatus(org: Organisation): CreditStatus {
  const availableCredits = org.projectCredits;
  const canCreateProject = availableCredits > 0;
  const reason = canCreateProject ? undefined : 'No credits available. Please purchase credits to create a project.';

  return { canCreateProject, reason, availableCredits };
}

async function consumeCredit(org: Organisation): Promise<PurchaseType> {
  if (org.projectCredits > 0) {
    await prisma.organisation.update({
      where: { id: org.id },
      data: { projectCredits: org.projectCredits - 1 },
    });
    return 'SINGLE';
  }

  throw new ForbiddenError('No credits available');
}

// =============================================================================
// DASHBOARD ROUTES
// =============================================================================

/**
 * GET /api/organisation/dashboard
 * Get organisation dashboard overview
 */
router.get('/dashboard', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;

  // Get projects with participant counts
  const projects = await prisma.project.findMany({
    where: { organisationId: org.id },
    include: {
      _count: {
        select: { participants: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Get total participants across all projects
  const totalParticipants = await prisma.participant.count({
    where: {
      project: { organisationId: org.id },
    },
  });

  // Get credit status
  const creditStatus = getCreditStatus(org);

  // Get recent purchases
  const recentPurchases = await prisma.purchase.findMany({
    where: { organisationId: org.id, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    take: 5,
  });

  res.json({
    organisation: {
      id: org.id,
      name: org.name,
      email: org.email,
      isAffiliate: org.isAffiliate,
      affiliateActive: org.affiliateActive,
    },
    credits: {
      available: creditStatus.availableCredits,
      canCreateProject: creditStatus.canCreateProject,
      reason: creditStatus.reason,
    },
    stats: {
      projectCount: projects.length,
      totalParticipants,
    },
    projects: projects.map((p: any) => ({
      id: p.id,
      name: p.name,
      country: p.country,
      startDate: p.startDate,
      endDate: p.endDate,
      participantCount: p._count.participants,
      creditSource: p.creditSource,
      isTestProject: p.isTestProject,
      maxParticipants: p.maxParticipants,
      createdAt: p.createdAt,
    })),
    recentPurchases: recentPurchases.map((p: any) => ({
      id: p.id,
      type: p.type,
      amountCents: p.amountCents,
      currency: p.currency,
      creditsGranted: p.creditsGranted,
      completedAt: p.completedAt,
    })),
  });
}));

// =============================================================================
// PROJECT ROUTES
// =============================================================================

/**
 * GET /api/organisation/projects
 * List all projects for the organisation
 */
router.get('/projects', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;

  const projects = await prisma.project.findMany({
    where: { organisationId: org.id },
    include: {
      _count: {
        select: { participants: true },
      },
      countryLimits: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    projects: projects.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      country: p.country,
      startDate: p.startDate,
      endDate: p.endDate,
      disseminationEnabled: p.disseminationEnabled,
      carRatePerKm: p.carRatePerKm,
      venueAddress: p.venueAddress,
      exchangeRateMode: p.exchangeRateMode,
      exchangeRateManualDate: p.exchangeRateManualDate,
      participantCount: p._count.participants,
      creditSource: p.creditSource,
      isTestProject: p.isTestProject,
      maxParticipants: p.maxParticipants,
      countryLimits: p.countryLimits,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  });
}));

const exchangeRateModeEnum = z.enum(['PURCHASE_DATE', 'PROJECT_END_DATE', 'MANUAL_DATE']);

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
  country: z.string().min(1, 'Country is required'),
  startDate: z.string().transform((s) => new Date(s)),
  endDate: z.string().transform((s) => new Date(s)),
  carRatePerKm: z.number().min(0).default(0.22),
  venueAddress: z.string().optional(),
  exchangeRateMode: exchangeRateModeEnum.optional(),
  exchangeRateManualDate: z.string().transform((s) => new Date(s)).nullish(),
});

/**
 * POST /api/organisation/projects
 * Create a new project (consumes a credit)
 */
router.post('/projects', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;

  // Check credit status
  const creditStatus = getCreditStatus(org);
  if (!creditStatus.canCreateProject) {
    throw new ForbiddenError(creditStatus.reason || 'Cannot create project');
  }

  // Validate input
  const result = createProjectSchema.safeParse(req.body);
  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  // Consume credit and create project in a transaction
  const { name, description, country, startDate, endDate, carRatePerKm, venueAddress, exchangeRateMode, exchangeRateManualDate } = result.data;

  // Refresh org data to get latest credit count
  const freshOrg = await prisma.organisation.findUnique({
    where: { id: org.id },
  });

  if (!freshOrg) {
    throw new NotFoundError('Organisation not found');
  }

  // Consume the credit
  const creditSource = await consumeCredit(freshOrg);

  // Create the project — 1 credit covers up to 60 participants
  const project = await prisma.project.create({
    data: {
      organisationId: org.id,
      name,
      description,
      country,
      startDate,
      endDate,
      carRatePerKm,
      venueAddress,
      ...(exchangeRateMode && { exchangeRateMode }),
      ...(exchangeRateManualDate !== undefined && { exchangeRateManualDate: exchangeRateManualDate || null }),
      creditSource,
      maxParticipants: 60,
      // New projects ask green-travel participants to sign a declaration at submission
      requireGreenTravelDeclaration: true,
    },
    include: {
      _count: {
        select: { participants: true },
      },
    },
  });

  res.status(201).json({
    message: 'Project created successfully',
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      country: project.country,
      venueAddress: project.venueAddress,
      startDate: project.startDate,
      endDate: project.endDate,
      carRatePerKm: project.carRatePerKm,
      creditSource: project.creditSource,
      participantCount: project._count.participants,
      createdAt: project.createdAt,
    },
    creditUsed: creditSource,
  });
}));

/**
 * GET /api/organisation/projects/:id
 * Get single project details
 */
router.get('/projects/:id', ensureOwnProject, asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const projectId = req.params.id;

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organisationId: org.id,
    },
    include: {
      countryLimits: true,
      participants: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          country: true,
          status: true,
          createdAt: true,
        },
      },
      _count: {
        select: { participants: true },
      },
    },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  res.json({
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      country: project.country,
      venueAddress: project.venueAddress,
      startDate: project.startDate,
      endDate: project.endDate,
      disseminationEnabled: project.disseminationEnabled,
      carRatePerKm: project.carRatePerKm,
      exchangeRateMode: project.exchangeRateMode,
      exchangeRateManualDate: project.exchangeRateManualDate,
      aiAnalysisUnlocked: project.aiAnalysisUnlocked,
      participantInstructions: project.participantInstructions,
      documentDeadline: project.documentDeadline,
      contactEmail: project.contactEmail,
      contactPhone: project.contactPhone,
      requireGreenTravelDeclaration: project.requireGreenTravelDeclaration,
      requireAirlineDeclaration: project.requireAirlineDeclaration,
      greenTravelExtraMode: project.greenTravelExtraMode,
      greenTravelFoodPerDayEur: project.greenTravelFoodPerDayEur,
      greenTravelAccommodationPerNightEur: project.greenTravelAccommodationPerNightEur,
      creditSource: project.creditSource,
      countryLimits: project.countryLimits,
      participants: project.participants,
      participantCount: project._count.participants,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
  });
}));

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  country: z.string().min(1).optional(),
  startDate: z.string().transform((s) => new Date(s)).optional(),
  endDate: z.string().transform((s) => new Date(s)).optional(),
  disseminationEnabled: z.boolean().optional(),
  carRatePerKm: z.number().min(0).optional(),
  venueAddress: z.string().optional(),
  exchangeRateMode: exchangeRateModeEnum.optional(),
  exchangeRateManualDate: z.string().transform((s) => new Date(s)).nullish(),
  aiAnalysisUnlocked: z.boolean().optional(),
  // Communication with participants
  participantInstructions: z.string().nullish(),
  documentDeadline: z.string().transform((s) => new Date(s)).nullish(),
  contactEmail: z.string().nullish(),
  contactPhone: z.string().nullish(),
  requireGreenTravelDeclaration: z.boolean().optional(),
  requireAirlineDeclaration: z.boolean().optional(),
  // How the green travel extra is worked out, with its limits (EUR)
  greenTravelExtraMode: z.enum(GREEN_TRAVEL_EXTRA_MODES).optional(),
  greenTravelFoodPerDayEur: z.number().min(0).max(10000).nullish(),
  greenTravelAccommodationPerNightEur: z.number().min(0).max(10000).nullish(),
});

/**
 * PATCH /api/organisation/projects/:id
 * Update a project
 */
router.patch('/projects/:id', ensureOwnProject, asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const projectId = req.params.id;

  // Verify ownership
  const existing = await prisma.project.findFirst({
    where: {
      id: projectId,
      organisationId: org.id,
    },
  });

  if (!existing) {
    throw new NotFoundError('Project not found');
  }

  // Validate input
  const result = updateProjectSchema.safeParse(req.body);
  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const data = { ...result.data } as Record<string, unknown>;
  if ('exchangeRateManualDate' in data && data.exchangeRateManualDate == null) {
    data.exchangeRateManualDate = null;
  }

  // Detect whether the exchange-rate configuration changed (triggers a recompute)
  const exchangeRateChanged =
    (result.data.exchangeRateMode !== undefined && result.data.exchangeRateMode !== existing.exchangeRateMode) ||
    (result.data.exchangeRateManualDate !== undefined &&
      (result.data.exchangeRateManualDate?.getTime() ?? null) !== (existing.exchangeRateManualDate?.getTime() ?? null));

  // Update project
  const project = await prisma.project.update({
    where: { id: projectId },
    data,
    include: {
      _count: {
        select: { participants: true },
      },
    },
  });

  // Recompute EUR amounts for all non-paid participants when the FX config changed
  let recalc: import('../../services/exchangeRate/index.js').ProjectRecalcResult | undefined;
  if (exchangeRateChanged) {
    const { recalculateProjectExchangeRates } = await import('../../services/exchangeRate/index.js');
    recalc = await recalculateProjectExchangeRates(projectId);
  }

  res.json({
    message: 'Project updated successfully',
    recalc,
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      country: project.country,
      venueAddress: project.venueAddress,
      startDate: project.startDate,
      endDate: project.endDate,
      disseminationEnabled: project.disseminationEnabled,
      carRatePerKm: project.carRatePerKm,
      exchangeRateMode: project.exchangeRateMode,
      exchangeRateManualDate: project.exchangeRateManualDate,
      aiAnalysisUnlocked: project.aiAnalysisUnlocked,
      participantInstructions: project.participantInstructions,
      documentDeadline: project.documentDeadline,
      contactEmail: project.contactEmail,
      contactPhone: project.contactPhone,
      requireGreenTravelDeclaration: project.requireGreenTravelDeclaration,
      requireAirlineDeclaration: project.requireAirlineDeclaration,
      greenTravelExtraMode: project.greenTravelExtraMode,
      greenTravelFoodPerDayEur: project.greenTravelFoodPerDayEur,
      greenTravelAccommodationPerNightEur: project.greenTravelAccommodationPerNightEur,
      creditSource: project.creditSource,
      participantCount: project._count.participants,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
  });
}));

/**
 * POST /api/organisation/projects/:id/notify-ended
 * (Re)send the "project ended — build your trips" email to every participant
 * who hasn't submitted yet. Only allowed once the project has ended (or the
 * organisation opened AI analysis early).
 */
router.post('/projects/:id/notify-ended', ensureOwnProject, asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      participants: {
        where: { status: 'DRAFT', magicLinkActive: true },
        select: { id: true, email: true, firstName: true, magicLinkToken: true },
      },
    },
  });
  if (!project) throw new NotFoundError('Project not found');

  const projectEnded = Date.now() >= project.endDate.getTime();
  if (!projectEnded && !project.aiAnalysisUnlocked) {
    throw new ValidationError('The project has not ended yet. Enable "Open AI analysis early" first, or wait until the end date.');
  }

  const emailService = getEmailService();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  for (const p of project.participants) {
    const magicLink = `${frontendUrl}/reimbursement?token=${p.magicLinkToken}`;
    const emailCtx = await projectEmailContext(project, p.id);
    emailService
      .sendProjectEnded(p.email, p.firstName, project.name, magicLink, emailCtx)
      .catch((err) => console.error(`[Project End] Failed to email ${p.email}:`, err));
  }

  // Mark as sent so the hourly job never double-sends after a manual trigger
  await prisma.project.update({
    where: { id: projectId },
    data: { endEmailSentAt: new Date() },
  });

  res.json({ sent: project.participants.length });
}));

/**
 * GET /api/organisation/projects/:id/currency-rates
 * Returns the project's exchange-rate mode, manual date, existing per-currency
 * overrides, and the currencies detected in its travel items (with current
 * effective rate) so the settings UI can pre-fill the override list.
 */
router.get('/projects/:id/currency-rates', ensureOwnProject, asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { currencyRates: true },
  });
  if (!project) throw new NotFoundError('Project not found');

  // Distinct non-EUR currencies actually used across the project's travel items
  const items = await prisma.travelItem.findMany({
    where: { participant: { projectId }, currencyOriginal: { not: 'EUR' } },
    select: { currencyOriginal: true, purchaseDate: true },
  });

  const { getEffectiveRate } = await import('../../services/exchangeRate/index.js');
  const rateConfig = {
    exchangeRateMode: project.exchangeRateMode,
    exchangeRateManualDate: project.exchangeRateManualDate,
    endDate: project.endDate,
  };
  const overrideMap = new Map<string, number>();
  for (const cr of project.currencyRates) overrideMap.set(cr.currencyCode.toUpperCase(), cr.rate);

  // One representative purchase date per currency (most recent) for rate preview
  const latestDateByCurrency = new Map<string, Date | null>();
  for (const it of items) {
    const cur = (it.currencyOriginal || '').toUpperCase();
    if (!cur) continue;
    const prev = latestDateByCurrency.get(cur);
    if (prev === undefined || (it.purchaseDate && (!prev || it.purchaseDate > prev))) {
      latestDateByCurrency.set(cur, it.purchaseDate ?? prev ?? null);
    }
  }

  const detected = await Promise.all(
    Array.from(latestDateByCurrency.keys()).sort().map(async (currencyCode) => {
      const effectiveRate = await getEffectiveRate(rateConfig, overrideMap, currencyCode, latestDateByCurrency.get(currencyCode));
      return {
        currencyCode,
        effectiveRate,
        hasOverride: overrideMap.has(currencyCode),
      };
    })
  );

  res.json({
    exchangeRateMode: project.exchangeRateMode,
    exchangeRateManualDate: project.exchangeRateManualDate,
    overrides: project.currencyRates.map((cr) => ({ currencyCode: cr.currencyCode, rate: cr.rate })),
    detectedCurrencies: detected,
  });
}));

/**
 * PUT /api/organisation/projects/:id/currency-rates
 * Replaces the project's per-currency override set, then recomputes EUR amounts
 * for all non-paid participants.
 */
const currencyRatesSchema = z.object({
  overrides: z.array(z.object({
    currencyCode: z.string().min(3).max(3).transform((s) => s.toUpperCase()),
    rate: z.number().positive('Rate must be greater than 0'),
  })),
});

router.put('/projects/:id/currency-rates', ensureOwnProject, asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Project not found');

  const result = currencyRatesSchema.safeParse(req.body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);

  // De-duplicate by currency (last one wins), drop EUR (always 1:1)
  const wanted = new Map<string, number>();
  for (const o of result.data.overrides) {
    if (o.currencyCode === 'EUR') continue;
    wanted.set(o.currencyCode, o.rate);
  }

  // Replace the set: upsert wanted, delete the rest
  await prisma.$transaction(async (tx) => {
    await tx.projectCurrencyRate.deleteMany({
      where: { projectId, currencyCode: { notIn: Array.from(wanted.keys()) } },
    });
    for (const [currencyCode, rate] of wanted) {
      await tx.projectCurrencyRate.upsert({
        where: { projectId_currencyCode: { projectId, currencyCode } },
        create: { projectId, currencyCode, rate },
        update: { rate },
      });
    }
  });

  const { recalculateProjectExchangeRates } = await import('../../services/exchangeRate/index.js');
  const recalc = await recalculateProjectExchangeRates(projectId);

  res.json({ message: 'Exchange rate overrides saved', recalc });
}));

/**
 * DELETE /api/organisation/projects/:id
 * Delete a project (credits are NOT refunded)
 */
router.delete('/projects/:id', ensureOwnProject, asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const projectId = req.params.id;

  // Verify ownership
  const existing = await prisma.project.findFirst({
    where: {
      id: projectId,
      organisationId: org.id,
    },
    include: {
      _count: {
        select: { participants: true },
      },
    },
  });

  if (!existing) {
    throw new NotFoundError('Project not found');
  }

  // Prevent deletion if project has participants
  if (existing._count.participants > 0) {
    throw new ForbiddenError('Cannot delete project with participants. Remove all participants first.');
  }

  // Delete project
  await prisma.project.delete({
    where: { id: projectId },
  });

  res.json({
    message: 'Project deleted successfully',
  });
}));

// =============================================================================
// BILLING ROUTES
// =============================================================================

/**
 * GET /api/organisation/billing
 * Get billing/purchase history
 */
router.get('/billing', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;

  const purchases = await prisma.purchase.findMany({
    where: { organisationId: org.id },
    orderBy: { createdAt: 'desc' },
  });

  const creditStatus = getCreditStatus(org);

  res.json({
    credits: {
      available: creditStatus.availableCredits,
      projectCredits: org.projectCredits,
    },
    purchases: purchases.map((p: any) => ({
      id: p.id,
      type: p.type,
      amountCents: p.amountCents,
      currency: p.currency,
      creditsGranted: p.creditsGranted,
      status: p.status,
      stripeInvoiceUrl: p.stripeInvoiceUrl,
      invoiceReference: p.invoiceReference,
      createdAt: p.createdAt,
      completedAt: p.completedAt,
    })),
    organisation: {
      isAffiliate: org.isAffiliate,
      affiliateActive: org.affiliateActive,
    },
    // What will be printed in the "Bill to" block of the next invoice
    invoiceDetails: {
      name: org.legalName || org.name,
      registrationNumber: org.registrationNumber,
      vatNumber: org.vatNumber,
      street: org.billingStreet,
      postalCode: org.billingPostalCode,
      city: org.billingCity,
      country: org.billingCountry,
      complete: !!(org.billingStreet && org.billingCity && org.billingCountry),
    },
  });
}));

/**
 * POST /api/organisation/stripe/create-checkout-session
 * Create a Stripe Checkout session for purchasing credits
 */
/** Country names organisations commonly type, mapped to the ISO code Stripe needs for addresses */
const COUNTRY_CODES: Record<string, string> = {
  austria: 'AT', belgium: 'BE', bulgaria: 'BG', croatia: 'HR', cyprus: 'CY', czechia: 'CZ', 'czech republic': 'CZ', denmark: 'DK',
  estonia: 'EE', finland: 'FI', france: 'FR', germany: 'DE', deutschland: 'DE', greece: 'GR', hungary: 'HU', iceland: 'IS', ireland: 'IE',
  italy: 'IT', italia: 'IT', latvia: 'LV', latvija: 'LV', liechtenstein: 'LI', lithuania: 'LT', lietuva: 'LT', luxembourg: 'LU', malta: 'MT',
  netherlands: 'NL', 'the netherlands': 'NL', nederland: 'NL', 'north macedonia': 'MK', norway: 'NO', poland: 'PL', polska: 'PL',
  portugal: 'PT', romania: 'RO', serbia: 'RS', slovakia: 'SK', slovenia: 'SI', spain: 'ES', españa: 'ES', sweden: 'SE', switzerland: 'CH',
  turkey: 'TR', türkiye: 'TR', ukraine: 'UA', 'united kingdom': 'GB', uk: 'GB',
};
function toCountryCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  return COUNTRY_CODES[v.toLowerCase()] ?? null;
}

/**
 * Find or create the Stripe Customer for an organisation and keep its name/address in sync,
 * so every invoice shows the legal name, address and registration details the organisation entered.
 */
async function syncStripeCustomer(stripe: any, org: Organisation): Promise<string> {
  const countryCode = toCountryCode(org.billingCountry);
  const address = org.billingStreet || org.billingCity || org.billingPostalCode
    ? {
        line1: org.billingStreet || undefined,
        // Stripe only accepts ISO codes for the country; keep an unrecognised country name visible on line 2
        line2: !countryCode && org.billingCountry ? org.billingCountry : undefined,
        postal_code: org.billingPostalCode || undefined,
        city: org.billingCity || undefined,
        country: countryCode || undefined,
      }
    : undefined;
  const params = { name: org.legalName || org.name, email: org.email, address, metadata: { organisationId: org.id } };
  if (org.stripeCustomerId) {
    try {
      await stripe.customers.update(org.stripeCustomerId, params);
      return org.stripeCustomerId;
    } catch (err) {
      console.warn(`[Stripe] Could not update customer ${org.stripeCustomerId}, creating a new one:`, err instanceof Error ? err.message : err);
    }
  }
  const customer = await stripe.customers.create(params);
  await prisma.organisation.update({ where: { id: org.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

const STRIPE_PLANS: Record<string, { productEnvKey: string; amountCents: number; credits: number; label: string }> = {
  SINGLE:  { productEnvKey: 'STRIPE_PRODUCT_ID_SINGLE',  amountCents: 12900, credits: 1,  label: 'Single Project Credit' },
  PACK_5:  { productEnvKey: 'STRIPE_PRODUCT_ID_PACK_5',  amountCents: 49900, credits: 5,  label: 'Pack of 5 Credits' },
  PACK_10: { productEnvKey: 'STRIPE_PRODUCT_ID_PACK_10', amountCents: 89900, credits: 10, label: 'Pack of 10 Credits' },
};

router.post('/stripe/create-checkout-session', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const { type } = req.body as { type: string };
  // Optional project number / PO reference, printed on this invoice only
  const invoiceReference = typeof req.body?.invoiceReference === 'string' ? req.body.invoiceReference.trim().slice(0, 140) : '';

  const plan = STRIPE_PLANS[type];
  if (!plan) {
    throw new ValidationError('Invalid purchase type');
  }

  const productId = process.env[plan.productEnvKey];
  if (!productId) {
    throw new ValidationError(`Stripe product not configured for ${type}`);
  }

  const stripe = new (require('stripe').default)(process.env.STRIPE_SECRET_KEY!);

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  // Create a pending Purchase record first so we can link it via metadata
  const purchase = await prisma.purchase.create({
    data: {
      organisationId: org.id,
      type: type as PurchaseType,
      amountCents: plan.amountCents,
      currency: 'EUR',
      creditsGranted: plan.credits,
      status: 'PENDING',
      invoiceReference: invoiceReference || null,
    },
  });

  // Invoice "Bill to" block: Stripe prints the customer's name and address, plus up to four custom fields
  const customerId = await syncStripeCustomer(stripe, org);
  const customFields = [
    org.registrationNumber ? { name: 'Reg. Nr.', value: org.registrationNumber.slice(0, 140) } : null,
    org.vatNumber ? { name: 'VAT ID', value: org.vatNumber.slice(0, 140) } : null,
    invoiceReference ? { name: 'Project number', value: invoiceReference } : null,
  ].filter((f): f is { name: string; value: string } => !!f);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'eur',
        product: productId,
        unit_amount: plan.amountCents,
      },
      quantity: 1,
    }],
    mode: 'payment',
    invoice_creation: {
      enabled: true,
      invoice_data: {
        footer: 'VAT reverse charged — Article 196 Council Directive 2006/112/EC. VAT to be accounted for by the recipient. VAT ID: NL002317662B92.',
        ...(customFields.length > 0 ? { custom_fields: customFields } : {}),
        metadata: { organisationId: org.id, purchaseId: purchase.id, ...(invoiceReference ? { invoiceReference } : {}) },
      },
    },
    success_url: `${frontendUrl}/org/billing?success=1`,
    cancel_url: `${frontendUrl}/org/billing`,
    metadata: {
      organisationId: org.id,
      purchaseId: purchase.id,
      purchaseType: type,
      creditsGranted: String(plan.credits),
    },
    customer: customerId,
    allow_promotion_codes: true,
  });

  // Save Stripe session ID on the purchase
  await prisma.purchase.update({
    where: { id: purchase.id },
    data: { stripeSessionId: session.id },
  });

  res.json({ url: session.url });
}));

// =============================================================================
// SETTINGS ROUTES
// =============================================================================

/**
 * GET /api/organisation/settings
 * Get organisation settings
 */
router.get('/settings', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;

  res.json({
    organisation: {
      id: org.id,
      name: org.name,
      email: org.email,
      oid: org.oid,
      legalName: org.legalName,
      vatNumber: org.vatNumber,
      registrationNumber: org.registrationNumber,
      billingStreet: org.billingStreet,
      billingPostalCode: org.billingPostalCode,
      billingCity: org.billingCity,
      billingCountry: org.billingCountry,
      createdAt: org.createdAt,
    },
  });
}));

// =============================================================================
// PARTICIPANT ROUTES
// =============================================================================

// Multer setup for CSV import
const upload = multer({ storage: multer.memoryStorage() });

/**
 * GET /api/organisation/projects/:id/participants
 * List all participants for a project
 */
router.get('/projects/:id/participants', ensureOwnProject, asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;

  const participants = await prisma.participant.findMany({
    where: { projectId },
    include: {
      reimbursementSummary: true,
      _count: {
        select: { documents: true, travelItems: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Get dissemination status for each participant
  const participantsWithDissemination = await Promise.all(
    participants.map(async (p: any) => {
      const [activityCount, socialMediaCount] = await Promise.all([
        prisma.disseminationActivity.count({
          where: { createdById: p.id },
        }),
        prisma.socialMediaPost.count({
          where: { participantId: p.id },
        }),
      ]);
      return {
        ...p,
        disseminationStatus: {
          hasActivity: activityCount > 0,
          hasSocialMedia: socialMediaCount > 0,
        },
      };
    })
  );

  res.json({ participants: participantsWithDissemination });
}));

const createParticipantSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email'),
  country: z.string().min(1, 'Country is required'),
});

/**
 * POST /api/organisation/projects/:id/participants
 * Add a new participant to a project
 */
router.post('/projects/:id/participants', ensureOwnProject, asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;

  const result = createParticipantSchema.safeParse(req.body);
  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const { firstName, lastName, email, country } = result.data;

  // Get project with participant count
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { _count: { select: { participants: true } } },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // Check participant limit (test projects and paid projects with capacity set)
  if (project.maxParticipants !== null && project._count.participants >= project.maxParticipants) {
    if (project.isTestProject) {
      throw new ForbiddenError(`Test project is limited to ${project.maxParticipants} participants. Upgrade to a full project to add more.`);
    } else {
      throw new ForbiddenError(`This project has reached its capacity of ${project.maxParticipants} participants. Use 1 credit to expand by 60 more.`);
    }
  }

  // Check if participant with same email already exists in this project
  const existing = await prisma.participant.findFirst({
    where: { projectId, email },
  });

  if (existing) {
    throw new ValidationError('A participant with this email already exists in this project');
  }

  // Create participant — token expires 180 days after project end
  const tokenExpiresAt = new Date(project.endDate.getTime() + 180 * 24 * 60 * 60 * 1000);
  const participant = await prisma.participant.create({
    data: {
      projectId,
      firstName,
      lastName,
      email,
      country,
      magicLinkToken: uuidv4(),
      magicLinkActive: true,
      tokenExpiresAt,
    },
  });

  // Create reimbursement summary
  const countryLimit = await prisma.projectCountryLimit.findFirst({
    where: { projectId, country },
  });

  await prisma.reimbursementSummary.create({
    data: {
      participantId: participant.id,
      totalEur: 0,
      maxReimbursementAllowed: countryLimit?.maxReimbursementAmount || 0,
      amountToReimburse: 0,
    },
  });

  // Create country limit if it doesn't exist
  if (!countryLimit) {
    await prisma.projectCountryLimit.create({
      data: {
        projectId,
        country,
        maxReimbursementAmount: 0,
        currency: 'EUR',
      },
    });
  }

  res.status(201).json({ participant });
}));

/**
 * POST /api/organisation/projects/:id/participants/preview-import
 * Preview CSV import
 */
/**
 * Parses an uploaded participant CSV and lines it up with the project: countries take the
 * project's existing spelling, and people already in the project are set apart.
 */
async function prepareParticipantImport(projectId: string, buffer: Buffer): Promise<{
  parsed: ParticipantCsvResult;
  newRows: CsvParticipant[];
  alreadyInProject: CsvParticipant[];
}> {
  let parsed: ParticipantCsvResult;
  try {
    parsed = parseParticipantCsv(buffer);
  } catch (err) {
    if (err instanceof CsvReadError) throw new ValidationError(err.message);
    throw new ValidationError("The file couldn't be read as a CSV file.");
  }
  const [limits, existing] = await Promise.all([
    prisma.projectCountryLimit.findMany({ where: { projectId }, select: { country: true } }),
    prisma.participant.findMany({ where: { projectId }, select: { email: true } }),
  ]);
  const knownCountries = limits.map((l) => l.country);
  const existingEmails = new Set(existing.map((p) => p.email.trim().toLowerCase()));
  const rows = parsed.participants.map((p) => ({ ...p, country: alignCountry(p.country, knownCountries) }));
  return {
    parsed,
    newRows: rows.filter((r) => !existingEmails.has(r.email)),
    alreadyInProject: rows.filter((r) => existingEmails.has(r.email)),
  };
}

router.post('/projects/:id/participants/preview-import', ensureOwnProject, upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ValidationError('No file uploaded');
  }
  const projectId = req.params.id;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { _count: { select: { participants: true } } },
  });
  if (!project) throw new NotFoundError('Project not found');

  const { parsed, newRows, alreadyInProject } = await prepareParticipantImport(projectId, req.file.buffer);

  res.json({
    totalRows: newRows.length,
    columns: parsed.columns,
    preview: newRows.slice(0, 10),
    missingColumns: parsed.missingColumns.map((f) => FIELD_LABELS[f]),
    skipped: parsed.skipped.slice(0, 20),
    skippedCount: parsed.skipped.length,
    alreadyInProject: alreadyInProject.length,
    remainingSlots: project.maxParticipants === null ? null : Math.max(0, project.maxParticipants - project._count.participants),
    isTestProject: project.isTestProject,
    detected: { delimiter: parsed.delimiter, encoding: parsed.encoding },
  });
}));

/**
 * POST /api/organisation/projects/:id/participants/import
 * Import participants from CSV
 */
router.post('/projects/:id/participants/import', ensureOwnProject, upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;

  if (!req.file) {
    throw new ValidationError('No file uploaded');
  }

  // Get project with participant count
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { _count: { select: { participants: true } } },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  const { parsed, newRows: validRecords, alreadyInProject } = await prepareParticipantImport(projectId, req.file.buffer);
  if (parsed.missingColumns.length > 0) {
    throw new ValidationError(`No column found for: ${parsed.missingColumns.map((f) => FIELD_LABELS[f]).join(', ')}.`);
  }

  // Check participant limit for test and paid projects (only people not yet in the project count)
  if (project.maxParticipants !== null) {
    const remainingSlots = project.maxParticipants - project._count.participants;
    if (validRecords.length > remainingSlots) {
      if (project.isTestProject) {
        throw new ForbiddenError(`Test project can only add ${remainingSlots} more participant(s) (limit: ${project.maxParticipants}). Upgrade to a full project to add more.`);
      } else {
        throw new ForbiddenError(`This project can only add ${remainingSlots} more participant(s) (capacity: ${project.maxParticipants}). Use 1 credit to expand by 60 more.`);
      }
    }
  }

  const created: any[] = [];
  const errors: { row: number; error: string }[] = [
    ...parsed.skipped.map((s) => ({ row: s.row, error: s.reason })),
    ...alreadyInProject.map((r) => ({ row: r.row, error: `${r.email} is already in this project` })),
  ];

  for (let i = 0; i < validRecords.length; i++) {
    const record = validRecords[i];

    try {
      // Check for existing (case-insensitive: older entries may have been typed with capitals)
      const existing = await prisma.participant.findFirst({
        where: { projectId, email: { equals: record.email, mode: 'insensitive' } },
      });

      if (existing) {
        errors.push({ row: record.row, error: `${record.email} is already in this project` });
        continue;
      }

      // Create participant — token expires 180 days after project end
      const tokenExpiresAt = new Date(project.endDate.getTime() + 180 * 24 * 60 * 60 * 1000);
      const participant = await prisma.participant.create({
        data: {
          projectId,
          firstName: record.firstName,
          lastName: record.lastName,
          email: record.email,
          country: record.country,
          magicLinkToken: uuidv4(),
          magicLinkActive: true,
          tokenExpiresAt,
        },
      });

      // Create reimbursement summary
      const countryLimit = await prisma.projectCountryLimit.findFirst({
        where: { projectId, country: record.country },
      });

      await prisma.reimbursementSummary.create({
        data: {
          participantId: participant.id,
          totalEur: 0,
          maxReimbursementAllowed: countryLimit?.maxReimbursementAmount || 0,
          amountToReimburse: 0,
        },
      });

      // Create country limit if needed
      if (!countryLimit) {
        await prisma.projectCountryLimit.create({
          data: {
            projectId,
            country: record.country,
            maxReimbursementAmount: 0,
            currency: 'EUR',
          },
        });
      }

      created.push(participant);
    } catch (err: any) {
      errors.push({ row: record.row, error: err.message || 'Unknown error' });
    }
  }

  errors.sort((a, b) => a.row - b.row);
  res.json({
    success: true,
    created: created.length,
    errors,
    participants: created,
  });
}));

/**
 * GET /api/organisation/participants/:id
 * Get participant detail (like admin view)
 */
router.get('/participants/:id', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: {
      project: true,
      documents: { include: { extraction: { select: { amount: true, currency: true, documentDate: true, merchantName: true, correctedByOrganisation: true } } } },
      travelItems: {
        orderBy: { departureDate: 'asc' },
      },
      declarationsOnHonor: true,
      declarationsOfTravel: true,
      reimbursementSummary: true,
      greenTravelDeclaration: true,
      changeLogEntries: {
        orderBy: { changedAt: 'desc' },
      },
      messages: { orderBy: { receivedAt: 'desc' }, take: 30 },
    },
  });

  if (!participant) {
    throw new NotFoundError('Participant not found');
  }

  // Verify organisation owns this project
  if (participant.project.organisationId !== org.id) {
    throw new ForbiddenError('Access denied');
  }

  // Applicable limit: individual override, else the country limit
  const countryLimit = await prisma.projectCountryLimit.findFirst({
    where: {
      projectId: participant.projectId,
      country: participant.country,
    },
  });
  const effectiveLimit = getEffectiveLimit(participant, countryLimit);

  // Days travelled, receipts (in EUR) and the project's green travel rule, for the green travel extra card
  const greenTravelSuggestion = await buildGreenTravelSuggestion(participant, effectiveLimit.greenTravel);
  // Files other participants in the project claimed too (e.g. the fuel receipts of a shared car)
  const sharedDocs = await findSharedDocuments(participant.id);
  // The same person's trips in another project of the organisation that clash with these
  const otherProjects = await findOtherProjectOverlaps(participant.id);

  res.json({
    participant: {
      ...participant,
      otherProjects,
      // Trips or files changed after the AI review looked at them
      reviewOutdated: await reviewOutdated(participant),
      // Who switched "doesn't need reimbursement" on (participants tick it themselves)
      noReimbursementSetBy: participant.noReimbursement
        ? participant.changeLogEntries.find((e) => e.fieldName === 'noReimbursement')?.userType === 'PARTICIPANT' ||
          !participant.changeLogEntries.some((e) => e.fieldName === 'noReimbursement')
          ? 'PARTICIPANT'
          : 'ORGANISATION'
        : null,
      travelItems: sortTravelItemsByJourney(participant.travelItems),
      documents: participant.documents.map((d) => ({ ...d, sharedWith: sharedDocs.get(d.id) ?? [] })),
      maxReimbursementForCountry: effectiveLimit.maxReimbursement,
      greenTravel: effectiveLimit.greenTravel,
      countryMaxReimbursement: effectiveLimit.countryMax,
      countryGreenTravel: effectiveLimit.countryGreen,
      greenTravelSuggestion,
      // Email replies from the participant (via the inbox), with the AI summary
      messages: participant.messages.map((m) => ({
        ...m,
        aiSuggestions: parseJsonArray<{ text: string; travelItemId: string | null }>(m.aiSuggestions),
        attachments: parseJsonArray<StoredAttachment>(m.attachments).map(({ storedPath: _path, ...a }) => a),
      })),
    },
  });
}));

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Loads one attachment of a participant's email reply (organisation access checked) */
async function loadMessageAttachment(org: Organisation, participantId: string, messageId: string, index: number) {
  await verifyOrgParticipant(org, participantId);
  const message = await prisma.participantMessage.findFirst({ where: { id: messageId, participantId } });
  if (!message) throw new NotFoundError('Message not found');
  const attachments = parseJsonArray<StoredAttachment>(message.attachments);
  const attachment = attachments[index];
  if (!attachment) throw new NotFoundError('Attachment not found');
  return { message, attachments, attachment };
}

/**
 * GET /api/organisation/participants/:id/messages/:messageId/attachments/:index/url
 * Signed URL to look at a file the participant sent by email
 */
router.get('/participants/:id/messages/:messageId/attachments/:index/url', asyncHandler(async (req: Request, res: Response) => {
  const { attachment } = await loadMessageAttachment(req.organisation!, req.params.id, req.params.messageId, Number(req.params.index));
  const url = await getStorageService().getUrl(attachment.storedPath);
  res.json({ url });
}));

/**
 * POST /api/organisation/participants/:id/messages/:messageId/attachments/:index/add
 * Add a file the participant sent by email to their documents (read by the AI like an upload)
 */
router.post('/participants/:id/messages/:messageId/attachments/:index/add', asyncHandler(async (req: Request, res: Response) => {
  const participantId = req.params.id;
  const index = Number(req.params.index);
  const { message, attachments, attachment } = await loadMessageAttachment(req.organisation!, participantId, req.params.messageId, index);
  if (!ADDABLE_TYPES.test(attachment.contentType)) throw new ValidationError('Only PDFs and images can be added to the documents');

  const existing = attachment.documentId
    ? await prisma.document.findFirst({ where: { id: attachment.documentId, participantId } })
    : null;
  if (existing) {
    res.json({ document: existing, duplicate: true });
    return;
  }

  const storage = getStorageService();
  const buffer = await storage.retrieve(attachment.storedPath);
  const contentHash = fileHash(buffer);
  let document = await findSameFile(participantId, buffer, contentHash);
  const duplicate = !!document;
  if (!document) {
    // A copy of its own, so deleting the document never touches the email's attachment
    const storedPath = `participants/${participantId}/documents/${uuidv4()}${path.extname(attachment.name).toLowerCase()}`;
    await storage.store({ buffer, originalname: attachment.name, mimetype: attachment.contentType, size: buffer.length }, storedPath);
    document = await prisma.document.create({
      data: {
        participantId,
        storedFilePath: storedPath,
        originalFilename: attachment.name,
        renamedFilename: attachment.name,
        mimeType: attachment.contentType,
        fileSize: buffer.length,
        documentType: 'OTHER',
        contentHash,
      },
    });
    await prisma.changeLogEntry.create({
      data: { participantId, userType: changeLogActor(req), fieldName: 'document.addedFromEmail', previousValue: null, newValue: attachment.name },
    });
    // Read by the AI like any upload, so it gets its type, amount and dates
    const { JourneyConsolidationService } = await import('../../services/ai/journeyConsolidationService.js');
    const { extractionContextFor } = await import('../../services/ai/extractionContext.js');
    new JourneyConsolidationService()
      .extractAndStoreDocumentData(document.id, buffer, attachment.contentType, { context: await extractionContextFor(participantId) })
      .catch((error) => console.error(`[Inbox] Extraction failed for ${document!.id}:`, error));
  }
  attachments[index] = { ...attachment, documentId: document.id };
  await prisma.participantMessage.update({ where: { id: message.id }, data: { attachments: JSON.stringify(attachments) } });
  res.json({ document, duplicate });
}));

/**
 * PATCH /api/organisation/participants/:id/green-travel-extra
 * The organiser decides the green travel extra (food + accommodation) for a
 * participant. Always paid on top of the maximum; allowed at any stage except
 * PAID; the participant is emailed when an amount changes.
 */
const greenTravelExtraSchema = z.object({
  foodEur: z.number().min(0).nullable(),
  accommodationEur: z.number().min(0).nullable(),
  note: z.string().max(500).nullish(),
  /** Email the participant about the new amounts (default yes) */
  notify: z.boolean().optional(),
});

router.patch('/participants/:id/green-travel-extra', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { project: true },
  });
  if (!participant) throw new NotFoundError('Participant not found');
  if (participant.project.organisationId !== org.id) throw new ForbiddenError('Access denied');
  if (participant.status === 'PAID') throw new ForbiddenError('This participant has already been paid');

  const result = greenTravelExtraSchema.safeParse(req.body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);

  const food = result.data.foodEur == null ? null : Math.round(result.data.foodEur * 100) / 100;
  const accommodation = result.data.accommodationEur == null ? null : Math.round(result.data.accommodationEur * 100) / 100;
  const note = result.data.note?.trim() || null;
  const foodChanged = (food ?? 0) !== (participant.greenTravelFoodEur ?? 0);
  const accommodationChanged = (accommodation ?? 0) !== (participant.greenTravelAccommodationEur ?? 0);

  const updated = await prisma.participant.update({
    where: { id: participantId },
    data: {
      greenTravelFoodEur: food,
      greenTravelAccommodationEur: accommodation,
      greenTravelExtraNote: note,
      greenTravelExtraUpdatedAt: new Date(),
    },
  });

  for (const [field, changed, before, after] of [
    ['food', foodChanged, participant.greenTravelFoodEur, food],
    ['accommodation', accommodationChanged, participant.greenTravelAccommodationEur, accommodation],
  ] as const) {
    if (!changed) continue;
    await prisma.changeLogEntry.create({
      data: {
        participantId,
        userType: changeLogActor(req),
        fieldName: `greenTravelExtra.${field}`,
        previousValue: String(before ?? ''),
        newValue: String(after ?? ''),
      },
    });
  }

  const { getAiService } = await import('../../services/ai/index.js');
  await getAiService().recalculateParticipantSummary(participantId);
  const summary = await prisma.reimbursementSummary.findUnique({ where: { participantId } });

  const emailed = (foodChanged || accommodationChanged) && result.data.notify !== false;
  if (emailed) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const magicLink = `${frontendUrl}/reimbursement?token=${participant.magicLinkToken}`;
    getEmailService()
      .sendGreenTravelExtra(
        participant.email,
        participant.firstName,
        participant.project.name,
        { foodEur: food ?? 0, accommodationEur: accommodation ?? 0, note, newTotalEur: summary?.amountToReimburse ?? 0 },
        magicLink,
        await projectEmailContext(participant.project, participant.id)
      )
      .catch((err: unknown) => console.error('[Email] Failed to send green travel extra notification:', err));
  }

  res.json({
    participant: {
      greenTravelFoodEur: updated.greenTravelFoodEur,
      greenTravelAccommodationEur: updated.greenTravelAccommodationEur,
      greenTravelExtraNote: updated.greenTravelExtraNote,
      greenTravelExtraUpdatedAt: updated.greenTravelExtraUpdatedAt,
    },
    reimbursementSummary: summary,
    emailed,
  });
}));

/**
 * PATCH /api/organisation/participants/:id/bank-details
 * The organiser corrects a participant's bank details (e.g. a missing or mistyped IBAN).
 * The IBAN must add up; the change is logged and the participant gets an email about it.
 */
const bankDetailsSchema = z.object({
  bankAccountIban: z.string().trim().min(1, 'The bank account number is required'),
  bankAccountHolderName: z.string().trim().min(1, 'The account holder is required'),
  bankAccountBic: z.string().trim().nullish(),
  bankName: z.string().trim().nullish(),
});

router.patch('/participants/:id/bank-details', asyncHandler(async (req: Request, res: Response) => {
  const participantId = req.params.id;
  const participant = await verifyOrgParticipant(req.organisation!, participantId);
  if (participant.status === 'PAID') throw new ForbiddenError('This participant has already been paid');
  const result = bankDetailsSchema.safeParse(req.body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  const iban = normaliseAccountNumber(result.data.bankAccountIban);
  const problem = bankAccountProblem(iban);
  if (problem) throw new ValidationError(problem);
  const bic = result.data.bankAccountBic ? result.data.bankAccountBic.replace(/\s/g, '').toUpperCase() : null;
  const data = {
    bankAccountIban: iban,
    bankAccountHolderName: result.data.bankAccountHolderName,
    bankAccountBic: bic,
    bankName: result.data.bankName || null,
  };

  await prisma.participant.update({ where: { id: participantId }, data });
  const changes: [string, string | null, string | null][] = [
    ['bankAccountIban', maskAccountNumber(participant.bankAccountIban), maskAccountNumber(iban)],
    ['bankAccountHolderName', participant.bankAccountHolderName, data.bankAccountHolderName],
    ['bankAccountBic', participant.bankAccountBic, bic],
    ['bankName', participant.bankName, data.bankName],
  ];
  for (const [field, before, after] of changes) {
    if ((before ?? '') === (after ?? '')) continue;
    await prisma.changeLogEntry.create({
      data: { participantId, userType: changeLogActor(req), fieldName: field, previousValue: before, newValue: after },
    });
  }

  const { getAiService } = await import('../../services/ai/index.js');
  await getAiService().recalculateParticipantSummary(participantId);

  // Always tell the participant, so a wrong change can't go unnoticed
  getEmailService()
    .sendBankDetailsChanged(
      participant.email,
      participant.firstName,
      participant.project.name,
      { holderName: data.bankAccountHolderName, maskedAccount: maskAccountNumber(iban), bic },
      await projectEmailContext(participant.project, participant.id)
    )
    .catch((err: unknown) => console.error('[Email] Failed to send bank details notification:', err));

  res.json({ success: true });
}));

/**
 * PATCH /api/organisation/participants/:id/no-reimbursement
 * Switch "doesn't need reimbursement" on or off (participants tick it themselves; while it is
 * on, nothing is paid and no bank details are needed)
 */
router.patch('/participants/:id/no-reimbursement', asyncHandler(async (req: Request, res: Response) => {
  const participantId = req.params.id;
  const participant = await verifyOrgParticipant(req.organisation!, participantId);
  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('This reimbursement is already approved');
  }
  const result = z.object({ noReimbursement: z.boolean() }).safeParse(req.body);
  if (!result.success) throw new ValidationError('noReimbursement must be true or false');
  const { noReimbursement } = result.data;

  if (participant.noReimbursement !== noReimbursement) {
    await prisma.participant.update({ where: { id: participantId }, data: { noReimbursement } });
    await prisma.changeLogEntry.create({
      data: {
        participantId,
        userType: changeLogActor(req),
        fieldName: 'noReimbursement',
        previousValue: participant.noReimbursement ? 'yes' : 'no',
        newValue: noReimbursement ? 'yes' : 'no',
      },
    });
  }
  const { getAiService } = await import('../../services/ai/index.js');
  await getAiService().recalculateParticipantSummary(participantId);
  const summary = await prisma.reimbursementSummary.findUnique({ where: { participantId } });
  res.json({ noReimbursement, summary });
}));

const RECEIPT_TYPES = ['HOTEL_INVOICE', 'MEAL_RECEIPT'] as const;

/**
 * PATCH /api/organisation/participants/:id/receipts/:docId
 * The organiser corrects what the AI read from a receipt (amount, currency, date, meal or hotel).
 * Corrected receipts keep these values when the receipts are read again.
 */
const receiptCorrectionSchema = z.object({
  amount: z.number().min(0).nullable(),
  currency: z.string().trim().length(3).transform((s) => s.toUpperCase()),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  documentType: z.enum(RECEIPT_TYPES),
});

router.patch('/participants/:id/receipts/:docId', asyncHandler(async (req: Request, res: Response) => {
  const participantId = req.params.id;
  const participant = await verifyOrgParticipant(req.organisation!, participantId);
  if (participant.status === 'PAID') throw new ForbiddenError('This participant has already been paid');
  const doc = await prisma.document.findFirst({ where: { id: req.params.docId, participantId }, include: { extraction: true } });
  if (!doc || !(RECEIPT_TYPES as readonly string[]).includes(doc.documentType)) throw new NotFoundError('Receipt not found');
  const result = receiptCorrectionSchema.safeParse(req.body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  const { amount, currency, documentDate, documentType } = result.data;
  const date = documentDate ? new Date(`${documentDate}T00:00:00Z`) : null;

  await prisma.documentExtraction.upsert({
    where: { documentId: doc.id },
    create: { documentId: doc.id, detectedDocumentType: documentType, confidence: 1, amount, currency, documentDate: date, correctedByOrganisation: true },
    update: { amount, currency, documentDate: date, detectedDocumentType: documentType, correctedByOrganisation: true },
  });
  if (doc.documentType !== documentType) await prisma.document.update({ where: { id: doc.id }, data: { documentType } });

  const before = doc.extraction
    ? `${doc.extraction.amount ?? '?'} ${doc.extraction.currency ?? ''} ${doc.extraction.documentDate?.toISOString().slice(0, 10) ?? 'no date'}`
    : 'not read';
  await prisma.changeLogEntry.create({
    data: {
      participantId,
      userType: changeLogActor(req),
      fieldName: 'receipt.corrected',
      previousValue: `${doc.renamedFilename}: ${before}`,
      newValue: `${amount ?? '?'} ${currency} ${documentDate ?? 'no date'} (${documentType === 'HOTEL_INVOICE' ? 'hotel' : 'meal'})`,
    },
  });
  res.json({ success: true });
}));

/**
 * POST /api/organisation/participants/:id/receipts/reread
 * Read the participant's receipts again with the trip as context (year, local currency).
 * Receipts the organiser corrected by hand are left alone.
 */
router.post('/participants/:id/receipts/reread', asyncHandler(async (req: Request, res: Response) => {
  const participantId = req.params.id;
  const participant = await verifyOrgParticipant(req.organisation!, participantId);
  if (participant.status === 'PAID') throw new ForbiddenError('This participant has already been paid');
  const docs = await prisma.document.findMany({
    where: { participantId, documentType: { in: [...RECEIPT_TYPES] } },
    include: { extraction: { select: { correctedByOrganisation: true } } },
  });
  const toRead = docs.filter((d) => !d.extraction?.correctedByOrganisation);
  const { JourneyConsolidationService } = await import('../../services/ai/journeyConsolidationService.js');
  const { extractionContextFor } = await import('../../services/ai/extractionContext.js');
  const service = new JourneyConsolidationService();
  const context = await extractionContextFor(participantId);
  const storage = getStorageService();
  let read = 0;
  // A few at a time keeps it quick without flooding the AI
  for (let i = 0; i < toRead.length; i += 3) {
    await Promise.all(
      toRead.slice(i, i + 3).map(async (d) => {
        try {
          const buffer = await storage.retrieve(d.storedFilePath);
          await service.extractAndStoreDocumentData(d.id, buffer, d.mimeType, { typeHint: d.documentType as (typeof RECEIPT_TYPES)[number], context });
          read++;
        } catch (err) {
          console.error(`[Receipts] Could not read ${d.id} again:`, err);
        }
      })
    );
  }
  await prisma.changeLogEntry.create({
    data: { participantId, userType: changeLogActor(req), fieldName: 'receipts.reread', previousValue: null, newValue: `${read} receipt(s) read again` },
  });
  res.json({ read, skippedCorrected: docs.length - toRead.length });
}));

/**
 * GET /api/organisation/participants/:id/audit-pdf
 * Generate and download the National Agency Audit PDF for a single approved participant.
 * Only available once the participant's file has been approved (ADMIN_APPROVED or PAID).
 */
router.get('/participants/:id/audit-pdf', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { project: true },
  });

  if (!participant) throw new NotFoundError('Participant not found');
  if (participant.project.organisationId !== org.id) throw new ForbiddenError('Access denied');

  if (participant.status !== 'ADMIN_APPROVED' && participant.status !== 'PAID') {
    throw new ForbiddenError('Audit PDF can only be generated for approved participants');
  }

  const pdfBuffer = await generateAuditPdf(participantId);

  const safeName = `${participant.firstName}_${participant.lastName}`.replace(/[^a-zA-Z0-9_]/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Audit_${safeName}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
}));

/**
 * GET /api/organisation/participants/:id/review-findings
 * Get stored AI review findings from database (generated once on participant submission)
 */
router.get('/participants/:id/review-findings', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { project: true },
  });

  if (!participant) {
    throw new NotFoundError('Participant not found');
  }

  if (participant.project.organisationId !== org.id) {
    throw new ForbiddenError('Access denied');
  }

  const findings = await prisma.aiReviewFinding.findMany({
    where: { participantId },
    orderBy: [
      { severity: 'asc' }, // critical first (alphabetical: c < i < info)
      { createdAt: 'asc' },
    ],
  });

  // Sort by severity priority: critical > important > info
  const severityOrder: Record<string, number> = { critical: 0, important: 1, info: 2 };
  findings.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  res.json({ findings: findings.map(withDocumentIds) });
}));

/**
 * POST /api/organisation/participants/:id/draft-message
 * AI draft of a short, friendly message to the participant listing what to fix, based on
 * the open (unticked) AI review findings. The organiser edits it before sending.
 */
router.post('/participants/:id/draft-message', asyncHandler(async (req: Request, res: Response) => {
  await verifyOrgParticipant(req.organisation!, req.params.id);
  const { draftMessageToParticipant } = await import('../../services/ai/participantAssistant.js');
  const { AiUnavailableError } = await import('../../services/ai/claudeJson.js');
  try {
    res.json({ message: await draftMessageToParticipant(req.params.id) });
  } catch (err) {
    if (err instanceof AiUnavailableError) throw new ValidationError('The AI is not available right now. Please write the message yourself.');
    throw err;
  }
}));

/** Findings with the ids of the documents they are about (stored as JSON) */
function withDocumentIds<T extends { documentIds: string | null }>(finding: T): Omit<T, 'documentIds'> & { documentIds: string[] } {
  return { ...finding, documentIds: parseJsonArray<string>(finding.documentIds) };
}

/**
 * PATCH /api/organisation/participants/:id/review-findings/:findingId/toggle
 * Toggle the checked status of an AI review finding
 */
router.patch('/participants/:id/review-findings/:findingId/toggle', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const { id: participantId, findingId } = req.params;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { project: true },
  });

  if (!participant) {
    throw new NotFoundError('Participant not found');
  }

  if (participant.project.organisationId !== org.id) {
    throw new ForbiddenError('Access denied');
  }

  const finding = await prisma.aiReviewFinding.findFirst({
    where: { id: findingId, participantId },
  });

  if (!finding) {
    throw new NotFoundError('Finding not found');
  }

  const updated = await prisma.aiReviewFinding.update({
    where: { id: findingId },
    data: { checked: !finding.checked },
  });

  res.json({ finding: updated });
}));

/**
 * POST /api/organisation/participants/:id/review-findings/refresh
 * Delete existing AI review findings and regenerate them
 */
router.post('/participants/:id/review-findings/refresh', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: {
      project: true,
      documents: { include: { extraction: true }, orderBy: [{ uploadDate: 'asc' }, { id: 'asc' }] },
      travelItems: {
        orderBy: { departureDate: 'asc' },
        include: { declarationsOfTravel: true },
      },
      declarationsOnHonor: true,
      declarationsOfTravel: true,
      reimbursementSummary: true,
      changeLogEntries: { orderBy: { changedAt: 'desc' }, take: 50 },
    },
  });

  if (!participant) {
    throw new NotFoundError('Participant not found');
  }

  if (participant.project.organisationId !== org.id) {
    throw new ForbiddenError('Access denied');
  }

  // The review sees the trips and files as they are at this moment
  const reviewStartedAt = new Date();

  // Delete all existing findings and mark review as pending
  await Promise.all([
    prisma.aiReviewFinding.deleteMany({ where: { participantId } }),
    prisma.participant.update({ where: { id: participantId }, data: { aiReviewStatus: AiReviewStatus.PENDING } }),
  ]);

  // Check if there's enough data to review
  if (participant.travelItems.length === 0 && participant.documents.length === 0) {
    res.json({ findings: [] });
    return;
  }

  participant.travelItems = sortTravelItemsByJourney(participant.travelItems);

  const countryLimit = await prisma.projectCountryLimit.findFirst({
    where: { projectId: participant.projectId, country: participant.country },
  });
  const effectiveLimit = getEffectiveLimit(participant, countryLimit);
  // Files other participants in the project claimed too (e.g. the fuel receipts of a shared car)
  const sharedDocs = await findSharedDocuments(participant.id);

  const { generateParticipantReview } = await import('../../services/ai/claudeAiService.js');
  const findings = await generateParticipantReview({
    participantName: `${participant.firstName} ${participant.lastName}`,
    participantCountry: participant.country,
    detectedHomeCountry: participant.detectedHomeCountry,
    homeCountryConfidence: participant.homeCountryConfidence,
    participantNote: participant.participantNote,
    consolidationSummary: participant.consolidationSummary,
    projectCountry: participant.project.country,
    projectStartDate: participant.project.startDate.toISOString().split('T')[0],
    projectEndDate: participant.project.endDate.toISOString().split('T')[0],
    maxReimbursementForCountry: effectiveLimit.maxReimbursement,
    greenTravel: effectiveLimit.greenTravel,
    greenTravelExtra: { foodEur: participant.greenTravelFoodEur, accommodationEur: participant.greenTravelAccommodationEur, note: participant.greenTravelExtraNote },
    requireAirlineDeclaration: participant.project.requireAirlineDeclaration,
    travelItems: participant.travelItems.map((item) => ({
      id: item.id,
      modeOfTransport: item.modeOfTransport,
      fromLocation: item.fromLocation,
      toLocation: item.toLocation,
      departureDate: item.departureDate?.toISOString().split('T')[0] || null,
      flightNumber: item.flightNumber,
      bookingReference: item.bookingReference,
      amountOriginal: item.amountOriginal,
      currencyOriginal: item.currencyOriginal,
      amountEur: item.amountEur,
      purchaseDate: item.purchaseDate?.toISOString().split('T')[0] || null,
      manuallyEdited: item.manuallyEdited,
      originalAmountFromAi: item.originalAmountFromAi,
      originalCurrencyFromAi: item.originalCurrencyFromAi,
      exchangeRateOverride: item.exchangeRateOverride,
      companyName: item.companyName,
      checked: item.checked,
      priceMissing: item.priceMissing,
      routeMatchesCountry: item.routeMatchesCountry,
      excludedFromReimbursement: item.excludedFromReimbursement,
      exclusionReason: item.exclusionReason,
      numberOfPassengers: item.numberOfPassengers,
      participantPortion: item.participantPortion,
      distanceKm: item.distanceKm,
      validationWarnings: item.validationWarnings,
      documentId: item.documentId,
      additionalDocumentIds: item.additionalDocumentIds,
      luggageDocumentId: item.luggageDocumentId,
      amountIncludedInRoundTrip: item.amountIncludedInRoundTrip,
      isRoundTrip: item.isRoundTrip,
      bookingId: item.bookingId,
      luggageAmount: item.luggageAmount,
      luggageAmountEur: item.luggageAmountEur,
      purchaseDateAutoFilled: item.purchaseDateAutoFilled,
      comment: item.comment,
      consolidationNotes: item.consolidationNotes,
    })),
    documents: participant.documents.map((doc) => ({
      id: doc.id,
      documentType: doc.documentType,
      originalFilename: doc.originalFilename,
      extraction: doc.extraction ? {
        confidence: doc.extraction.confidence,
        detectedDocumentType: doc.extraction.detectedDocumentType,
        passengerName: doc.extraction.passengerName,
        amount: doc.extraction.amount,
        currency: doc.extraction.currency,
        documentDate: doc.extraction.documentDate?.toISOString().slice(0, 10) ?? null,
        merchantName: doc.extraction.merchantName,
      } : null,
      sharedWith: (sharedDocs.get(doc.id) ?? []).map((s) => `${s.name} (${s.how})`),
    })),
    declarationsOnHonor: participant.declarationsOnHonor.map((d) => ({
      missingDocumentType: d.missingDocumentType,
      description: d.description,
      reason: d.reason,
    })),
    declarationsOfTravel: participant.declarationsOfTravel.map((d) => ({
      fromPlace: d.fromPlace,
      toPlace: d.toPlace,
      travelDate: d.travelDate?.toISOString().split('T')[0] || null,
      flightNumber: d.flightNumber,
      modeOfTransport: d.modeOfTransport,
    })),
    changeLogEntries: participant.changeLogEntries.map((e) => ({
      userType: e.userType,
      fieldName: e.fieldName,
      previousValue: e.previousValue,
      newValue: e.newValue,
    })),
    reimbursementSummary: participant.reimbursementSummary ? {
      totalEur: participant.reimbursementSummary.totalEur,
      maxReimbursementAllowed: participant.reimbursementSummary.maxReimbursementAllowed,
      amountToReimburse: participant.reimbursementSummary.amountToReimburse,
    } : null,
    bankDetailsComplete: !!(participant.bankAccountIban && participant.bankAccountHolderName && participant.bankAccountBic),
    noReimbursement: participant.noReimbursement,
    otherProjects: await findOtherProjectOverlaps(participant.id),
  }, { participantId: participant.id, projectId: participant.projectId });

  // Store new findings in DB (including travelItemId link)
  if (findings.length > 0) {
    await prisma.aiReviewFinding.createMany({
      data: findings.map((f) => ({
        participantId,
        severity: f.severity,
        message: f.message,
        category: f.category,
        travelItemId: (f as any).travelItemId || null,
        documentIds: f.documentIds?.length ? JSON.stringify(f.documentIds) : null,
      })),
    });
  }

  // Fetch the stored findings with IDs
  const storedFindings = await prisma.aiReviewFinding.findMany({
    where: { participantId },
    orderBy: { createdAt: 'asc' },
  });

  const severityOrder: Record<string, number> = { critical: 0, important: 1, info: 2 };
  storedFindings.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  // Mark review as complete
  await prisma.participant.update({
    where: { id: participantId },
    data: { aiReviewStatus: AiReviewStatus.COMPLETE, aiReviewedAt: reviewStartedAt },
  });

  res.json({ findings: storedFindings.map(withDocumentIds) });
}));

/**
 * PATCH /api/organisation/participants/:id
 * Update participant
 */
const updateParticipantSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  country: z.string().min(1).optional(),
  notesInternal: z.string().optional(),
  // Individual limit overrides (null = back to the country default)
  maxReimbursementOverride: z.number().min(0).nullable().optional(),
  greenTravelOverride: z.boolean().nullable().optional(),
});

router.patch('/participants/:id', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { project: true },
  });

  if (!participant) {
    throw new NotFoundError('Participant not found');
  }

  if (participant.project.organisationId !== org.id) {
    throw new ForbiddenError('Access denied');
  }

  const result = updateParticipantSchema.safeParse(req.body);
  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const updated = await prisma.participant.update({
    where: { id: participantId },
    data: result.data,
  });

  // Anything that changes the applicable limit must recompute the payable
  // amount and leave a trace in the change log.
  const limitFields = ['country', 'maxReimbursementOverride', 'greenTravelOverride'] as const;
  const changedLimitFields = limitFields.filter(
    (f) => f in result.data && (result.data as Record<string, unknown>)[f] !== (participant as Record<string, unknown>)[f]
  );
  if (changedLimitFields.length > 0) {
    for (const field of changedLimitFields) {
      await prisma.changeLogEntry.create({
        data: {
          participantId,
          userType: changeLogActor(req),
          fieldName: `participant.${field}`,
          previousValue: String((participant as Record<string, unknown>)[field] ?? ''),
          newValue: String((result.data as Record<string, unknown>)[field] ?? ''),
        },
      });
    }
    const { getAiService } = await import('../../services/ai/index.js');
    await getAiService().recalculateParticipantSummary(participantId);
  }

  res.json({ participant: updated });
}));

/**
 * DELETE /api/organisation/participants/:id
 * Delete participant
 */
router.delete('/participants/:id', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { project: true },
  });

  if (!participant) {
    throw new NotFoundError('Participant not found');
  }

  if (participant.project.organisationId !== org.id) {
    throw new ForbiddenError('Access denied');
  }

  // Delete all related data
  await prisma.$transaction([
    prisma.aiReviewFinding.deleteMany({ where: { participantId } }),
    prisma.changeLogEntry.deleteMany({ where: { participantId } }),
    prisma.declarationOfTravel.deleteMany({ where: { participantId } }),
    prisma.declarationOnHonor.deleteMany({ where: { participantId } }),
    prisma.travelItem.deleteMany({ where: { participantId } }),
    prisma.document.deleteMany({ where: { participantId } }),
    prisma.reimbursementSummary.deleteMany({ where: { participantId } }),
    prisma.socialMediaPost.deleteMany({ where: { participantId } }),
    prisma.participant.delete({ where: { id: participantId } }),
  ]);

  res.json({ success: true });
}));

/**
 * POST /api/organisation/participants/bulk-delete
 * Delete multiple participants at once
 */
router.post('/participants/bulk-delete', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const { ids } = req.body as { ids: string[] };

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ValidationError('ids must be a non-empty array');
  }

  // Verify all participants belong to this organisation
  const participants = await prisma.participant.findMany({
    where: { id: { in: ids } },
    include: { project: true },
  });

  for (const p of participants) {
    if (p.project.organisationId !== org.id) {
      throw new ForbiddenError('Access denied to one or more participants');
    }
  }

  // Delete all in a transaction
  for (const participantId of ids) {
    await prisma.$transaction([
      prisma.aiReviewFinding.deleteMany({ where: { participantId } }),
      prisma.changeLogEntry.deleteMany({ where: { participantId } }),
      prisma.declarationOfTravel.deleteMany({ where: { participantId } }),
      prisma.declarationOnHonor.deleteMany({ where: { participantId } }),
      prisma.travelItem.deleteMany({ where: { participantId } }),
      prisma.document.deleteMany({ where: { participantId } }),
      prisma.reimbursementSummary.deleteMany({ where: { participantId } }),
      prisma.socialMediaPost.deleteMany({ where: { participantId } }),
      prisma.participant.delete({ where: { id: participantId } }),
    ]);
  }

  res.json({ success: true, deletedCount: ids.length });
}));

/**
 * POST /api/organisation/participants/:id/send-magic-link
 * Send magic link to participant
 */
router.post('/participants/:id/send-magic-link', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { project: true },
  });

  if (!participant) {
    throw new NotFoundError('Participant not found');
  }

  if (participant.project.organisationId !== org.id) {
    throw new ForbiddenError('Access denied');
  }

  // Send the email
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const magicLink = `${frontendUrl}/reimbursement?token=${participant.magicLinkToken}`;

  const emailService = getEmailService();
  await emailService.sendMagicLink(
    participant.email,
    participant.firstName,
    participant.project.name,
    magicLink,
    await projectEmailContext(participant.project, participant.id)
  );

  // Update last sent timestamp and refresh token expiry (180 days from project end, or 180 days from now if past end)
  const newExpiry = new Date(Math.max(participant.project.endDate.getTime(), Date.now()) + 180 * 24 * 60 * 60 * 1000);
  await prisma.participant.update({
    where: { id: participantId },
    data: { lastMagicLinkSentAt: new Date(), tokenExpiresAt: newExpiry },
  });

  res.json({ success: true });
}));

/**
 * POST /api/organisation/participants/:id/rebuild-trips
 * Rebuild a participant's trips from their current documents: existing trips
 * and bookings are deleted, documents are kept, the AI runs again. For
 * participants who are not yet approved.
 */
router.post('/participants/:id/rebuild-trips', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { project: true, _count: { select: { documents: true } } },
  });
  if (!participant) throw new NotFoundError('Participant not found');
  if (participant.project.organisationId !== org.id) throw new ForbiddenError('Access denied');
  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Trips can no longer be rebuilt after approval');
  }
  if (participant._count.documents === 0) throw new ValidationError('This participant has no documents to rebuild from');

  const { JourneyConsolidationService } = await import('../../services/ai/journeyConsolidationService.js');
  const result = await new JourneyConsolidationService().consolidateParticipantJourney(participantId, { fresh: true });

  const { getAiService } = await import('../../services/ai/index.js');
  await getAiService().recalculateParticipantSummary(participantId);

  await prisma.changeLogEntry.create({
    data: {
      participantId,
      userType: changeLogActor(req),
      fieldName: 'travelItems.rebuilt',
      previousValue: '',
      newValue: result.success ? `Rebuilt ${result.travelItems.length} trip(s) from documents` : `Rebuild failed: ${result.message}`,
    },
  });

  if (!result.success) {
    res.status(422).json({ success: false, message: result.message, unreadableDocuments: result.unreadableDocuments ?? [] });
    return;
  }
  res.json({ success: true, travelItems: result.travelItems.length, unreadableDocuments: result.unreadableDocuments ?? [] });
}));

/**
 * POST /api/organisation/participants/:id/reset
 * Reset a participant: delete all uploaded files, travel items, and extracted data,
 * reset status to DRAFT, and re-send the magic link so they can start fresh.
 */
router.post('/participants/:id/reset', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { project: true, documents: true },
  });

  if (!participant) {
    throw new NotFoundError('Participant not found');
  }

  if (participant.project.organisationId !== org.id) {
    throw new ForbiddenError('Access denied');
  }

  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Cannot reset a participant that has been approved or paid');
  }

  // Delete uploaded files from storage
  const storage = getStorageService();
  for (const doc of participant.documents) {
    try {
      await storage.delete(doc.storedFilePath);
    } catch (err) {
      console.error(`[Reset] Failed to delete file ${doc.storedFilePath}:`, err);
    }
  }

  // Delete all participant data except the participant record itself
  await prisma.$transaction([
    prisma.aiReviewFinding.deleteMany({ where: { participantId } }),
    prisma.changeLogEntry.deleteMany({ where: { participantId } }),
    prisma.declarationOfTravel.deleteMany({ where: { participantId } }),
    prisma.declarationOnHonor.deleteMany({ where: { participantId } }),
    prisma.travelBooking.deleteMany({ where: { participantId } }),
    prisma.travelItem.deleteMany({ where: { participantId } }),
    prisma.document.deleteMany({ where: { participantId } }),
    prisma.reimbursementSummary.deleteMany({ where: { participantId } }),
    prisma.socialMediaPost.deleteMany({ where: { participantId } }),
    prisma.participant.update({
      where: { id: participantId },
      data: {
        status: 'DRAFT',
        journeyConsolidatedAt: null,
        noReimbursement: false,
        detectedHomeCountry: null,
        homeCountryConfidence: null,
        homeCountryReasoning: null,
        participantNote: null,
        bankAccountIban: null,
        bankAccountHolderName: null,
        bankAccountBic: null,
        bankName: null,
        personalAddress: null,
        personalCity: null,
        personalPostalCode: null,
        personalCountry: null,
      },
    }),
  ]);

  // Re-send the magic link so participant can start fresh
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const magicLink = `${frontendUrl}/reimbursement?token=${participant.magicLinkToken}`;
  const emailService = getEmailService();
  await emailService.sendMagicLink(
    participant.email,
    participant.firstName,
    participant.project.name,
    magicLink,
    await projectEmailContext(participant.project, participant.id)
  );
  await prisma.participant.update({
    where: { id: participantId },
    data: { lastMagicLinkSentAt: new Date() },
  });

  res.json({ success: true });
}));

/**
 * POST /api/organisation/participants/send-magic-links-bulk
 * Send magic links to multiple participants
 */
router.post('/participants/send-magic-links-bulk', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const { participantIds } = req.body;

  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    throw new ValidationError('participantIds must be a non-empty array');
  }

  const results: { id: string; success: boolean }[] = [];

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const emailService = getEmailService();

  for (const id of participantIds) {
    try {
      const participant = await prisma.participant.findUnique({
        where: { id },
        include: { project: true },
      });

      if (!participant || participant.project.organisationId !== org.id) {
        results.push({ id, success: false });
        continue;
      }

      const magicLink = `${frontendUrl}/reimbursement?token=${participant.magicLinkToken}`;
      await emailService.sendMagicLink(
        participant.email,
        participant.firstName,
        participant.project.name,
        magicLink,
        await projectEmailContext(participant.project, participant.id)
      );

      const newExpiry = new Date(Math.max(participant.project.endDate.getTime(), Date.now()) + 180 * 24 * 60 * 60 * 1000);
      await prisma.participant.update({
        where: { id },
        data: { lastMagicLinkSentAt: new Date(), tokenExpiresAt: newExpiry },
      });

      results.push({ id, success: true });
    } catch {
      results.push({ id, success: false });
    }
  }

  res.json({ results });
}));

/**
 * POST /api/organisation/participants/:id/send-reminder
 * Send a reminder email to a participant who hasn't submitted yet
 */
router.post('/participants/:id/send-reminder', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { project: { include: { organisation: true } } },
  });

  if (!participant) {
    throw new NotFoundError('Participant not found');
  }

  if (participant.project.organisationId !== org.id) {
    throw new ForbiddenError('Access denied');
  }

  if (participant.status !== 'DRAFT') {
    throw new ValidationError('Participant has already submitted their reimbursement');
  }

  // Send reminder email
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const magicLink = `${frontendUrl}/reimbursement?token=${participant.magicLinkToken}`;

  const emailService = getEmailService();
  await emailService.sendReminder(
    participant.email,
    participant.firstName,
    participant.project.name,
    magicLink,
    participant.project.organisation.name,
    await projectEmailContext(participant.project, participant.id)
  );

  res.json({ success: true });
}));

/**
 * POST /api/organisation/participants/send-reminders-bulk
 * Send reminder emails to multiple participants who haven't submitted
 */
router.post('/participants/send-reminders-bulk', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const { participantIds } = req.body;

  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    throw new ValidationError('participantIds must be a non-empty array');
  }

  const results: { id: string; success: boolean }[] = [];
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const emailService = getEmailService();

  for (const id of participantIds) {
    try {
      const participant = await prisma.participant.findUnique({
        where: { id },
        include: { project: { include: { organisation: true } } },
      });

      if (!participant || participant.project.organisationId !== org.id || participant.status !== 'DRAFT') {
        results.push({ id, success: false });
        continue;
      }

      const magicLink = `${frontendUrl}/reimbursement?token=${participant.magicLinkToken}`;
      await emailService.sendReminder(
        participant.email,
        participant.firstName,
        participant.project.name,
        magicLink,
        participant.project.organisation.name,
        await projectEmailContext(participant.project, participant.id)
      );

      results.push({ id, success: true });
    } catch {
      results.push({ id, success: false });
    }
  }

  res.json({ results });
}));

/**
 * POST /api/organisation/participants/:id/approve
 * Approve participant for reimbursement
 */
router.post('/participants/:id/approve', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;
  const { amountToReimburse, adminNotes } = req.body;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { project: true, reimbursementSummary: true },
  });

  if (!participant) {
    throw new NotFoundError('Participant not found');
  }

  if (participant.project.organisationId !== org.id) {
    throw new ForbiddenError('Access denied');
  }

  // Update status and reimbursement summary
  await prisma.$transaction([
    prisma.participant.update({
      where: { id: participantId },
      data: { status: 'ADMIN_APPROVED' },
    }),
    prisma.reimbursementSummary.update({
      where: { participantId },
      data: {
        adminApproved: true,
        adminNotes: adminNotes || null,
        amountToReimburse: amountToReimburse ?? participant.reimbursementSummary?.amountToReimburse ?? 0,
      },
    }),
    prisma.changeLogEntry.create({
      data: {
        participantId,
        userType: 'ADMIN',
        fieldName: 'status',
        previousValue: participant.status,
        newValue: 'ADMIN_APPROVED',
      },
    }),
  ]);

  // Send approval notification email (fire and forget)
  const approvedAmount = amountToReimburse ?? participant.reimbursementSummary?.amountToReimburse ?? 0;
  const emailService = getEmailService();
  emailService.sendApprovalNotification(
    participant.email,
    participant.firstName,
    participant.project.name,
    approvedAmount,
    await projectEmailContext(participant.project, participant.id)
  ).catch((err) => console.error('[Email] Failed to send approval notification:', err));

  res.json({ success: true });
}));

/**
 * POST /api/organisation/participants/:id/mark-paid
 * Mark participant as paid
 */
router.post('/participants/:id/mark-paid', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { project: true, reimbursementSummary: true },
  });

  if (!participant) {
    throw new NotFoundError('Participant not found');
  }

  if (participant.project.organisationId !== org.id) {
    throw new ForbiddenError('Access denied');
  }

  await prisma.$transaction([
    prisma.participant.update({
      where: { id: participantId },
      data: { status: 'PAID' },
    }),
    prisma.reimbursementSummary.update({
      where: { participantId },
      data: { paid: true },
    }),
    prisma.changeLogEntry.create({
      data: {
        participantId,
        userType: 'ADMIN',
        fieldName: 'status',
        previousValue: participant.status,
        newValue: 'PAID',
      },
    }),
  ]);

  // Send payment notification email (fire and forget)
  const paidAmount = participant.reimbursementSummary?.amountToReimburse ?? 0;
  const emailService = getEmailService();
  emailService.sendPaymentNotification(
    participant.email,
    participant.firstName,
    participant.project.name,
    paidAmount,
    await projectEmailContext(participant.project, participant.id)
  ).catch((err) => console.error('[Email] Failed to send payment notification:', err));

  res.json({ success: true });
}));

/**
 * POST /api/organisation/participants/:id/mark-ai-check-ok
 * Mark AI check as OK
 */
router.post('/participants/:id/mark-ai-check-ok', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { project: true },
  });

  if (!participant) {
    throw new NotFoundError('Participant not found');
  }

  if (participant.project.organisationId !== org.id) {
    throw new ForbiddenError('Access denied');
  }

  await prisma.reimbursementSummary.update({
    where: { participantId },
    data: { aiCheckOk: true },
  });

  res.json({ success: true });
}));

/**
 * GET /api/organisation/participants/:id/documents/:docId/url
 * Get presigned URL for document
 */
router.get('/participants/:id/documents/:docId/url', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const { id: participantId, docId } = req.params;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { project: true },
  });

  if (!participant || participant.project.organisationId !== org.id) {
    throw new ForbiddenError('Access denied');
  }

  const document = await prisma.document.findUnique({
    where: { id: docId },
  });

  if (!document || document.participantId !== participantId) {
    throw new NotFoundError('Document not found');
  }

  const storage = getStorageService();
  const url = await storage.getUrl(document.storedFilePath);

  res.json({ url });
}));

// =============================================================================
// ORGANISATION TRAVEL ITEM & DOCUMENT CRUD
// =============================================================================

const orgCreateTravelItemSchema = z.object({
  modeOfTransport: z.nativeEnum(TransportMode),
  fromLocation: z.string().min(1),
  toLocation: z.string().min(1),
  departureDate: z.string().transform((s) => new Date(s)),
  arrivalDate: z.string().transform((s) => new Date(s)).nullable().optional(),
  bookingReference: z.string().nullable().optional(),
  flightNumber: z.string().nullable().optional(),
  amountOriginal: z.number(),
  currencyOriginal: z.string().default('EUR'),
  purchaseDate: z.string().transform((s) => new Date(s)).nullable().optional(),
  amountEur: z.number(),
  comment: z.string().nullable().optional(),
  documentId: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  // Luggage or other extras bought separately, in EUR (added on top of the fare)
  luggageAmountEur: z.number().min(0).nullable().optional(),
});

const orgUpdateTravelItemSchema = z.object({
  modeOfTransport: z.nativeEnum(TransportMode).optional(),
  fromLocation: z.string().optional(),
  toLocation: z.string().optional(),
  departureDate: z.string().transform((s) => new Date(s)).optional(),
  arrivalDate: z.string().transform((s) => new Date(s)).nullable().optional(),
  bookingReference: z.string().nullable().optional(),
  flightNumber: z.string().nullable().optional(),
  amountOriginal: z.number().optional(),
  currencyOriginal: z.string().optional(),
  purchaseDate: z.string().transform((s) => new Date(s)).nullable().optional(),
  amountEur: z.number().optional(),
  comment: z.string().nullable().optional(),
  excludedFromReimbursement: z.boolean().optional(),
  // ORGANISATION = the organisation decided not to reimburse this trip (participants cannot undo it)
  exclusionReason: z.enum(['HOSTING_ORG_PAID', 'OTHER', 'ORGANISATION']).nullable().optional(),
  exchangeRateOverride: z.number().nullable().optional(),
  companyName: z.string().nullable().optional(),
  // Luggage or other extras bought separately, in EUR (added on top of the fare)
  luggageAmountEur: z.number().min(0).nullable().optional(),
});

/** Helper: verify org owns participant */
async function verifyOrgParticipant(org: Organisation, participantId: string) {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { project: true, reimbursementSummary: true },
  });
  if (!participant) throw new NotFoundError('Participant not found');
  if (participant.project.organisationId !== org.id) throw new ForbiddenError('Access denied');
  return participant;
}

/**
 * POST /api/organisation/participants/:id/travel-items
 * Create a travel item
 */
router.post('/participants/:id/travel-items', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;
  await verifyOrgParticipant(org, participantId);

  const result = orgCreateTravelItemSchema.safeParse(req.body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);

  const travelItem = await prisma.travelItem.create({
    data: { participantId, ...result.data, luggageAmount: result.data.luggageAmountEur ?? null },
  });

  await prisma.changeLogEntry.create({
    data: {
      participantId,
      userType: changeLogActor(req),
      fieldName: 'travelItem.created',
      previousValue: null,
      newValue: `${result.data.fromLocation} → ${result.data.toLocation}`,
    },
  });

  const { getAiService } = await import('../../services/ai/index.js');
  const aiService = getAiService();
  await aiService.recalculateParticipantSummary(participantId);

  res.status(201).json(travelItem);
}));

/**
 * PATCH /api/organisation/participants/:id/travel-items/:itemId
 * Update a travel item
 */
router.patch('/participants/:id/travel-items/:itemId', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;
  await verifyOrgParticipant(org, participantId);

  const result = orgUpdateTravelItemSchema.safeParse(req.body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);

  const current = await prisma.travelItem.findUnique({ where: { id: req.params.itemId } });
  if (!current || current.participantId !== participantId) throw new NotFoundError('Travel item not found');

  // Handle exchange rate override: recalculate amountEur
  const updateData = { ...result.data } as Record<string, unknown>;
  // A trip moved to another day loses its place in the old day's manual order
  if (result.data.departureDate && result.data.departureDate.getTime() !== current.departureDate.getTime()) {
    updateData.sortOrder = null;
  }

  // Luggage / extras typed by the organiser are in EUR; an unchanged value keeps the original currency
  if ('luggageAmountEur' in result.data) {
    if ((result.data.luggageAmountEur ?? null) !== (current.luggageAmountEur ?? null)) {
      updateData.luggageAmount = result.data.luggageAmountEur ?? null;
    } else {
      delete updateData.luggageAmountEur;
    }
  }

  // A new purchase date changes the exchange rate (unless the organiser set the rate by hand);
  // without a purchase date the travel date is used
  if (result.data.purchaseDate !== undefined) {
    const newPurchase = result.data.purchaseDate;
    const changed = (newPurchase?.getTime() ?? null) !== (current.purchaseDate?.getTime() ?? null);
    if (changed) {
      updateData.purchaseDateAutoFilled = false;
      if (!('amountEur' in result.data) && current.amountOriginal != null && current.currencyOriginal !== 'EUR' && current.exchangeRateOverride == null) {
        updateData.amountEur = await convertToEurForParticipant(participantId, current.amountOriginal, current.currencyOriginal, newPurchase ?? current.departureDate);
      }
    }
  }
  if ('exchangeRateOverride' in result.data) {
    if (result.data.exchangeRateOverride != null && current.amountOriginal != null) {
      // Manual override: amountEur = amountOriginal * overrideRate
      updateData.amountEur = current.amountOriginal * result.data.exchangeRateOverride;
    } else if (result.data.exchangeRateOverride === null && current.amountOriginal != null && current.currencyOriginal !== 'EUR') {
      // Cleared override: recalculate using the project's exchange-rate mode + overrides
      const { convertToEurForParticipant } = await import('../../services/exchangeRate/index.js');
      updateData.amountEur = await convertToEurForParticipant(participantId, current.amountOriginal, current.currencyOriginal, current.purchaseDate ?? undefined);
    }
  }

  const travelItem = await prisma.travelItem.update({
    where: { id: req.params.itemId },
    data: updateData,
  });

  // Create changelog entries for changed fields
  for (const [field, newValue] of Object.entries(result.data)) {
    const previousValue = (current as Record<string, unknown>)[field];
    if (previousValue !== newValue) {
      await prisma.changeLogEntry.create({
        data: {
          participantId,
          userType: changeLogActor(req),
          fieldName: `travelItem.${field}`,
          previousValue: String(previousValue ?? ''),
          newValue: String(newValue ?? ''),
        },
      });
    }
  }

  const { getAiService } = await import('../../services/ai/index.js');
  const aiService = getAiService();
  await aiService.recalculateParticipantSummary(participantId);

  res.json(travelItem);
}));

/**
 * POST /api/organisation/participants/:id/travel-items/:itemId/move
 * Move a trip one place up or down within its day. The dates still decide the order of
 * the days; the organiser's order is saved for that day and used everywhere (incl. the PDF).
 */
router.post('/participants/:id/travel-items/:itemId/move', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;
  await verifyOrgParticipant(org, participantId);
  const direction = req.body?.direction;
  if (direction !== 'up' && direction !== 'down') throw new ValidationError('direction must be "up" or "down"');

  const ordered = sortTravelItemsByJourney(await prisma.travelItem.findMany({ where: { participantId } }));
  const target = ordered.find((i) => i.id === req.params.itemId);
  if (!target) throw new NotFoundError('Travel item not found');
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const sameDay = ordered.filter((i) => day(i.departureDate) === day(target.departureDate));
  const from = sameDay.indexOf(target);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= sameDay.length) {
    throw new ValidationError(direction === 'up' ? 'This is already the first trip of that day' : 'This is already the last trip of that day');
  }
  [sameDay[from], sameDay[to]] = [sameDay[to], sameDay[from]];
  await prisma.$transaction(
    sameDay.map((item, index) => prisma.travelItem.update({ where: { id: item.id }, data: { sortOrder: index } }))
  );
  await prisma.changeLogEntry.create({
    data: {
      participantId,
      userType: changeLogActor(req),
      fieldName: 'travelItem.order',
      previousValue: `${target.fromLocation} → ${target.toLocation}`,
      newValue: `moved ${direction}`,
    },
  });
  res.json({ success: true });
}));

/**
 * DELETE /api/organisation/participants/:id/travel-items/:itemId
 * Delete a travel item
 */
router.delete('/participants/:id/travel-items/:itemId', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;
  await verifyOrgParticipant(org, participantId);

  const item = await prisma.travelItem.findUnique({ where: { id: req.params.itemId } });
  if (!item || item.participantId !== participantId) throw new NotFoundError('Travel item not found');

  await prisma.travelItem.delete({ where: { id: req.params.itemId } });

  await prisma.changeLogEntry.create({
    data: {
      participantId,
      userType: changeLogActor(req),
      fieldName: 'travelItem.deleted',
      previousValue: `${item.fromLocation} → ${item.toLocation}`,
      newValue: null,
    },
  });

  const { getAiService } = await import('../../services/ai/index.js');
  const aiService = getAiService();
  await aiService.recalculateParticipantSummary(participantId);

  res.json({ success: true });
}));

/**
 * POST /api/organisation/participants/:id/documents/upload
 * Upload a document for a participant
 */
router.post('/participants/:id/documents/upload', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;
  await verifyOrgParticipant(org, participantId);

  if (!req.file) throw new ValidationError('No file uploaded');

  const documentType = (req.body.documentType as string) || 'OTHER';

  // The same file is kept once: return the copy the participant already has
  const contentHash = fileHash(req.file.buffer);
  const sameFile = await findSameFile(participantId, req.file.buffer, contentHash);
  if (sameFile) {
    const document =
      sameFile.documentType === 'OTHER' && documentType !== 'OTHER'
        ? await prisma.document.update({ where: { id: sameFile.id }, data: { documentType: documentType as DocumentType } })
        : sameFile;
    res.status(200).json({ ...document, duplicate: true });
    return;
  }

  // Repair PDFs with junk before the header; refuse files that aren't PDFs at all
  let fileBuffer = req.file.buffer;
  if (req.file.mimetype.includes('pdf')) {
    const sanitized = sanitizePdfBuffer(fileBuffer);
    if (!sanitized) throw new ValidationError("This file isn't a readable PDF — please re-download it or upload a screenshot or photo instead.");
    fileBuffer = sanitized.buffer;
  }

  const storage = getStorageService();
  const storedPath = `participants/${participantId}/documents/${uuidv4()}-${req.file.originalname}`;
  await storage.store(
    { buffer: fileBuffer, originalname: req.file.originalname, mimetype: req.file.mimetype, size: fileBuffer.length },
    storedPath
  );

  const document = await prisma.document.create({
    data: {
      participantId,
      storedFilePath: storedPath,
      originalFilename: req.file.originalname,
      renamedFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: fileBuffer.length,
      documentType: documentType as DocumentType,
      contentHash,
    },
  });

  await prisma.changeLogEntry.create({
    data: {
      participantId,
      userType: changeLogActor(req),
      fieldName: 'document.uploaded',
      previousValue: null,
      newValue: req.file.originalname,
    },
  });

  // Receipts uploaded by the organiser get the same quick amount/date read as
  // participant uploads, so they show up with amounts in the green-travel card
  if (documentType === 'HOTEL_INVOICE' || documentType === 'MEAL_RECEIPT') {
    const { JourneyConsolidationService } = await import('../../services/ai/journeyConsolidationService.js');
    const { extractionContextFor } = await import('../../services/ai/extractionContext.js');
    new JourneyConsolidationService()
      .extractAndStoreDocumentData(document.id, fileBuffer, req.file.mimetype, { typeHint: documentType, context: await extractionContextFor(participantId) })
      .catch((error) => console.error(`[OrgUpload] Receipt extraction failed for ${document.id}:`, error));
  }

  res.status(201).json(document);
}));

/**
 * DELETE /api/organisation/participants/:id/documents/:docId
 * Delete a document
 */
router.delete('/participants/:id/documents/:docId', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;
  await verifyOrgParticipant(org, participantId);

  const doc = await prisma.document.findUnique({ where: { id: req.params.docId } });
  if (!doc || doc.participantId !== participantId) throw new NotFoundError('Document not found');

  const storage = getStorageService();
  await storage.delete(doc.storedFilePath);
  await prisma.document.delete({ where: { id: req.params.docId } });

  await prisma.changeLogEntry.create({
    data: {
      participantId,
      userType: changeLogActor(req),
      fieldName: 'document.deleted',
      previousValue: doc.originalFilename,
      newValue: null,
    },
  });

  res.json({ success: true });
}));

/**
 * POST /api/organisation/participants/:id/travel-items/:itemId/link-document
 * Link a document to a travel item
 */
router.post('/participants/:id/travel-items/:itemId/link-document', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;
  await verifyOrgParticipant(org, participantId);

  const { documentId } = req.body;
  if (!documentId) throw new ValidationError('documentId is required');

  const item = await prisma.travelItem.findUnique({ where: { id: req.params.itemId } });
  if (!item || item.participantId !== participantId) throw new NotFoundError('Travel item not found');

  // If no primary doc, set as primary; otherwise add to additional
  if (!item.documentId) {
    await prisma.travelItem.update({
      where: { id: req.params.itemId },
      data: { documentId },
    });
  } else {
    const existing: string[] = item.additionalDocumentIds ? JSON.parse(item.additionalDocumentIds) : [];
    if (!existing.includes(documentId)) {
      existing.push(documentId);
      await prisma.travelItem.update({
        where: { id: req.params.itemId },
        data: { additionalDocumentIds: JSON.stringify(existing) },
      });
    }
  }

  res.json({ success: true });
}));

/**
 * DELETE /api/organisation/participants/:id/travel-items/:itemId/link-document
 * Unlink a document from a travel item
 */
router.delete('/participants/:id/travel-items/:itemId/link-document', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;
  await verifyOrgParticipant(org, participantId);

  const { documentId } = req.body;
  if (!documentId) throw new ValidationError('documentId is required');

  const item = await prisma.travelItem.findUnique({ where: { id: req.params.itemId } });
  if (!item || item.participantId !== participantId) throw new NotFoundError('Travel item not found');

  if (item.documentId === documentId) {
    await prisma.travelItem.update({
      where: { id: req.params.itemId },
      data: { documentId: null },
    });
  } else if (item.additionalDocumentIds) {
    const existing: string[] = JSON.parse(item.additionalDocumentIds);
    const filtered = existing.filter(id => id !== documentId);
    await prisma.travelItem.update({
      where: { id: req.params.itemId },
      data: { additionalDocumentIds: JSON.stringify(filtered) },
    });
  }

  res.json({ success: true });
}));

/**
 * POST /api/organisation/participants/:id/recalculate-summary
 * Recalculate reimbursement summary
 */
router.post('/participants/:id/recalculate-summary', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;
  await verifyOrgParticipant(org, participantId);

  const { getAiService } = await import('../../services/ai/index.js');
  const aiService = getAiService();
  await aiService.recalculateParticipantSummary(participantId);

  const summary = await prisma.reimbursementSummary.findUnique({ where: { participantId } });
  res.json({ summary });
}));

// =============================================================================
// REOPEN REIMBURSEMENT
// =============================================================================

/**
 * POST /api/organisation/participants/:id/reopen
 * Reopen a submitted/approved reimbursement so participant can edit again
 */
router.post('/participants/:id/reopen', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const participantId = req.params.id;
  const participant = await verifyOrgParticipant(org, participantId);

  const { message, clearAiReview, clearTravelItems, clearDocuments } = req.body;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    throw new ValidationError('A message to the participant is required');
  }

  if (participant.status !== 'PARTICIPANT_COMPLETE' && participant.status !== 'ADMIN_APPROVED') {
    throw new ValidationError(`Cannot reopen a reimbursement with status "${participant.status}". Only PARTICIPANT_COMPLETE or ADMIN_APPROVED can be reopened.`);
  }

  // Perform optional cleanup
  if (clearAiReview) {
    await prisma.aiReviewFinding.deleteMany({ where: { participantId } });
  }
  if (clearTravelItems) {
    await prisma.travelItem.deleteMany({ where: { participantId } });
    await prisma.travelBooking.deleteMany({ where: { participantId } });
  }
  if (clearDocuments) {
    const docs = await prisma.document.findMany({ where: { participantId } });
    const storage = getStorageService();
    for (const doc of docs) {
      await storage.delete(doc.storedFilePath).catch(() => {});
    }
    await prisma.document.deleteMany({ where: { participantId } });
  }

  // Reset status
  await prisma.$transaction([
    prisma.participant.update({
      where: { id: participantId },
      data: {
        status: 'DRAFT',
        reopenedAt: new Date(),
        reopenMessage: message.trim(),
        magicLinkActive: true,
      },
    }),
    // Reset approval flags
    ...(participant.reimbursementSummary ? [
      prisma.reimbursementSummary.update({
        where: { participantId },
        data: { adminApproved: false, aiCheckOk: false, paid: false },
      }),
    ] : []),
    prisma.changeLogEntry.create({
      data: {
        participantId,
        userType: changeLogActor(req),
        fieldName: 'status',
        previousValue: participant.status,
        newValue: 'DRAFT (reopened)',
      },
    }),
  ]);

  // Send reopen email
  try {
    const emailService = getEmailService();
    await emailService.sendReopenNotification(
      participant.email,
      participant.firstName,
      participant.project.name,
      message.trim(),
      await projectEmailContext(participant.project, participant.id)
    );
  } catch (err) {
    console.error('[Email] Failed to send reopen notification:', err);
  }

  res.json({ success: true });
}));

// =============================================================================
// COUNTRY LIMITS ROUTES
// =============================================================================

/**
 * GET /api/organisation/projects/:id/country-limits
 * Get country limits for a project
 */
router.get('/projects/:id/country-limits', ensureOwnProject, asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;

  const limits = await prisma.projectCountryLimit.findMany({
    where: { projectId },
    orderBy: { country: 'asc' },
  });

  res.json(limits);
}));

/**
 * POST /api/organisation/projects/:id/country-limits
 * Set country limit
 */
const countryLimitSchema = z.object({
  country: z.string().min(1),
  maxReimbursementAmount: z.number().min(0),
  greenTravel: z.boolean().optional(),
});

router.post('/projects/:id/country-limits', ensureOwnProject, asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;

  const result = countryLimitSchema.safeParse(req.body);
  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const { country, maxReimbursementAmount, greenTravel } = result.data;

  // Upsert the limit
  const limit = await prisma.projectCountryLimit.upsert({
    where: {
      projectId_country: { projectId, country },
    },
    create: {
      projectId,
      country,
      maxReimbursementAmount,
      currency: 'EUR',
      greenTravel: greenTravel || false,
    },
    update: {
      maxReimbursementAmount,
      greenTravel: greenTravel ?? undefined,
    },
  });

  // The cap changed: recompute each affected participant's max AND payable
  // amount through the canonical calculator (participants with an individual
  // override are unaffected by design).
  const participants = await prisma.participant.findMany({
    where: { projectId, country },
    select: { id: true },
  });
  if (participants.length > 0) {
    const { getAiService } = await import('../../services/ai/index.js');
    const aiService = getAiService();
    for (const p of participants) {
      await aiService.recalculateParticipantSummary(p.id);
    }
  }

  res.json(limit);
}));

/**
 * DELETE /api/organisation/projects/:id/country-limits/:country
 * Delete country limit
 */
router.delete('/projects/:id/country-limits/:country', ensureOwnProject, asyncHandler(async (req: Request, res: Response) => {
  const { id: projectId, country } = req.params;

  // Never orphan participants: their cap/green-travel status comes from this row
  const inUse = await prisma.participant.count({ where: { projectId, country } });
  if (inUse > 0) {
    throw new ValidationError(
      `${inUse} participant(s) still use "${country}" — change their country first, then remove it`
    );
  }

  const existing = await prisma.projectCountryLimit.findUnique({
    where: { projectId_country: { projectId, country } },
  });
  if (!existing) throw new NotFoundError('Country limit not found');

  await prisma.projectCountryLimit.delete({ where: { id: existing.id } });

  res.json({ success: true });
}));

/**
 * GET /api/organisation/projects/:id/export/csv
 * Export project participants to CSV
 */
router.get('/projects/:id/export/csv', ensureOwnProject, asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      participants: {
        include: {
          reimbursementSummary: true,
          travelItems: true,
        },
      },
    },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // Build CSV
  const headers = [
    'First Name',
    'Last Name',
    'Country',
    'Email',
    'Reimbursement Status',
    "Doesn't need reimbursement",
    'Reimbursement Amount (EUR)',
    'Travel (EUR)',
    'Green travel extra (EUR)',
  ];

  const rows = project.participants.map((p: any) => [
    p.firstName,
    p.lastName,
    p.country,
    p.email,
    p.status,
    p.noReimbursement ? 'yes' : '',
    p.reimbursementSummary?.amountToReimburse ?? '',
    p.reimbursementSummary?.totalEur ?? '',
    p.reimbursementSummary?.greenTravelExtraEur ?? '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((r: any[]) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${project.name.replace(/[^a-z0-9]/gi, '_')}_participants.csv"`);
  res.send(csvContent);
}));

/**
 * GET /api/organisation/projects/:id/export/audit-zip
 * Download a ZIP of audit PDFs for all approved/paid participants in a project
 */
router.get('/projects/:id/export/audit-zip', ensureOwnProject, asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      participants: {
        where: { status: { in: ['ADMIN_APPROVED', 'PAID'] } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      },
    },
  });

  if (!project) throw new NotFoundError('Project not found');

  if (project.participants.length === 0) {
    res.status(404).json({ error: 'No approved participants to export' });
    return;
  }

  const safeProjectName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="Audit_${safeProjectName}.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(res);

  for (const participant of project.participants) {
    try {
      const pdfBuffer = await generateAuditPdf(participant.id);
      const safeName = `${participant.lastName}_${participant.firstName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      archive.append(pdfBuffer, { name: `Audit_${safeName}.pdf` });
    } catch (err) {
      console.error(`audit-zip: failed to generate PDF for participant ${participant.id}:`, err);
      // Skip this participant and continue with the rest
    }
  }

  await archive.finalize();
}));

/**
 * POST /api/organisation/projects/:id/expand-capacity
 * Expand a full project's participant capacity by 60, consuming 1 credit
 */
router.post('/projects/:id/expand-capacity', ensureOwnProject, asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const projectId = req.params.id;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Project not found');
  if (project.isTestProject) throw new ValidationError('Upgrade to a full project before expanding capacity.');

  const freshOrg = await prisma.organisation.findUnique({ where: { id: org.id } });
  if (!freshOrg) throw new NotFoundError('Organisation not found');
  if (freshOrg.projectCredits < 1) throw new ForbiddenError('No credits available. Purchase credits to expand capacity.');

  const currentMax = project.maxParticipants ?? 60;
  const newMax = currentMax + 60;

  await prisma.$transaction([
    prisma.organisation.update({
      where: { id: org.id },
      data: { projectCredits: freshOrg.projectCredits - 1 },
    }),
    prisma.project.update({
      where: { id: projectId },
      data: { maxParticipants: newMax },
    }),
  ]);

  res.json({ success: true, newLimit: newMax, message: `Capacity expanded to ${newMax} participants. 1 credit used.` });
}));

/**
 * POST /api/organisation/projects/:id/upgrade-from-test
 * Convert a test project to a full project, consuming 1 credit
 */
router.post('/projects/:id/upgrade-from-test', ensureOwnProject, asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const projectId = req.params.id;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Project not found');
  if (!project.isTestProject) throw new ValidationError('This project is not a test project');

  // Refresh org for latest credit count
  const freshOrg = await prisma.organisation.findUnique({ where: { id: org.id } });
  if (!freshOrg) throw new NotFoundError('Organisation not found');
  if (freshOrg.projectCredits < 1) throw new ForbiddenError('No credits available to upgrade this project');

  await prisma.$transaction([
    prisma.organisation.update({
      where: { id: org.id },
      data: { projectCredits: freshOrg.projectCredits - 1 },
    }),
    prisma.project.update({
      where: { id: projectId },
      data: { isTestProject: false, maxParticipants: null, creditSource: 'SINGLE' },
    }),
  ]);

  res.json({ success: true, message: 'Project upgraded to full project. 1 credit used.' });
}));

// =============================================================================
// AFFILIATE DASHBOARD
// =============================================================================

/**
 * GET /api/organisation/affiliate
 * Get affiliate dashboard data (affiliate orgs only)
 */
router.get('/affiliate', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  if (!org.isAffiliate) {
    res.status(403).json({ error: 'This organisation is not an affiliate' });
    return;
  }

  const links = await prisma.affiliateLink.findMany({
    where: { affiliateId: org.id },
    include: {
      customer: { select: { name: true } },
      commissions: {
        include: {
          purchase: { select: { amountCents: true, completedAt: true, type: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const linkedCustomers = links.map((link) => ({
    orgName: link.customer.name,
    linkedAt: link.createdAt,
    purchases: link.commissions.map((c) => ({
      purchaseId: c.purchaseId,
      completedAt: c.purchase.completedAt,
      purchaseType: c.purchase.type,
      amountCents: c.purchase.amountCents,
      commissionCents: c.amountCents,
      commissionStatus: c.status,
    })),
  }));

  const allCommissions = links.flatMap((l) => l.commissions);
  const totalEarnedCents = allCommissions
    .filter((c) => c.status !== 'REVERSED')
    .reduce((s, c) => s + c.amountCents, 0);
  const pendingBalanceCents = allCommissions
    .filter((c) => c.status === 'PENDING')
    .reduce((s, c) => s + c.amountCents, 0);

  res.json({
    affiliateCode: org.affiliateCode,
    commissionRate: org.commissionRate,
    affiliateActive: org.affiliateActive,
    linkedCustomers,
    totalEarnedCents,
    pendingBalanceCents,
    minPayoutCents: 10000,
  });
}));

/**
 * POST /api/organisation/affiliate/request-payout
 * Request a payout (min €100 pending balance)
 */
router.post('/affiliate/request-payout', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  if (!org.isAffiliate) {
    res.status(403).json({ error: 'This organisation is not an affiliate' });
    return;
  }

  const links = await prisma.affiliateLink.findMany({
    where: { affiliateId: org.id },
    include: { commissions: { where: { status: 'PENDING' } } },
  });
  const pendingCents = links.flatMap((l) => l.commissions).reduce((s, c) => s + c.amountCents, 0);

  if (pendingCents < 10000) {
    res.status(400).json({
      error: `Minimum payout is €100. Your pending balance is €${(pendingCents / 100).toFixed(2)}.`,
    });
    return;
  }

  await getEmailService().send({
    to: 'micky@easyreimburse.ai',
    subject: `Affiliate Payout Request — ${org.name} (€${(pendingCents / 100).toFixed(2)})`,
    text: [
      'Affiliate payout request received.',
      '',
      `Organisation: ${org.name}`,
      `Email: ${org.email}`,
      `Affiliate Code: ${org.affiliateCode ?? '—'}`,
      `Pending Balance: €${(pendingCents / 100).toFixed(2)}`,
      '',
      'To confirm this payout, go to the Super Admin → Affiliates panel.',
    ].join('\n'),
    html: `<p>Payout request from <strong>${org.name}</strong> (${org.email}), code <code>${org.affiliateCode ?? '—'}</code>.</p><p>Pending: <strong>€${(pendingCents / 100).toFixed(2)}</strong></p><p>Confirm via the Super Admin → Affiliates panel.</p>`,
  });

  console.log(`[Affiliate] Payout request from ${org.name} (${org.email}): €${(pendingCents / 100).toFixed(2)}`);

  res.json({
    success: true,
    pendingBalanceCents: pendingCents,
    message: 'Your payout request has been submitted. We will process it within a few business days.',
  });
}));

export default router;

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import prisma from '../../utils/prisma.js';
import { asyncHandler, ValidationError, NotFoundError, ForbiddenError } from '../../middleware/errorHandler.js';
import { organisationAuth, ensureOwnProject } from '../../middleware/auth.js';
import { Organisation, PurchaseType, ParticipantStatus, TransportMode, DocumentType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { getEmailService } from '../../services/email/index.js';
import { getStorageService } from '../../services/storage/index.js';
import { generateAuditPdf } from '../../services/pdf/index.js';
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

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
  country: z.string().min(1, 'Country is required'),
  startDate: z.string().transform((s) => new Date(s)),
  endDate: z.string().transform((s) => new Date(s)),
  carRatePerKm: z.number().min(0).default(0.22),
  venueAddress: z.string().optional(),
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
  const { name, description, country, startDate, endDate, carRatePerKm, venueAddress } = result.data;

  // Refresh org data to get latest credit count
  const freshOrg = await prisma.organisation.findUnique({
    where: { id: org.id },
  });

  if (!freshOrg) {
    throw new NotFoundError('Organisation not found');
  }

  // Consume the credit
  const creditSource = await consumeCredit(freshOrg);

  // Create the project
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
      creditSource,
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

  // Update project
  const project = await prisma.project.update({
    where: { id: projectId },
    data: result.data,
    include: {
      _count: {
        select: { participants: true },
      },
    },
  });

  res.json({
    message: 'Project updated successfully',
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
      creditSource: project.creditSource,
      participantCount: project._count.participants,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
  });
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
      createdAt: p.createdAt,
      completedAt: p.completedAt,
    })),
  });
}));

/**
 * POST /api/organisation/stripe/create-checkout-session
 * Create a Stripe Checkout session for purchasing credits
 */
const STRIPE_PLANS: Record<string, { productEnvKey: string; amountCents: number; credits: number; label: string }> = {
  SINGLE:  { productEnvKey: 'STRIPE_PRODUCT_ID_SINGLE',  amountCents: 12900, credits: 1,  label: 'Single Project Credit' },
  PACK_5:  { productEnvKey: 'STRIPE_PRODUCT_ID_PACK_5',  amountCents: 49900, credits: 5,  label: 'Pack of 5 Credits' },
  PACK_10: { productEnvKey: 'STRIPE_PRODUCT_ID_PACK_10', amountCents: 89900, credits: 10, label: 'Pack of 10 Credits' },
};

router.post('/stripe/create-checkout-session', asyncHandler(async (req: Request, res: Response) => {
  const org = req.organisation!;
  const { type } = req.body as { type: string };

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
    },
  });

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
    success_url: `${frontendUrl}/org/billing?success=1`,
    cancel_url: `${frontendUrl}/org/billing`,
    metadata: {
      organisationId: org.id,
      purchaseId: purchase.id,
      purchaseType: type,
      creditsGranted: String(plan.credits),
    },
    customer_email: org.email,
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

  // Check test project participant limit
  if (project.isTestProject && project.maxParticipants !== null) {
    if (project._count.participants >= project.maxParticipants) {
      throw new ForbiddenError(`Test project is limited to ${project.maxParticipants} participants. Please purchase credits to create a full project.`);
    }
  }

  // Check if participant with same email already exists in this project
  const existing = await prisma.participant.findFirst({
    where: { projectId, email },
  });

  if (existing) {
    throw new ValidationError('A participant with this email already exists in this project');
  }

  // Create participant
  const participant = await prisma.participant.create({
    data: {
      projectId,
      firstName,
      lastName,
      email,
      country,
      magicLinkToken: uuidv4(),
      magicLinkActive: true,
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
router.post('/projects/:id/participants/preview-import', ensureOwnProject, upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ValidationError('No file uploaded');
  }

  const content = req.file.buffer.toString('utf-8');

  try {
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    // Map column names (flexible)
    const mappedRecords = records.map((row) => ({
      firstName: row.first_name || row.firstName || row['First Name'] || '',
      lastName: row.last_name || row.lastName || row['Last Name'] || '',
      email: row.email || row.Email || '',
      country: row.country || row.Country || '',
    }));

    const validRecords = mappedRecords.filter(
      (r) => r.firstName && r.lastName && r.email && r.country
    );

    res.json({
      totalRows: validRecords.length,
      columns: Object.keys(records[0] || {}),
      preview: validRecords.slice(0, 10),
    });
  } catch (err) {
    throw new ValidationError('Failed to parse CSV file');
  }
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

  const content = req.file.buffer.toString('utf-8');

  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  const mappedRecords = records.map((row) => ({
    firstName: row.first_name || row.firstName || row['First Name'] || '',
    lastName: row.last_name || row.lastName || row['Last Name'] || '',
    email: row.email || row.Email || '',
    country: row.country || row.Country || '',
  }));

  const validRecords = mappedRecords.filter(
    (r) => r.firstName && r.lastName && r.email && r.country
  );

  // Check test project participant limit
  if (project.isTestProject && project.maxParticipants !== null) {
    const remainingSlots = project.maxParticipants - project._count.participants;
    if (validRecords.length > remainingSlots) {
      throw new ForbiddenError(`Test project can only add ${remainingSlots} more participant(s) (limit: ${project.maxParticipants}). Please purchase credits to create a full project.`);
    }
  }

  const created: any[] = [];
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < validRecords.length; i++) {
    const record = validRecords[i];

    try {
      // Check for existing
      const existing = await prisma.participant.findFirst({
        where: { projectId, email: record.email },
      });

      if (existing) {
        errors.push({ row: i + 1, error: `Email ${record.email} already exists` });
        continue;
      }

      // Create participant
      const participant = await prisma.participant.create({
        data: {
          projectId,
          firstName: record.firstName,
          lastName: record.lastName,
          email: record.email,
          country: record.country,
          magicLinkToken: uuidv4(),
          magicLinkActive: true,
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
      errors.push({ row: i + 1, error: err.message || 'Unknown error' });
    }
  }

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
      documents: true,
      travelItems: {
        orderBy: { departureDate: 'asc' },
      },
      declarationsOnHonor: true,
      declarationsOfTravel: true,
      reimbursementSummary: true,
      changeLogEntries: {
        orderBy: { changedAt: 'desc' },
      },
    },
  });

  if (!participant) {
    throw new NotFoundError('Participant not found');
  }

  // Verify organisation owns this project
  if (participant.project.organisationId !== org.id) {
    throw new ForbiddenError('Access denied');
  }

  // Get country limit
  const countryLimit = await prisma.projectCountryLimit.findFirst({
    where: {
      projectId: participant.projectId,
      country: participant.country,
    },
  });

  res.json({
    participant: {
      ...participant,
      maxReimbursementForCountry: countryLimit?.maxReimbursementAmount || 0,
      greenTravel: countryLimit?.greenTravel || false,
    },
  });
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

  res.json({ findings });
}));

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
      documents: { include: { extraction: true } },
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

  // Delete all existing findings
  await prisma.aiReviewFinding.deleteMany({ where: { participantId } });

  // Check if there's enough data to review
  if (participant.travelItems.length === 0 && participant.documents.length === 0) {
    res.json({ findings: [] });
    return;
  }

  // Get country limit
  const countryLimit = await prisma.projectCountryLimit.findFirst({
    where: { projectId: participant.projectId, country: participant.country },
  });

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
    maxReimbursementForCountry: countryLimit?.maxReimbursementAmount || 0,
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
      numberOfPassengers: item.numberOfPassengers,
      participantPortion: item.participantPortion,
      distanceKm: item.distanceKm,
      validationWarnings: item.validationWarnings,
      documentId: item.documentId,
      amountIncludedInRoundTrip: item.amountIncludedInRoundTrip,
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
      } : null,
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
  });

  // Store new findings in DB (including travelItemId link)
  if (findings.length > 0) {
    await prisma.aiReviewFinding.createMany({
      data: findings.map((f) => ({
        participantId,
        severity: f.severity,
        message: f.message,
        category: f.category,
        travelItemId: (f as any).travelItemId || null,
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

  res.json({ findings: storedFindings });
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
    magicLink
  );

  // Update last sent timestamp
  await prisma.participant.update({
    where: { id: participantId },
    data: { lastMagicLinkSentAt: new Date() },
  });

  res.json({ success: true });
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
    magicLink
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
        magicLink
      );

      await prisma.participant.update({
        where: { id },
        data: { lastMagicLinkSentAt: new Date() },
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
    participant.project.organisation.name
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
        participant.project.organisation.name
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
    approvedAmount
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
    paidAmount
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
  exchangeRateOverride: z.number().nullable().optional(),
  companyName: z.string().nullable().optional(),
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
    data: { participantId, ...result.data },
  });

  await prisma.changeLogEntry.create({
    data: {
      participantId,
      userType: 'ORGANISATION',
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
  if ('exchangeRateOverride' in result.data) {
    if (result.data.exchangeRateOverride != null && current.amountOriginal != null) {
      // Manual override: amountEur = amountOriginal * overrideRate
      updateData.amountEur = current.amountOriginal * result.data.exchangeRateOverride;
    } else if (result.data.exchangeRateOverride === null && current.amountOriginal != null && current.currencyOriginal !== 'EUR') {
      // Cleared override: recalculate with auto rate
      const { getAiService: getAi } = await import('../../services/ai/index.js');
      const ai = getAi();
      updateData.amountEur = await ai.convertToEur(current.amountOriginal, current.currencyOriginal, current.purchaseDate ?? undefined);
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
          userType: 'ORGANISATION',
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
      userType: 'ORGANISATION',
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
  const storage = getStorageService();
  const storedPath = `participants/${participantId}/documents/${uuidv4()}-${req.file.originalname}`;
  await storage.store(
    { buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size },
    storedPath
  );

  const document = await prisma.document.create({
    data: {
      participantId,
      storedFilePath: storedPath,
      originalFilename: req.file.originalname,
      renamedFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      documentType: documentType as DocumentType,
    },
  });

  await prisma.changeLogEntry.create({
    data: {
      participantId,
      userType: 'ORGANISATION',
      fieldName: 'document.uploaded',
      previousValue: null,
      newValue: req.file.originalname,
    },
  });

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
      userType: 'ORGANISATION',
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
        userType: 'ORGANISATION',
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
      message.trim()
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

  // Update reimbursement summaries for participants from this country
  const participants = await prisma.participant.findMany({
    where: { projectId, country },
  });

  for (const p of participants) {
    await prisma.reimbursementSummary.updateMany({
      where: { participantId: p.id },
      data: { maxReimbursementAllowed: maxReimbursementAmount },
    });
  }

  res.json(limit);
}));

/**
 * DELETE /api/organisation/projects/:id/country-limits/:country
 * Delete country limit
 */
router.delete('/projects/:id/country-limits/:country', ensureOwnProject, asyncHandler(async (req: Request, res: Response) => {
  const { id: projectId, country } = req.params;

  await prisma.projectCountryLimit.delete({
    where: {
      projectId_country: { projectId, country },
    },
  });

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
    'Reimbursement Amount (EUR)',
  ];

  const rows = project.participants.map((p: any) => [
    p.firstName,
    p.lastName,
    p.country,
    p.email,
    p.status,
    p.reimbursementSummary?.amountToReimburse ?? '',
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

export default router;

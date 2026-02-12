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
  hasAnnualLicense: boolean;
  annualLicenseExpired: boolean;
}

function getCreditStatus(org: Organisation): CreditStatus {
  const now = new Date();

  // Check annual license
  const hasAnnualLicense = org.hasAnnualLicense;
  const annualLicenseExpired = org.annualLicenseExpiresAt ? org.annualLicenseExpiresAt < now : true;
  const annualLicenseActive = hasAnnualLicense && !annualLicenseExpired;

  // Calculate available credits
  const availableCredits = org.projectCredits;

  // Determine if can create project
  let canCreateProject = false;
  let reason: string | undefined;

  if (annualLicenseActive) {
    canCreateProject = true;
  } else if (org.projectCredits > 0) {
    canCreateProject = true;
  } else if (hasAnnualLicense && annualLicenseExpired) {
    reason = 'Your annual license has expired. Please renew to create new projects.';
  } else {
    reason = 'No credits available. Please purchase credits to create a project.';
  }

  return {
    canCreateProject,
    reason,
    availableCredits,
    hasAnnualLicense,
    annualLicenseExpired,
  };
}

async function consumeCredit(org: Organisation): Promise<PurchaseType> {
  const now = new Date();

  // Check annual license first (doesn't consume credits)
  if (org.hasAnnualLicense && org.annualLicenseExpiresAt && org.annualLicenseExpiresAt > now) {
    return 'ANNUAL';
  }

  // Consume regular credit
  if (org.projectCredits > 0) {
    await prisma.organisation.update({
      where: { id: org.id },
      data: { projectCredits: org.projectCredits - 1 },
    });
    return 'SINGLE'; // Could be from any pack, but we track as SINGLE
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
      hasAnnualLicense: creditStatus.hasAnnualLicense,
      annualLicenseExpired: creditStatus.annualLicenseExpired,
      annualLicenseExpiresAt: org.annualLicenseExpiresAt,
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
      hasAnnualLicense: creditStatus.hasAnnualLicense,
      annualLicenseExpired: creditStatus.annualLicenseExpired,
      annualLicenseExpiresAt: org.annualLicenseExpiresAt,
      annualLicenseStartedAt: org.annualLicenseStartedAt,
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
      comment: item.comment,
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

  // Store new findings in DB
  if (findings.length > 0) {
    await prisma.aiReviewFinding.createMany({
      data: findings.map((f) => ({
        participantId,
        severity: f.severity,
        message: f.message,
        category: f.category,
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
    include: { project: true },
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
    'Email',
    'Country',
    'Status',
    'Total EUR',
    'Max Reimbursement',
    'Amount to Reimburse',
    'IBAN',
    'Account Holder',
    'BIC',
  ];

  const rows = project.participants.map((p: any) => [
    p.firstName,
    p.lastName,
    p.email,
    p.country,
    p.status,
    p.reimbursementSummary?.totalEur || 0,
    p.reimbursementSummary?.maxReimbursementAllowed || 0,
    p.reimbursementSummary?.amountToReimburse || 0,
    p.bankAccountIban || '',
    p.bankAccountHolderName || '',
    p.bankAccountBic || '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((r: any[]) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${project.name.replace(/[^a-z0-9]/gi, '_')}_participants.csv"`);
  res.send(csvContent);
}));

export default router;

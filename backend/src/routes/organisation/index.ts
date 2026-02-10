import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../utils/prisma.js';
import { asyncHandler, ValidationError, NotFoundError, ForbiddenError } from '../../middleware/errorHandler.js';
import { organisationAuth, ensureOwnProject } from '../../middleware/auth.js';
import { Organisation, PurchaseType } from '@prisma/client';

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
  hasFoundingCredit: boolean;
  foundingCreditExpired: boolean;
  hasAnnualLicense: boolean;
  annualLicenseExpired: boolean;
}

function getCreditStatus(org: Organisation): CreditStatus {
  const now = new Date();

  // Check annual license
  const hasAnnualLicense = org.hasAnnualLicense;
  const annualLicenseExpired = org.annualLicenseExpiresAt ? org.annualLicenseExpiresAt < now : true;
  const annualLicenseActive = hasAnnualLicense && !annualLicenseExpired;

  // Check founding credit
  const hasFoundingCredit = org.foundingCreditClaimed && !org.foundingCreditUsed;
  const foundingCreditExpired = org.foundingCreditExpiresAt ? org.foundingCreditExpiresAt < now : false;
  const foundingCreditAvailable = hasFoundingCredit && !foundingCreditExpired;

  // Calculate available credits
  let availableCredits = org.projectCredits;
  if (foundingCreditAvailable) {
    availableCredits += 1;
  }

  // Determine if can create project
  let canCreateProject = false;
  let reason: string | undefined;

  if (annualLicenseActive) {
    canCreateProject = true;
  } else if (foundingCreditAvailable) {
    canCreateProject = true;
  } else if (org.projectCredits > 0) {
    canCreateProject = true;
  } else if (hasFoundingCredit && foundingCreditExpired) {
    reason = 'Your founding credit has expired. Please purchase credits to create a project.';
  } else if (hasAnnualLicense && annualLicenseExpired) {
    reason = 'Your annual license has expired. Please renew to create new projects.';
  } else {
    reason = 'No credits available. Please purchase credits to create a project.';
  }

  return {
    canCreateProject,
    reason,
    availableCredits,
    hasFoundingCredit,
    foundingCreditExpired,
    hasAnnualLicense,
    annualLicenseExpired,
  };
}

async function consumeCredit(org: Organisation): Promise<PurchaseType> {
  const now = new Date();

  // Priority: Founding credit > Regular credits > Annual (no consumption)

  // Check founding credit first
  if (org.foundingCreditClaimed && !org.foundingCreditUsed) {
    const notExpired = !org.foundingCreditExpiresAt || org.foundingCreditExpiresAt > now;
    if (notExpired) {
      await prisma.organisation.update({
        where: { id: org.id },
        data: { foundingCreditUsed: true },
      });
      return 'FOUNDING';
    }
  }

  // Check annual license
  if (org.hasAnnualLicense && org.annualLicenseExpiresAt && org.annualLicenseExpiresAt > now) {
    // Annual license - no credit consumed
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
      hasFoundingCredit: creditStatus.hasFoundingCredit,
      foundingCreditExpired: creditStatus.foundingCreditExpired,
      foundingCreditExpiresAt: org.foundingCreditExpiresAt,
      hasAnnualLicense: creditStatus.hasAnnualLicense,
      annualLicenseExpired: creditStatus.annualLicenseExpired,
      annualLicenseExpiresAt: org.annualLicenseExpiresAt,
    },
    stats: {
      projectCount: projects.length,
      totalParticipants,
    },
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      country: p.country,
      startDate: p.startDate,
      endDate: p.endDate,
      participantCount: p._count.participants,
      creditSource: p.creditSource,
      createdAt: p.createdAt,
    })),
    recentPurchases: recentPurchases.map((p) => ({
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
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      country: p.country,
      startDate: p.startDate,
      endDate: p.endDate,
      disseminationEnabled: p.disseminationEnabled,
      carRatePerKm: p.carRatePerKm,
      participantCount: p._count.participants,
      creditSource: p.creditSource,
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
  const { name, description, country, startDate, endDate, carRatePerKm } = result.data;

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
      hasFoundingCredit: creditStatus.hasFoundingCredit && !org.foundingCreditUsed,
      foundingCreditExpired: creditStatus.foundingCreditExpired,
      foundingCreditExpiresAt: org.foundingCreditExpiresAt,
      hasAnnualLicense: creditStatus.hasAnnualLicense,
      annualLicenseExpired: creditStatus.annualLicenseExpired,
      annualLicenseExpiresAt: org.annualLicenseExpiresAt,
      annualLicenseStartedAt: org.annualLicenseStartedAt,
    },
    purchases: purchases.map((p) => ({
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

export default router;

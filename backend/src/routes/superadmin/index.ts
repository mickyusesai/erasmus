import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../utils/prisma.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { ValidationError, NotFoundError } from '../../middleware/errorHandler.js';
import { superAdminAuth } from '../../middleware/auth.js';

const router = Router();

// All routes require super admin authentication
router.use(superAdminAuth);

/**
 * GET /api/super-admin/organisations
 * List all organisations with stats
 */
router.get('/organisations', asyncHandler(async (req: Request, res: Response) => {
  const organisations = await prisma.organisation.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { projects: true },
      },
    },
  });

  // Calculate stats
  const totalOrganisations = organisations.length;
  const totalProjects = organisations.reduce((sum, org) => sum + org._count.projects, 0);
  const totalCreditsOutstanding = organisations.reduce((sum, org) => sum + org.projectCredits, 0);

  res.json({
    organisations,
    stats: {
      totalOrganisations,
      totalProjects,
      totalCreditsOutstanding,
    },
  });
}));

/**
 * GET /api/super-admin/organisations/:id
 * Get single organisation with details
 */
router.get('/organisations/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const organisation = await prisma.organisation.findUnique({
    where: { id },
    include: {
      projects: {
        include: {
          _count: {
            select: { participants: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      purchases: {
        orderBy: { createdAt: 'desc' },
      },
      _count: {
        select: { projects: true },
      },
    },
  });

  if (!organisation) {
    throw new NotFoundError('Organisation not found');
  }

  res.json({ organisation });
}));

/**
 * POST /api/super-admin/organisations/:id/grant-credits
 * Manually grant credits to an organisation
 */
const grantCreditsSchema = z.object({
  credits: z.number().int().min(1).max(100),
  reason: z.string().optional(),
});

router.post('/organisations/:id/grant-credits', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = grantCreditsSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const { credits, reason } = result.data;

  const organisation = await prisma.organisation.findUnique({
    where: { id },
  });

  if (!organisation) {
    throw new NotFoundError('Organisation not found');
  }

  // Update credits and create purchase record
  const [updated, purchase] = await prisma.$transaction([
    prisma.organisation.update({
      where: { id },
      data: {
        projectCredits: { increment: credits },
      },
    }),
    prisma.purchase.create({
      data: {
        organisationId: id,
        type: 'MANUAL',
        amountCents: 0,
        currency: 'EUR',
        creditsGranted: credits,
        status: 'COMPLETED',
        completedAt: new Date(),
        notes: reason || `Manually granted by super admin`,
      },
    }),
  ]);

  res.json({
    message: `Granted ${credits} credit(s) to ${organisation.name}`,
    organisation: updated,
    purchase,
  });
}));

/**
 * POST /api/super-admin/organisations/:id/toggle-active
 * Enable/disable an organisation
 */
router.post('/organisations/:id/toggle-active', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const organisation = await prisma.organisation.findUnique({
    where: { id },
  });

  if (!organisation) {
    throw new NotFoundError('Organisation not found');
  }

  const updated = await prisma.organisation.update({
    where: { id },
    data: {
      isActive: !organisation.isActive,
    },
  });

  res.json({
    message: `Organisation ${updated.isActive ? 'activated' : 'deactivated'}`,
    organisation: updated,
  });
}));

/**
 * POST /api/super-admin/organisations/:id/grant-annual
 * Grant annual license to an organisation
 */
router.post('/organisations/:id/grant-annual', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const organisation = await prisma.organisation.findUnique({
    where: { id },
  });

  if (!organisation) {
    throw new NotFoundError('Organisation not found');
  }

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const [updated, purchase] = await prisma.$transaction([
    prisma.organisation.update({
      where: { id },
      data: {
        hasAnnualLicense: true,
        annualLicenseStartedAt: now,
        annualLicenseExpiresAt: expiresAt,
      },
    }),
    prisma.purchase.create({
      data: {
        organisationId: id,
        type: 'ANNUAL',
        amountCents: 0,
        currency: 'EUR',
        creditsGranted: 0,
        status: 'COMPLETED',
        completedAt: new Date(),
        notes: 'Annual license granted by super admin',
      },
    }),
  ]);

  res.json({
    message: `Granted annual license to ${organisation.name}`,
    organisation: updated,
    purchase,
  });
}));

export default router;

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../utils/prisma.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { ValidationError, NotFoundError } from '../../middleware/errorHandler.js';
import { superAdminAuth } from '../../middleware/auth.js';
import { getEmailService } from '../../services/email/index.js';

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
  const totalProjects = organisations.reduce((sum: number, org: any) => sum + org._count.projects, 0);
  const totalCreditsOutstanding = organisations.reduce((sum: number, org: any) => sum + org.projectCredits, 0);

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
 * Get single organisation with full details including projects and participants
 */
router.get('/organisations/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const organisation = await prisma.organisation.findUnique({
    where: { id },
    include: {
      projects: {
        include: {
          participants: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              status: true,
              magicLinkToken: true,
              magicLinkActive: true,
              tokenExpiresAt: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
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
      },
    }),
  ]);

  res.json({
    message: `Granted annual license to ${organisation.name}`,
    organisation: updated,
    purchase,
  });
}));

// =============================================================================
// NEW OPERATIONAL TOOLS
// =============================================================================

/**
 * PATCH /api/super-admin/organisations/:id
 * Force-update an organisation's email address (account recovery)
 */
const updateOrgSchema = z.object({
  email: z.string().email('Invalid email address'),
  reason: z.string().min(1, 'Reason is required'),
});

router.patch('/organisations/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = updateOrgSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const { email, reason } = result.data;

  const organisation = await prisma.organisation.findUnique({ where: { id } });
  if (!organisation) {
    throw new NotFoundError('Organisation not found');
  }

  // Check email is not already in use by another org
  const existing = await prisma.organisation.findFirst({ where: { email, NOT: { id } } });
  if (existing) {
    throw new ValidationError('This email address is already used by another organisation');
  }

  const updated = await prisma.organisation.update({
    where: { id },
    data: { email },
  });

  console.log(`[SuperAdmin] Updated org ${id} (${organisation.name}) email from ${organisation.email} to ${email}. Reason: ${reason}`);

  res.json({
    message: `Organisation email updated to ${email}`,
    organisation: updated,
  });
}));

/**
 * POST /api/super-admin/participants/:participantId/force-reopen
 * Force-reopen any participant back to DRAFT (including PAID status)
 */
const forceReopenSchema = z.object({
  message: z.string().optional(),
});

router.post('/participants/:participantId/force-reopen', asyncHandler(async (req: Request, res: Response) => {
  const { participantId } = req.params;
  const result = forceReopenSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const message = result.data.message || 'Your reimbursement has been reopened by the platform administrator. Please review and resubmit.';

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: {
      reimbursementSummary: true,
      project: true,
    },
  });

  if (!participant) {
    throw new NotFoundError('Participant not found');
  }

  const previousStatus = participant.status;

  await prisma.$transaction([
    prisma.participant.update({
      where: { id: participantId },
      data: {
        status: 'DRAFT',
        reopenedAt: new Date(),
        reopenMessage: message,
        magicLinkActive: true,
        aiReviewStatus: 'NOT_STARTED',
      },
    }),
    ...(participant.reimbursementSummary ? [
      prisma.reimbursementSummary.update({
        where: { participantId },
        data: { adminApproved: false, aiCheckOk: false, paid: false },
      }),
    ] : []),
    prisma.aiReviewFinding.deleteMany({ where: { participantId } }),
    prisma.changeLogEntry.create({
      data: {
        participantId,
        userType: 'ADMIN',
        fieldName: 'status',
        previousValue: previousStatus,
        newValue: 'DRAFT (force-reopened by superadmin)',
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
      message
    );
  } catch (err) {
    console.error('[SuperAdmin] Failed to send reopen notification:', err);
  }

  res.json({
    message: `Participant ${participant.firstName} ${participant.lastName} reopened from ${previousStatus} to DRAFT`,
    participantId,
    previousStatus,
  });
}));

/**
 * POST /api/super-admin/participants/:participantId/regenerate-token
 * Regenerate and reactivate a participant's magic link token
 */
const regenerateTokenSchema = z.object({
  sendEmail: z.boolean().optional().default(false),
});

router.post('/participants/:participantId/regenerate-token', asyncHandler(async (req: Request, res: Response) => {
  const { participantId } = req.params;
  const result = regenerateTokenSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const { sendEmail } = result.data;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { project: true },
  });

  if (!participant) {
    throw new NotFoundError('Participant not found');
  }

  const newToken = uuidv4();

  // Recalculate token expiry: 180 days from project end date (or from now if past end)
  const projectEndDate = participant.project.endDate ? new Date(participant.project.endDate) : new Date();
  const baseDate = projectEndDate > new Date() ? projectEndDate : new Date();
  const newExpiry = new Date(baseDate);
  newExpiry.setDate(newExpiry.getDate() + 180);

  await prisma.participant.update({
    where: { id: participantId },
    data: {
      magicLinkToken: newToken,
      magicLinkActive: true,
      tokenExpiresAt: newExpiry,
    },
  });

  await prisma.changeLogEntry.create({
    data: {
      participantId,
      userType: 'ADMIN',
      fieldName: 'magicLinkToken',
      previousValue: '(previous token)',
      newValue: '(regenerated by superadmin)',
    },
  });

  // Optionally send the magic link email
  if (sendEmail) {
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const magicLink = `${frontendUrl}/reimbursement?token=${newToken}`;
      const emailService = getEmailService();
      await emailService.sendMagicLink(
        participant.email,
        participant.firstName,
        participant.project.name,
        magicLink
      );
    } catch (err) {
      console.error('[SuperAdmin] Failed to send magic link email:', err);
    }
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const magicLink = `${frontendUrl}/reimbursement?token=${newToken}`;

  res.json({
    message: `Magic link token regenerated for ${participant.firstName} ${participant.lastName}`,
    newToken,
    magicLink,
    tokenExpiresAt: newExpiry,
    emailSent: sendEmail,
  });
}));

/**
 * POST /api/super-admin/participants/:targetId/merge-from/:sourceId
 * Merge source participant into target participant (source is deleted, data moved to target)
 */
router.post('/participants/:targetId/merge-from/:sourceId', asyncHandler(async (req: Request, res: Response) => {
  const { targetId, sourceId } = req.params;

  if (targetId === sourceId) {
    throw new ValidationError('Cannot merge a participant with themselves');
  }

  const [target, source] = await Promise.all([
    prisma.participant.findUnique({
      where: { id: targetId },
      include: { project: { include: { organisation: true } } },
    }),
    prisma.participant.findUnique({
      where: { id: sourceId },
      include: { project: { include: { organisation: true } } },
    }),
  ]);

  if (!target) throw new NotFoundError('Target participant not found');
  if (!source) throw new NotFoundError('Source participant not found');

  // Verify both belong to the same organisation
  if (target.project.organisation.id !== source.project.organisation.id) {
    throw new ValidationError('Both participants must belong to the same organisation');
  }

  // Refuse to merge if either is PAID
  if (target.status === 'PAID' || source.status === 'PAID') {
    throw new ValidationError('Cannot merge participants with PAID status. Please force-reopen them first.');
  }

  await prisma.$transaction([
    // Move all related records from source to target
    prisma.document.updateMany({ where: { participantId: sourceId }, data: { participantId: targetId } }),
    prisma.travelItem.updateMany({ where: { participantId: sourceId }, data: { participantId: targetId } }),
    prisma.declarationOfTravel.updateMany({ where: { participantId: sourceId }, data: { participantId: targetId } }),
    prisma.declarationOnHonor.updateMany({ where: { participantId: sourceId }, data: { participantId: targetId } }),
    prisma.changeLogEntry.updateMany({ where: { participantId: sourceId }, data: { participantId: targetId } }),
    prisma.aiReviewFinding.updateMany({ where: { participantId: sourceId }, data: { participantId: targetId } }),
    // Delete source reimbursement summary (target's is kept)
    prisma.reimbursementSummary.deleteMany({ where: { participantId: sourceId } }),
    // Delete source participant
    prisma.participant.delete({ where: { id: sourceId } }),
    // Log the merge
    prisma.changeLogEntry.create({
      data: {
        participantId: targetId,
        userType: 'ADMIN',
        fieldName: 'merge',
        previousValue: `(standalone)`,
        newValue: `Merged from participant ${sourceId} (${source.email}) by superadmin`,
      },
    }),
  ]);

  res.json({
    message: `Participant ${source.firstName} ${source.lastName} (${source.email}) merged into ${target.firstName} ${target.lastName} (${target.email})`,
    targetId,
    sourceDeleted: sourceId,
  });
}));

/**
 * POST /api/super-admin/participants/:participantId/transfer-to-project
 * Transfer a participant to a different project within the same organisation
 */
const transferProjectSchema = z.object({
  targetProjectId: z.string().uuid('Invalid project ID'),
});

router.post('/participants/:participantId/transfer-to-project', asyncHandler(async (req: Request, res: Response) => {
  const { participantId } = req.params;
  const result = transferProjectSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const { targetProjectId } = result.data;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { project: { include: { organisation: true } } },
  });

  if (!participant) throw new NotFoundError('Participant not found');

  if (participant.projectId === targetProjectId) {
    throw new ValidationError('Participant is already in this project');
  }

  const targetProject = await prisma.project.findUnique({
    where: { id: targetProjectId },
    include: { organisation: true },
  });

  if (!targetProject) throw new NotFoundError('Target project not found');

  if (targetProject.organisation.id !== participant.project.organisation.id) {
    throw new ValidationError('Target project must belong to the same organisation');
  }

  // Check for email conflict in target project
  const emailConflict = await prisma.participant.findFirst({
    where: { projectId: targetProjectId, email: participant.email, NOT: { id: participantId } },
  });
  if (emailConflict) {
    throw new ValidationError(`A participant with email ${participant.email} already exists in the target project`);
  }

  // Recalculate token expiry based on new project end date
  const projectEndDate = targetProject.endDate ? new Date(targetProject.endDate) : new Date();
  const baseDate = projectEndDate > new Date() ? projectEndDate : new Date();
  const newExpiry = new Date(baseDate);
  newExpiry.setDate(newExpiry.getDate() + 180);

  await prisma.$transaction([
    prisma.participant.update({
      where: { id: participantId },
      data: {
        projectId: targetProjectId,
        tokenExpiresAt: newExpiry,
      },
    }),
    prisma.changeLogEntry.create({
      data: {
        participantId,
        userType: 'ADMIN',
        fieldName: 'projectId',
        previousValue: `${participant.project.name} (${participant.projectId})`,
        newValue: `${targetProject.name} (${targetProjectId}) — transferred by superadmin`,
      },
    }),
  ]);

  res.json({
    message: `Participant ${participant.firstName} ${participant.lastName} transferred from "${participant.project.name}" to "${targetProject.name}"`,
    participantId,
    fromProjectId: participant.projectId,
    toProjectId: targetProjectId,
    newTokenExpiresAt: newExpiry,
  });
}));

/**
 * POST /api/super-admin/projects/:projectId/recalculate-token-expiry
 * Recalculate all participant token expiry dates based on current project end date
 */
router.post('/projects/:projectId/recalculate-token-expiry', asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Project not found');

  const projectEndDate = project.endDate ? new Date(project.endDate) : new Date();
  const baseDate = projectEndDate > new Date() ? projectEndDate : new Date();
  const newExpiry = new Date(baseDate);
  newExpiry.setDate(newExpiry.getDate() + 180);

  const updated = await prisma.participant.updateMany({
    where: { projectId },
    data: { tokenExpiresAt: newExpiry },
  });

  res.json({
    message: `Updated token expiry for ${updated.count} participant(s) in "${project.name}"`,
    projectId,
    newTokenExpiresAt: newExpiry,
    participantsUpdated: updated.count,
  });
}));

/**
 * POST /api/super-admin/purchases/:purchaseId/refund
 * Mark a purchase as refunded and restore credits to the organisation
 */
const refundPurchaseSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
});

router.post('/purchases/:purchaseId/refund', asyncHandler(async (req: Request, res: Response) => {
  const { purchaseId } = req.params;
  const result = refundPurchaseSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const { reason } = result.data;

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { organisation: true },
  });

  if (!purchase) throw new NotFoundError('Purchase not found');

  if (purchase.status !== 'COMPLETED') {
    throw new ValidationError(`Cannot refund a purchase with status "${purchase.status}". Only COMPLETED purchases can be refunded.`);
  }

  const creditsToRestore = purchase.creditsGranted;

  const [updatedPurchase, updatedOrg] = await prisma.$transaction([
    prisma.purchase.update({
      where: { id: purchaseId },
      data: { status: 'REFUNDED' },
    }),
    // Only decrement credits if credits were actually granted
    ...(creditsToRestore > 0 ? [
      prisma.organisation.update({
        where: { id: purchase.organisationId },
        data: { projectCredits: { decrement: creditsToRestore } },
      }),
    ] : [
      prisma.organisation.findUnique({ where: { id: purchase.organisationId } }),
    ]),
  ]);

  console.log(`[SuperAdmin] Refunded purchase ${purchaseId} for org ${purchase.organisationId} (${purchase.organisation.name}). Credits restored: ${creditsToRestore}. Reason: ${reason}`);

  res.json({
    message: `Purchase refunded. ${creditsToRestore > 0 ? `${creditsToRestore} credit(s) removed from organisation.` : 'No credits to restore.'}`,
    purchase: updatedPurchase,
    creditsRestored: creditsToRestore,
  });
}));

export default router;

import { Router, Request, Response } from 'express';
import prisma from '../../utils/prisma.js';

const router = Router();

/**
 * GET /api/admin/dashboard/stats
 * Get dashboard statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  // Get counts
  const [
    totalProjects,
    totalParticipants,
    participantsByStatus,
    recentProjects,
  ] = await Promise.all([
    prisma.project.count(),
    prisma.participant.count(),
    prisma.participant.groupBy({
      by: ['status'],
      _count: { id: true },
    }),
    prisma.project.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { participants: true },
        },
        participants: {
          select: {
            status: true,
            reimbursementSummary: {
              select: {
                paid: true,
                adminApproved: true,
              },
            },
          },
        },
      },
    }),
  ]);

  // Process status counts
  const statusCounts = {
    draft: 0,
    participantComplete: 0,
    adminApproved: 0,
    paid: 0,
  };

  for (const stat of participantsByStatus) {
    switch (stat.status) {
      case 'DRAFT':
        statusCounts.draft = stat._count.id;
        break;
      case 'PARTICIPANT_COMPLETE':
        statusCounts.participantComplete = stat._count.id;
        break;
      case 'ADMIN_APPROVED':
        statusCounts.adminApproved = stat._count.id;
        break;
      case 'PAID':
        statusCounts.paid = stat._count.id;
        break;
    }
  }

  // Calculate totals from reimbursement summaries
  const summaries = await prisma.reimbursementSummary.aggregate({
    _sum: {
      totalEur: true,
      amountToReimburse: true,
    },
  });

  // Process recent projects
  const projects = recentProjects.map((project) => {
    const participantStats = {
      total: project._count.participants,
      complete: 0,
      approved: 0,
      paid: 0,
    };

    for (const participant of project.participants) {
      if (participant.status === 'PARTICIPANT_COMPLETE') participantStats.complete++;
      if (participant.status === 'ADMIN_APPROVED') participantStats.approved++;
      if (participant.status === 'PAID') participantStats.paid++;
    }

    return {
      id: project.id,
      name: project.name,
      country: project.country,
      startDate: project.startDate,
      endDate: project.endDate,
      participantStats,
    };
  });

  res.json({
    totalProjects,
    totalParticipants,
    statusCounts,
    totalReimbursementEur: summaries._sum.totalEur || 0,
    totalToReimburse: summaries._sum.amountToReimburse || 0,
    recentProjects: projects,
  });
});

export default router;

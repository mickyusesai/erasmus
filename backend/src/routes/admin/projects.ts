import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../utils/prisma.js';
import { NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import { getStorageService } from '../../services/storage/index.js';

const router = Router();

// Validation schemas
const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  country: z.string().min(1, 'Country is required'),
  startDate: z.string().transform((s) => new Date(s)),
  endDate: z.string().transform((s) => new Date(s)),
  disseminationEnabled: z.boolean().optional().default(false),
});

const updateProjectSchema = createProjectSchema.partial();

const countryLimitSchema = z.object({
  country: z.string().min(1, 'Country is required'),
  maxReimbursementAmount: z.number().min(0, 'Amount must be positive'),
  currency: z.string().default('EUR'),
  greenTravel: z.boolean().optional().default(false),
});

/**
 * GET /api/admin/projects
 * List all projects
 */
router.get('/', async (req: Request, res: Response) => {
  const { search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  const where = search
    ? {
        OR: [
          { name: { contains: search as string } },
          { country: { contains: search as string } },
        ],
      }
    : {};

  const projects = await prisma.project.findMany({
    where,
    orderBy: { [sortBy as string]: sortOrder },
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
              amountToReimburse: true,
            },
          },
        },
      },
    },
  });

  const projectsWithStats = projects.map((project: typeof projects[0]) => {
    let complete = 0;
    let approved = 0;
    let paid = 0;
    let totalAmount = 0;

    for (const participant of project.participants) {
      if (participant.status === 'PARTICIPANT_COMPLETE') complete++;
      if (participant.status === 'ADMIN_APPROVED') approved++;
      if (participant.status === 'PAID') paid++;
      totalAmount += participant.reimbursementSummary?.amountToReimburse || 0;
    }

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      country: project.country,
      startDate: project.startDate,
      endDate: project.endDate,
      createdAt: project.createdAt,
      stats: {
        totalParticipants: project._count.participants,
        complete,
        approved,
        paid,
        totalAmount,
        allPaid: paid === project._count.participants && project._count.participants > 0,
      },
    };
  });

  res.json(projectsWithStats);
});

/**
 * GET /api/admin/projects/:id
 * Get a single project with all details
 */
router.get('/:id', async (req: Request, res: Response) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: {
      countryLimits: true,
      _count: {
        select: { participants: true },
      },
    },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  res.json(project);
});

/**
 * POST /api/admin/projects
 * Create a new project
 */
router.post('/', async (req: Request, res: Response) => {
  const result = createProjectSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const data = result.data;

  // Ensure we have an organisation (create default if needed)
  let organisation = await prisma.organisation.findFirst();
  if (!organisation) {
    organisation = await prisma.organisation.create({
      data: { name: 'Default Organisation' },
    });
  }

  const project = await prisma.project.create({
    data: {
      ...data,
      organisationId: organisation.id,
    },
  });

  res.status(201).json(project);
});

/**
 * PATCH /api/admin/projects/:id
 * Update a project
 */
router.patch('/:id', async (req: Request, res: Response) => {
  const result = updateProjectSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: result.data,
  });

  res.json(project);
});

/**
 * DELETE /api/admin/projects/:id
 * Delete a project and all related data (GDPR compliance)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  const projectId = req.params.id;

  // Get all participants to delete their files
  const participants = await prisma.participant.findMany({
    where: { projectId },
    include: { documents: true },
  });

  // Delete all uploaded files
  const storage = getStorageService();
  for (const participant of participants) {
    for (const doc of participant.documents) {
      await storage.delete(doc.storedFilePath);
    }
  }

  // Delete project (cascades to all related records)
  await prisma.project.delete({
    where: { id: projectId },
  });

  res.json({ success: true, message: 'Project and all related data deleted' });
});

/**
 * GET /api/admin/projects/:id/country-limits
 * Get country limits for a project
 */
router.get('/:id/country-limits', async (req: Request, res: Response) => {
  const limits = await prisma.projectCountryLimit.findMany({
    where: { projectId: req.params.id },
    orderBy: { country: 'asc' },
  });

  res.json(limits);
});

/**
 * GET /api/admin/projects/:id/participant-countries
 * Get unique countries from participants (for auto-filling country limits)
 */
router.get('/:id/participant-countries', async (req: Request, res: Response) => {
  const participants = await prisma.participant.findMany({
    where: { projectId: req.params.id },
    select: { country: true },
    distinct: ['country'],
    orderBy: { country: 'asc' },
  });

  res.json(participants.map((p: { country: string }) => p.country));
});

/**
 * POST /api/admin/projects/:id/country-limits/auto-populate
 * Auto-populate country limits from participant countries
 * Default amount is 0 (admin should fill it manually)
 */
router.post('/:id/country-limits/auto-populate', async (req: Request, res: Response) => {
  const projectId = req.params.id;
  // Default amount is now 0 - admin must fill it manually
  const { defaultAmount = 0 } = req.body;

  // Get unique countries from participants
  const participants = await prisma.participant.findMany({
    where: { projectId },
    select: { country: true },
    distinct: ['country'],
  });

  const countries = participants.map((p: { country: string }) => p.country);

  // Create country limits for each country that doesn't already exist
  const created = [];
  for (const country of countries) {
    const existing = await prisma.projectCountryLimit.findUnique({
      where: { projectId_country: { projectId, country } },
    });

    if (!existing) {
      const limit = await prisma.projectCountryLimit.create({
        data: {
          projectId,
          country,
          maxReimbursementAmount: defaultAmount,
          currency: 'EUR',
          greenTravel: false,
        },
      });
      created.push(limit);
    }
  }

  res.json({
    message: `Created ${created.length} country limits`,
    created,
    totalCountries: countries.length,
  });
});

/**
 * GET /api/admin/projects/:id/country-limits/check-missing
 * Check if there are any participant countries without limits
 */
router.get('/:id/country-limits/check-missing', async (req: Request, res: Response) => {
  const projectId = req.params.id;

  // Get unique countries from participants
  const participants = await prisma.participant.findMany({
    where: { projectId },
    select: { country: true },
    distinct: ['country'],
  });

  const participantCountries = participants.map((p: { country: string }) => p.country);

  // Get existing country limits
  const existingLimits = await prisma.projectCountryLimit.findMany({
    where: { projectId },
    select: { country: true },
  });

  const existingCountries = new Set(existingLimits.map((l: { country: string }) => l.country));

  // Find missing countries
  const missingCountries = participantCountries.filter((c: string) => !existingCountries.has(c));

  res.json({
    hasMissingCountries: missingCountries.length > 0,
    missingCountries,
    totalParticipantCountries: participantCountries.length,
    totalExistingLimits: existingLimits.length,
  });
});

/**
 * POST /api/admin/projects/:id/country-limits
 * Add or update a country limit
 */
router.post('/:id/country-limits', async (req: Request, res: Response) => {
  const result = countryLimitSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const data = result.data;
  const projectId = req.params.id;

  const limit = await prisma.projectCountryLimit.upsert({
    where: {
      projectId_country: {
        projectId,
        country: data.country,
      },
    },
    create: {
      projectId,
      ...data,
    },
    update: data,
  });

  res.json(limit);
});

/**
 * DELETE /api/admin/projects/:id/country-limits/:country
 * Delete a country limit
 */
router.delete('/:id/country-limits/:country', async (req: Request, res: Response) => {
  await prisma.projectCountryLimit.delete({
    where: {
      projectId_country: {
        projectId: req.params.id,
        country: req.params.country,
      },
    },
  });

  res.json({ success: true });
});

/**
 * GET /api/admin/projects/:id/export/csv
 * Export project reimbursements as CSV
 */
router.get('/:id/export/csv', async (req: Request, res: Response) => {
  const participants = await prisma.participant.findMany({
    where: { projectId: req.params.id },
    include: {
      reimbursementSummary: true,
    },
    orderBy: { lastName: 'asc' },
  });

  // Build CSV
  const headers = [
    'First Name',
    'Last Name',
    'Email',
    'Country',
    'Status',
    'IBAN',
    'Account Holder',
    'BIC',
    'Total EUR',
    'Max Allowed',
    'Amount to Reimburse',
    'AI Check OK',
    'Admin Approved',
    'Paid',
  ];

  const rows = participants.map((p: typeof participants[0]) => [
    p.firstName,
    p.lastName,
    p.email,
    p.country,
    p.status,
    p.bankAccountIban || '',
    p.bankAccountHolderName || '',
    p.bankAccountBic || '',
    p.reimbursementSummary?.totalEur?.toString() || '0',
    p.reimbursementSummary?.maxReimbursementAllowed?.toString() || '0',
    p.reimbursementSummary?.amountToReimburse?.toString() || '0',
    p.reimbursementSummary?.aiCheckOk ? 'Yes' : 'No',
    p.reimbursementSummary?.adminApproved ? 'Yes' : 'No',
    p.reimbursementSummary?.paid ? 'Yes' : 'No',
  ]);

  const csv = [
    headers.join(','),
    ...rows.map((row: string[]) =>
      row.map((cell: string) => `"${cell.replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="project-export.csv"`);
  res.send(csv);
});

export default router;

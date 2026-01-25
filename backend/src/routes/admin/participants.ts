import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../utils/prisma.js';
import { NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import { getEmailService } from '../../services/email/index.js';
import { getAiService } from '../../services/ai/index.js';
import { getStorageService } from '../../services/storage/index.js';
import { ParticipantStatus, DocumentType, TransportMode } from '@prisma/client';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Validation schemas
const updateParticipantSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  country: z.string().optional(),
  notesInternal: z.string().optional(),
});

const updateTravelItemSchema = z.object({
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
});

const createTravelItemSchema = z.object({
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
});

/**
 * GET /api/admin/participants
 * List all participants (with optional project filter)
 */
router.get('/', async (req: Request, res: Response) => {
  const { projectId, status, country, search } = req.query;

  const where: Record<string, unknown> = {};

  if (projectId) where.projectId = projectId;
  if (status) where.status = status;
  if (country) where.country = country;

  if (search) {
    where.OR = [
      { firstName: { contains: search as string } },
      { lastName: { contains: search as string } },
      { email: { contains: search as string } },
    ];
  }

  const participants = await prisma.participant.findMany({
    where,
    include: {
      project: {
        select: { name: true, country: true },
      },
      reimbursementSummary: true,
      _count: {
        select: { documents: true, travelItems: true },
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  res.json(participants);
});

/**
 * GET /api/admin/participants/:id
 * Get a single participant with all details
 */
router.get('/:id', async (req: Request, res: Response) => {
  const participant = await prisma.participant.findUnique({
    where: { id: req.params.id },
    include: {
      project: {
        include: {
          countryLimits: true,
        },
      },
      documents: {
        orderBy: { uploadDate: 'desc' },
      },
      travelItems: {
        orderBy: { departureDate: 'asc' },
      },
      reimbursementSummary: true,
      declarationsOnHonor: true,
      changeLogEntries: {
        orderBy: { changedAt: 'desc' },
        take: 50,
      },
    },
  });

  if (!participant) {
    throw new NotFoundError('Participant not found');
  }

  // Get country limit for this participant
  const countryLimit = participant.project.countryLimits.find(
    (limit) => limit.country === participant.country
  );

  res.json({
    ...participant,
    maxReimbursementForCountry: countryLimit?.maxReimbursementAmount || null,
  });
});

/**
 * PATCH /api/admin/participants/:id
 * Update a participant
 */
router.patch('/:id', async (req: Request, res: Response) => {
  const result = updateParticipantSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  // Get current values for change log
  const current = await prisma.participant.findUnique({
    where: { id: req.params.id },
  });

  if (!current) {
    throw new NotFoundError('Participant not found');
  }

  const participant = await prisma.participant.update({
    where: { id: req.params.id },
    data: result.data,
  });

  // Create change log entries
  const changes = result.data;
  for (const [field, newValue] of Object.entries(changes)) {
    const previousValue = (current as Record<string, unknown>)[field];
    if (previousValue !== newValue) {
      await prisma.changeLogEntry.create({
        data: {
          participantId: participant.id,
          userType: 'ADMIN',
          fieldName: field,
          previousValue: String(previousValue ?? ''),
          newValue: String(newValue ?? ''),
        },
      });
    }
  }

  res.json(participant);
});

/**
 * POST /api/admin/participants/import
 * Import participants from CSV
 */
router.post('/import', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ValidationError('CSV file is required');
  }

  const { projectId } = req.body;
  if (!projectId) {
    throw new ValidationError('Project ID is required');
  }

  // Parse CSV
  const content = req.file.buffer.toString('utf-8');
  let records: Record<string, string>[];

  try {
    records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    throw new ValidationError('Invalid CSV format');
  }

  // Validate required columns
  const requiredColumns = ['first_name', 'last_name', 'email', 'country'];
  const columns = Object.keys(records[0] || {}).map((c) => c.toLowerCase());

  for (const col of requiredColumns) {
    if (!columns.includes(col)) {
      throw new ValidationError(`Missing required column: ${col}`);
    }
  }

  // Create participants
  const created = [];
  const errors = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2; // +2 for header and 0-index

    // Normalize column names
    const data = {
      firstName: row.first_name || row.firstName,
      lastName: row.last_name || row.lastName,
      email: row.email,
      country: row.country,
    };

    // Validate
    if (!data.firstName || !data.lastName || !data.email || !data.country) {
      errors.push({ row: rowNum, error: 'Missing required fields' });
      continue;
    }

    // Check for duplicate email in this project
    const existing = await prisma.participant.findFirst({
      where: {
        projectId,
        email: data.email,
      },
    });

    if (existing) {
      errors.push({ row: rowNum, error: `Email ${data.email} already exists in this project` });
      continue;
    }

    try {
      const participant = await prisma.participant.create({
        data: {
          projectId,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          country: data.country,
          magicLinkToken: uuidv4(),
          status: ParticipantStatus.DRAFT,
        },
      });

      // Create empty reimbursement summary
      await prisma.reimbursementSummary.create({
        data: {
          participantId: participant.id,
        },
      });

      created.push(participant);
    } catch (error) {
      errors.push({ row: rowNum, error: 'Failed to create participant' });
    }
  }

  res.json({
    success: true,
    created: created.length,
    errors,
    participants: created,
  });
});

/**
 * POST /api/admin/participants/preview-import
 * Preview CSV import without creating records
 */
router.post('/preview-import', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ValidationError('CSV file is required');
  }

  const content = req.file.buffer.toString('utf-8');
  let records: Record<string, string>[];

  try {
    records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    throw new ValidationError('Invalid CSV format');
  }

  const columns = Object.keys(records[0] || {});
  const preview = records.slice(0, 10).map((row) => ({
    firstName: row.first_name || row.firstName,
    lastName: row.last_name || row.lastName,
    email: row.email,
    country: row.country,
  }));

  res.json({
    totalRows: records.length,
    columns,
    preview,
  });
});

/**
 * POST /api/admin/participants/:id/send-magic-link
 * Send or resend magic link email
 */
router.post('/:id/send-magic-link', async (req: Request, res: Response) => {
  const participant = await prisma.participant.findUnique({
    where: { id: req.params.id },
    include: {
      project: true,
    },
  });

  if (!participant) {
    throw new NotFoundError('Participant not found');
  }

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
    where: { id: participant.id },
    data: { lastMagicLinkSentAt: new Date() },
  });

  res.json({ success: true, message: 'Magic link email sent' });
});

/**
 * POST /api/admin/participants/send-magic-links-bulk
 * Send magic links to multiple participants
 */
router.post('/send-magic-links-bulk', async (req: Request, res: Response) => {
  const { participantIds } = req.body;

  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    throw new ValidationError('participantIds array is required');
  }

  const participants = await prisma.participant.findMany({
    where: { id: { in: participantIds } },
    include: { project: true },
  });

  const emailService = getEmailService();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const results = [];

  for (const participant of participants) {
    const magicLink = `${frontendUrl}/reimbursement?token=${participant.magicLinkToken}`;

    try {
      await emailService.sendMagicLink(
        participant.email,
        participant.firstName,
        participant.project.name,
        magicLink
      );

      await prisma.participant.update({
        where: { id: participant.id },
        data: { lastMagicLinkSentAt: new Date() },
      });

      results.push({ id: participant.id, success: true });
    } catch (error) {
      results.push({ id: participant.id, success: false, error: 'Failed to send email' });
    }
  }

  res.json({ results });
});

/**
 * POST /api/admin/participants/:id/regenerate-token
 * Regenerate magic link token
 */
router.post('/:id/regenerate-token', async (req: Request, res: Response) => {
  const participant = await prisma.participant.update({
    where: { id: req.params.id },
    data: {
      magicLinkToken: uuidv4(),
      magicLinkActive: true,
    },
  });

  res.json({ success: true, token: participant.magicLinkToken });
});

/**
 * POST /api/admin/participants/:id/deactivate-token
 * Deactivate magic link token
 */
router.post('/:id/deactivate-token', async (req: Request, res: Response) => {
  await prisma.participant.update({
    where: { id: req.params.id },
    data: { magicLinkActive: false },
  });

  res.json({ success: true });
});

/**
 * POST /api/admin/participants/:id/mark-ai-check-ok
 * Mark AI check as OK
 */
router.post('/:id/mark-ai-check-ok', async (req: Request, res: Response) => {
  await prisma.reimbursementSummary.update({
    where: { participantId: req.params.id },
    data: { aiCheckOk: true },
  });

  res.json({ success: true });
});

/**
 * POST /api/admin/participants/:id/approve
 * Mark participant as admin approved
 */
router.post('/:id/approve', async (req: Request, res: Response) => {
  const { amountToReimburse, adminNotes } = req.body;

  await prisma.$transaction([
    prisma.reimbursementSummary.update({
      where: { participantId: req.params.id },
      data: {
        adminApproved: true,
        ...(amountToReimburse !== undefined && { amountToReimburse }),
        ...(adminNotes !== undefined && { adminNotes }),
      },
    }),
    prisma.participant.update({
      where: { id: req.params.id },
      data: { status: ParticipantStatus.ADMIN_APPROVED },
    }),
  ]);

  res.json({ success: true });
});

/**
 * POST /api/admin/participants/:id/mark-paid
 * Mark reimbursement as paid
 */
router.post('/:id/mark-paid', async (req: Request, res: Response) => {
  await prisma.$transaction([
    prisma.reimbursementSummary.update({
      where: { participantId: req.params.id },
      data: { paid: true },
    }),
    prisma.participant.update({
      where: { id: req.params.id },
      data: { status: ParticipantStatus.PAID },
    }),
  ]);

  res.json({ success: true });
});

/**
 * POST /api/admin/participants/:id/recalculate
 * Recalculate reimbursement summary
 */
router.post('/:id/recalculate', async (req: Request, res: Response) => {
  const aiService = getAiService();
  await aiService.recalculateParticipantSummary(req.params.id);

  const summary = await prisma.reimbursementSummary.findUnique({
    where: { participantId: req.params.id },
  });

  res.json({ success: true, summary });
});

/**
 * DELETE /api/admin/participants/:id
 * Delete a participant and all their data
 */
router.delete('/:id', async (req: Request, res: Response) => {
  const participant = await prisma.participant.findUnique({
    where: { id: req.params.id },
    include: { documents: true },
  });

  if (!participant) {
    throw new NotFoundError('Participant not found');
  }

  // Delete uploaded files
  const storage = getStorageService();
  for (const doc of participant.documents) {
    await storage.delete(doc.storedFilePath);
  }

  // Delete participant (cascades to related records)
  await prisma.participant.delete({
    where: { id: req.params.id },
  });

  res.json({ success: true });
});

// Travel Items Management

/**
 * POST /api/admin/participants/:id/travel-items
 * Add a travel item
 */
router.post('/:id/travel-items', async (req: Request, res: Response) => {
  const result = createTravelItemSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const travelItem = await prisma.travelItem.create({
    data: {
      participantId: req.params.id,
      ...result.data,
    },
  });

  // Recalculate summary
  const aiService = getAiService();
  await aiService.recalculateParticipantSummary(req.params.id);

  res.status(201).json(travelItem);
});

/**
 * PATCH /api/admin/participants/:participantId/travel-items/:itemId
 * Update a travel item
 */
router.patch('/:participantId/travel-items/:itemId', async (req: Request, res: Response) => {
  const result = updateTravelItemSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  // Get current values for change log
  const current = await prisma.travelItem.findUnique({
    where: { id: req.params.itemId },
  });

  if (!current) {
    throw new NotFoundError('Travel item not found');
  }

  const travelItem = await prisma.travelItem.update({
    where: { id: req.params.itemId },
    data: result.data,
  });

  // Create change log entries
  for (const [field, newValue] of Object.entries(result.data)) {
    const previousValue = (current as Record<string, unknown>)[field];
    if (previousValue !== newValue) {
      await prisma.changeLogEntry.create({
        data: {
          participantId: req.params.participantId,
          userType: 'ADMIN',
          fieldName: `travelItem.${field}`,
          previousValue: String(previousValue ?? ''),
          newValue: String(newValue ?? ''),
        },
      });
    }
  }

  // Recalculate summary
  const aiService = getAiService();
  await aiService.recalculateParticipantSummary(req.params.participantId);

  res.json(travelItem);
});

/**
 * DELETE /api/admin/participants/:participantId/travel-items/:itemId
 * Delete a travel item
 */
router.delete('/:participantId/travel-items/:itemId', async (req: Request, res: Response) => {
  await prisma.travelItem.delete({
    where: { id: req.params.itemId },
  });

  // Recalculate summary
  const aiService = getAiService();
  await aiService.recalculateParticipantSummary(req.params.participantId);

  res.json({ success: true });
});

/**
 * DELETE /api/admin/participants/:participantId/documents/:documentId
 * Delete a document
 */
router.delete('/:participantId/documents/:documentId', async (req: Request, res: Response) => {
  const doc = await prisma.document.findUnique({
    where: { id: req.params.documentId },
  });

  if (!doc) {
    throw new NotFoundError('Document not found');
  }

  // Delete file from storage
  const storage = getStorageService();
  await storage.delete(doc.storedFilePath);

  // Delete record
  await prisma.document.delete({
    where: { id: req.params.documentId },
  });

  res.json({ success: true });
});

/**
 * PATCH /api/admin/participants/:participantId/documents/:documentId
 * Update document metadata
 */
router.patch('/:participantId/documents/:documentId', async (req: Request, res: Response) => {
  const { documentType, renamedFilename } = req.body;

  const doc = await prisma.document.update({
    where: { id: req.params.documentId },
    data: {
      ...(documentType && { documentType: documentType as DocumentType }),
      ...(renamedFilename && { renamedFilename }),
    },
  });

  res.json(doc);
});

export default router;

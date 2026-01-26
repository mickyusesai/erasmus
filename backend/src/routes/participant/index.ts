import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../utils/prisma.js';
import { participantAuth, ensureOwnParticipant } from '../../middleware/auth.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../middleware/errorHandler.js';
import { getStorageService } from '../../services/storage/index.js';
import { getAiService } from '../../services/ai/index.js';
import { JourneyConsolidationService } from '../../services/ai/journeyConsolidationService.js';
import { ParticipantStatus, TransportMode, DocumentType } from '@prisma/client';

// Initialize the consolidation service
const consolidationService = new JourneyConsolidationService();

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPG, PNG, and WebP are allowed.'));
    }
  },
});

// Validation schemas
const updateBankDetailsSchema = z.object({
  bankAccountIban: z.string().min(1, 'IBAN is required'),
  bankAccountHolderName: z.string().min(1, 'Account holder name is required'),
  bankAccountBic: z.string().optional(),
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

const declarationOnHonorSchema = z.object({
  missingDocumentType: z.nativeEnum(DocumentType),
  description: z.string().min(1, 'Description is required'),
  reason: z.string().min(1, 'Reason is required'),
  place: z.string().min(1, 'Place is required'),
});

// Wrap async route handlers
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * GET /api/participant/auth
 * Authenticate with magic link token and get participant data
 */
router.get('/auth', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  const data = await prisma.participant.findUnique({
    where: { id: participant.id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          description: true,
          country: true,
          startDate: true,
          endDate: true,
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
    },
  });

  // Get country limit
  const countryLimit = data?.project.countryLimits.find(
    (limit) => limit.country === participant.country
  );

  // Calculate completion status
  const aiService = getAiService();
  const validation = await aiService.validateReimbursement(participant.id);

  res.json({
    participant: {
      id: data?.id,
      firstName: data?.firstName,
      lastName: data?.lastName,
      email: data?.email,
      country: data?.country,
      status: data?.status,
      bankAccountIban: data?.bankAccountIban,
      bankAccountHolderName: data?.bankAccountHolderName,
      bankAccountBic: data?.bankAccountBic,
    },
    project: data?.project,
    documents: data?.documents,
    travelItems: data?.travelItems,
    reimbursementSummary: data?.reimbursementSummary,
    declarationsOnHonor: data?.declarationsOnHonor,
    maxReimbursementForCountry: countryLimit?.maxReimbursementAmount || null,
    validation,
  });
}));

/**
 * POST /api/participant/documents
 * Upload a document - extracts data but does NOT create travel items
 * Travel items are created during consolidation (when moving to Step 2)
 */
router.post(
  '/documents',
  participantAuth,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const participant = req.participant!;

    if (!req.file) {
      throw new ValidationError('File is required');
    }

    // Check if participant can still upload
    if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
      throw new ForbiddenError('Cannot upload documents after approval');
    }

    const storage = getStorageService();

    // Generate storage path
    const ext = path.extname(req.file.originalname);
    const storagePath = `participants/${participant.id}/documents/${uuidv4()}${ext}`;

    // Store file
    await storage.store(
      {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
      storagePath
    );

    // Create document record (with default type, will be updated by extraction)
    const document = await prisma.document.create({
      data: {
        participantId: participant.id,
        storedFilePath: storagePath,
        originalFilename: req.file.originalname,
        renamedFilename: req.file.originalname, // Will be updated after analysis
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        documentType: 'OTHER', // Will be updated by extraction
      },
    });

    // Extract and store document data using the consolidation service
    // This stores the extraction but does NOT create travel items
    await consolidationService.extractAndStoreDocumentData(
      document.id,
      req.file.buffer,
      req.file.mimetype
    );

    // Fetch the updated document with extraction
    const updatedDocument = await prisma.document.findUnique({
      where: { id: document.id },
      include: { extraction: true },
    });

    // Clear the consolidation flag since we have new documents
    await prisma.participant.update({
      where: { id: participant.id },
      data: { journeyConsolidatedAt: null },
    });

    res.status(201).json({
      document: updatedDocument,
      extraction: updatedDocument?.extraction,
      message: 'Document uploaded and analyzed. Travel items will be created when you proceed to review.',
    });
  })
);

/**
 * POST /api/participant/consolidate
 * Consolidate all documents into a coherent journey
 * This should be called when moving from Step 1 (Upload) to Step 2 (Review)
 */
router.post('/consolidate', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Cannot modify data after approval');
  }

  // Check if there are any documents to consolidate
  const docCount = await prisma.document.count({
    where: { participantId: participant.id },
  });

  if (docCount === 0) {
    res.json({
      success: false,
      message: 'No documents to consolidate',
      travelItems: [],
      warnings: ['Please upload at least one travel document'],
    });
    return;
  }

  // Run the consolidation
  const result = await consolidationService.consolidateParticipantJourney(participant.id);

  // Recalculate summary after consolidation
  const aiService = getAiService();
  await aiService.recalculateParticipantSummary(participant.id);

  res.json(result);
}));

/**
 * GET /api/participant/documents/:id/url
 * Get document URL for viewing
 */
router.get('/documents/:id/url', participantAuth, ensureOwnParticipant, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  const document = await prisma.document.findFirst({
    where: {
      id: req.params.id,
      participantId: participant.id,
    },
  });

  if (!document) {
    throw new NotFoundError('Document not found');
  }

  const storage = getStorageService();
  const url = await storage.getUrl(document.storedFilePath);

  res.json({ url });
}));

/**
 * DELETE /api/participant/documents/:id
 * Delete a document
 */
router.delete('/documents/:id', participantAuth, ensureOwnParticipant, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Cannot delete documents after approval');
  }

  const document = await prisma.document.findFirst({
    where: {
      id: req.params.id,
      participantId: participant.id,
    },
  });

  if (!document) {
    throw new NotFoundError('Document not found');
  }

  // Delete file from storage
  const storage = getStorageService();
  await storage.delete(document.storedFilePath);

  // Delete record
  await prisma.document.delete({
    where: { id: document.id },
  });

  // Recalculate summary
  const aiService = getAiService();
  await aiService.recalculateParticipantSummary(participant.id);

  res.json({ success: true });
}));

const createTravelItemSchema = z.object({
  modeOfTransport: z.nativeEnum(TransportMode),
  fromLocation: z.string().min(1, 'From location is required'),
  toLocation: z.string().min(1, 'To location is required'),
  departureDate: z.string().transform((s) => new Date(s)),
  arrivalDate: z.string().transform((s) => new Date(s)).nullable().optional(),
  bookingReference: z.string().nullable().optional(),
  flightNumber: z.string().nullable().optional(),
  amountOriginal: z.number(),
  currencyOriginal: z.string().default('EUR'),
  purchaseDate: z.string().transform((s) => new Date(s)).nullable().optional(),
  amountEur: z.number().optional(),
  documentId: z.string().uuid().nullable().optional(),
});

/**
 * POST /api/participant/travel-items
 * Create a travel item manually
 */
router.post('/travel-items', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Cannot add travel items after approval');
  }

  const result = createTravelItemSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const aiService = getAiService();

  // Convert currency to EUR if not already
  let amountEur = result.data.amountEur;
  if (!amountEur && result.data.amountOriginal && result.data.currencyOriginal) {
    amountEur = await aiService.convertToEur(
      result.data.amountOriginal,
      result.data.currencyOriginal,
      result.data.purchaseDate || undefined
    );
  }

  // If documentId is provided, verify it belongs to this participant
  if (result.data.documentId) {
    const doc = await prisma.document.findFirst({
      where: {
        id: result.data.documentId,
        participantId: participant.id,
      },
    });
    if (!doc) {
      throw new NotFoundError('Document not found');
    }
  }

  const travelItem = await prisma.travelItem.create({
    data: {
      participantId: participant.id,
      documentId: result.data.documentId || null,
      modeOfTransport: result.data.modeOfTransport,
      fromLocation: result.data.fromLocation,
      toLocation: result.data.toLocation,
      departureDate: result.data.departureDate,
      arrivalDate: result.data.arrivalDate || null,
      bookingReference: result.data.bookingReference || null,
      flightNumber: result.data.flightNumber || null,
      amountOriginal: result.data.amountOriginal,
      currencyOriginal: result.data.currencyOriginal,
      purchaseDate: result.data.purchaseDate || null,
      amountEur: amountEur || result.data.amountOriginal,
    },
  });

  // Recalculate summary
  await aiService.recalculateParticipantSummary(participant.id);

  res.status(201).json(travelItem);
}));

/**
 * PATCH /api/participant/travel-items/:id
 * Update a travel item
 */
router.patch('/travel-items/:id', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Cannot update travel items after approval');
  }

  const result = updateTravelItemSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  // Verify ownership
  const current = await prisma.travelItem.findFirst({
    where: {
      id: req.params.id,
      participantId: participant.id,
    },
  });

  if (!current) {
    throw new NotFoundError('Travel item not found');
  }

  // Update
  const travelItem = await prisma.travelItem.update({
    where: { id: req.params.id },
    data: result.data,
  });

  // Create change log entries
  for (const [field, newValue] of Object.entries(result.data)) {
    const previousValue = (current as Record<string, unknown>)[field];
    if (previousValue !== newValue) {
      await prisma.changeLogEntry.create({
        data: {
          participantId: participant.id,
          userType: 'PARTICIPANT',
          fieldName: `travelItem.${field}`,
          previousValue: String(previousValue ?? ''),
          newValue: String(newValue ?? ''),
        },
      });
    }
  }

  // Recalculate summary
  const aiService = getAiService();
  await aiService.recalculateParticipantSummary(participant.id);

  res.json(travelItem);
}));

/**
 * DELETE /api/participant/travel-items/:id
 * Delete a travel item
 */
router.delete('/travel-items/:id', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Cannot delete travel items after approval');
  }

  // Verify ownership
  const item = await prisma.travelItem.findFirst({
    where: {
      id: req.params.id,
      participantId: participant.id,
    },
  });

  if (!item) {
    throw new NotFoundError('Travel item not found');
  }

  await prisma.travelItem.delete({
    where: { id: req.params.id },
  });

  // Recalculate summary
  const aiService = getAiService();
  await aiService.recalculateParticipantSummary(participant.id);

  res.json({ success: true });
}));

/**
 * PATCH /api/participant/bank-details
 * Update bank details
 */
router.patch('/bank-details', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Cannot update bank details after approval');
  }

  const result = updateBankDetailsSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  // Get current values for change log
  const current = await prisma.participant.findUnique({
    where: { id: participant.id },
  });

  const updated = await prisma.participant.update({
    where: { id: participant.id },
    data: result.data,
  });

  // Create change log entries
  for (const [field, newValue] of Object.entries(result.data)) {
    const previousValue = (current as Record<string, unknown>)[field];
    if (previousValue !== newValue) {
      await prisma.changeLogEntry.create({
        data: {
          participantId: participant.id,
          userType: 'PARTICIPANT',
          fieldName: field,
          previousValue: String(previousValue ?? ''),
          newValue: String(newValue ?? ''),
        },
      });
    }
  }

  res.json({
    bankAccountIban: updated.bankAccountIban,
    bankAccountHolderName: updated.bankAccountHolderName,
    bankAccountBic: updated.bankAccountBic,
  });
}));

/**
 * POST /api/participant/declarations
 * Create a declaration on honor for missing document
 */
router.post('/declarations', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Cannot add declarations after approval');
  }

  const result = declarationOnHonorSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const declaration = await prisma.declarationOnHonor.create({
    data: {
      participantId: participant.id,
      ...result.data,
    },
  });

  // Recalculate summary
  const aiService = getAiService();
  await aiService.recalculateParticipantSummary(participant.id);

  res.status(201).json(declaration);
}));

/**
 * DELETE /api/participant/declarations/:id
 * Delete a declaration on honor
 */
router.delete('/declarations/:id', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Cannot delete declarations after approval');
  }

  const declaration = await prisma.declarationOnHonor.findFirst({
    where: {
      id: req.params.id,
      participantId: participant.id,
    },
  });

  if (!declaration) {
    throw new NotFoundError('Declaration not found');
  }

  await prisma.declarationOnHonor.delete({
    where: { id: declaration.id },
  });

  res.json({ success: true });
}));

/**
 * POST /api/participant/mark-complete
 * Mark reimbursement as complete (participant side)
 */
router.post('/mark-complete', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  if (participant.status !== 'DRAFT') {
    throw new ForbiddenError('Reimbursement already marked as complete');
  }

  // Validate all required data is present
  const aiService = getAiService();
  const validation = await aiService.validateReimbursement(participant.id);

  if (!validation.isComplete) {
    res.status(400).json({
      success: false,
      message: 'Cannot mark as complete - missing required items',
      missingItems: validation.missingItems,
      warnings: validation.warnings,
    });
    return;
  }

  // Update status
  await prisma.participant.update({
    where: { id: participant.id },
    data: { status: ParticipantStatus.PARTICIPANT_COMPLETE },
  });

  // Update summary
  await prisma.reimbursementSummary.update({
    where: { participantId: participant.id },
    data: { aiCheckOk: validation.aiCheckPassed },
  });

  res.json({ success: true });
}));

/**
 * GET /api/participant/validate
 * Get validation status
 */
router.get('/validate', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  const aiService = getAiService();
  const validation = await aiService.validateReimbursement(participant.id);

  res.json(validation);
}));

export default router;

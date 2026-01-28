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
import { getExchangeRate, convertToEur, SUPPORTED_CURRENCIES } from '../../services/exchangeRate/index.js';
import { generateDeclarationPdf } from '../../services/pdf/index.js';
import disseminationRoutes from './dissemination.js';

// Initialize the consolidation service
const consolidationService = new JourneyConsolidationService();

const router = Router();

// Mount dissemination routes
router.use('/dissemination', disseminationRoutes);
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

interface DeclarationOfTravelInput {
  travelItemId?: string;
  name: string;
  modeOfTransport: TransportMode;
  fromPlace: string;
  toPlace: string;
  travelDate: string;
  flightNumber?: string | null;
  bookingReference?: string | null;
  dateOfBirth: string;
  idNumber: string;
  sendingOrgName: string;
  sendingOrgOid?: string | null;
  sendingOrgAddress: string;
  signatureDataUrl: string;
}

const declarationOfTravelSchema = z.object({
  travelItemId: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  modeOfTransport: z.nativeEnum(TransportMode),
  fromPlace: z.string().min(1, 'Departure place is required'),
  toPlace: z.string().min(1, 'Arrival place is required'),
  travelDate: z.string().min(1, 'Travel date is required'),
  flightNumber: z.string().nullable().optional(),
  bookingReference: z.string().nullable().optional(),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  idNumber: z.string().min(1, 'ID number is required'),
  sendingOrgName: z.string().min(1, 'Sending organisation name is required'),
  sendingOrgOid: z.string().nullable().optional(),
  sendingOrgAddress: z.string().min(1, 'Sending organisation address is required'),
  signatureDataUrl: z.string().min(1, 'Signature is required'),
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
          disseminationEnabled: true,
        },
      },
      documents: {
        orderBy: { uploadDate: 'desc' },
      },
      travelItems: {
        orderBy: { departureDate: 'asc' },
        include: {
          declarationsOfTravel: true,
        },
      },
      reimbursementSummary: true,
      declarationsOnHonor: true,
      declarationsOfTravel: true,
    },
  });

  // Get country limit
  const countryLimit = data?.project.countryLimits.find(
    (limit: { country: string }) => limit.country === participant.country
  );

  // Calculate completion status
  const aiService = getAiService();
  const validation = await aiService.validateReimbursement(participant.id);

  // Get dissemination status
  let disseminationStatus = {
    hasDisseminationActivity: false,
    hasSocialMediaPost: false,
  };

  if (data?.project.disseminationEnabled) {
    const activityCount = await prisma.disseminationActivity.count({
      where: {
        projectId: data.project.id,
        country: participant.country,
      },
    });
    const socialMediaCount = await prisma.socialMediaPost.count({
      where: { participantId: participant.id },
    });
    disseminationStatus = {
      hasDisseminationActivity: activityCount > 0,
      hasSocialMediaPost: socialMediaCount > 0,
    };
  }

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
      participantNote: data?.participantNote,
    },
    project: {
      ...data?.project,
      disseminationEnabled: data?.project.disseminationEnabled || false,
    },
    documents: data?.documents,
    travelItems: data?.travelItems,
    reimbursementSummary: data?.reimbursementSummary,
    declarationsOnHonor: data?.declarationsOnHonor,
    declarationsOfTravel: data?.declarationsOfTravel,
    maxReimbursementForCountry: countryLimit?.maxReimbursementAmount || null,
    greenTravel: countryLimit?.greenTravel || false,
    validation,
    disseminationStatus,
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

  // Check if amount is being changed (participant manually editing AI value)
  const isAmountChange = result.data.amountOriginal !== undefined &&
    result.data.amountOriginal !== current.amountOriginal;

  // Prepare update data
  const updateData: Record<string, unknown> = { ...result.data };

  // If amount is being changed, mark as manually edited
  if (isAmountChange) {
    updateData.manuallyEdited = true;
    // Store original AI amount if not already set
    if (!current.originalAmountFromAi) {
      updateData.originalAmountFromAi = current.amountOriginal;
    }
  }

  // Update
  const travelItem = await prisma.travelItem.update({
    where: { id: req.params.id },
    data: updateData,
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

  // If amount was changed from AI value, add a specific warning log
  if (isAmountChange) {
    const originalAmount = current.originalAmountFromAi || current.amountOriginal;
    await prisma.changeLogEntry.create({
      data: {
        participantId: participant.id,
        userType: 'PARTICIPANT',
        fieldName: 'travelItem.manualPriceChange',
        previousValue: `AI detected: ${originalAmount} ${current.currencyOriginal}`,
        newValue: `Changed to: ${result.data.amountOriginal} ${current.currencyOriginal}`,
      },
    });
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
 * POST /api/participant/travel-items/:id/link-document
 * Link an existing document to a travel item (for manually linking unrecognized boarding passes)
 */
router.post('/travel-items/:id/link-document', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Cannot modify travel items after approval');
  }

  const { documentId } = req.body;

  if (!documentId) {
    throw new ValidationError('Document ID is required');
  }

  // Verify travel item ownership
  const travelItem = await prisma.travelItem.findFirst({
    where: {
      id: req.params.id,
      participantId: participant.id,
    },
  });

  if (!travelItem) {
    throw new NotFoundError('Travel item not found');
  }

  // Verify document ownership
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      participantId: participant.id,
    },
  });

  if (!document) {
    throw new NotFoundError('Document not found');
  }

  // Update travel item with document link
  const updated = await prisma.travelItem.update({
    where: { id: req.params.id },
    data: { documentId },
  });

  // Log the change
  await prisma.changeLogEntry.create({
    data: {
      participantId: participant.id,
      userType: 'PARTICIPANT',
      fieldName: 'travelItem.documentLink',
      previousValue: travelItem.documentId || '(none)',
      newValue: `Linked to: ${document.renamedFilename}`,
    },
  });

  res.json(updated);
}));

/**
 * DELETE /api/participant/travel-items/:id/link-document
 * Unlink a document from a travel item
 */
router.delete('/travel-items/:id/link-document', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Cannot modify travel items after approval');
  }

  // Verify travel item ownership
  const travelItem = await prisma.travelItem.findFirst({
    where: {
      id: req.params.id,
      participantId: participant.id,
    },
    include: { document: true },
  });

  if (!travelItem) {
    throw new NotFoundError('Travel item not found');
  }

  // Update travel item to remove document link
  const updated = await prisma.travelItem.update({
    where: { id: req.params.id },
    data: { documentId: null },
  });

  // Log the change
  if (travelItem.document) {
    await prisma.changeLogEntry.create({
      data: {
        participantId: participant.id,
        userType: 'PARTICIPANT',
        fieldName: 'travelItem.documentLink',
        previousValue: `Linked to: ${travelItem.document.renamedFilename}`,
        newValue: '(unlinked)',
      },
    });
  }

  res.json(updated);
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
 * PUT /api/participant/note
 * Update participant's note explaining their travel situation
 */
router.put('/note', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Cannot update note after approval');
  }

  const { note } = req.body;

  if (typeof note !== 'string') {
    throw new ValidationError('Note must be a string');
  }

  const updated = await prisma.participant.update({
    where: { id: participant.id },
    data: { participantNote: note || null },
  });

  // Log the change
  await prisma.changeLogEntry.create({
    data: {
      participantId: participant.id,
      userType: 'PARTICIPANT',
      fieldName: 'participantNote',
      previousValue: participant.participantNote || '',
      newValue: note || '',
    },
  });

  res.json({ participantNote: updated.participantNote });
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
 * GET /api/participant/declarations-of-travel
 * Get all declarations of travel for this participant
 */
router.get('/declarations-of-travel', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  const declarations = await prisma.declarationOfTravel.findMany({
    where: { participantId: participant.id },
    include: {
      travelItem: {
        select: {
          id: true,
          modeOfTransport: true,
          fromLocation: true,
          toLocation: true,
          departureDate: true,
          flightNumber: true,
        },
      },
    },
    orderBy: { signedAt: 'desc' },
  });

  res.json({ declarations });
}));

/**
 * POST /api/participant/declarations-of-travel
 * Create a declaration of travel with signature and generate PDF
 */
router.post('/declarations-of-travel', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Cannot add declarations after approval');
  }

  const result = declarationOfTravelSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const data = result.data as DeclarationOfTravelInput;

  // Convert date strings to Date objects
  const travelDateObj = new Date(data.travelDate);
  const dateOfBirthObj = new Date(data.dateOfBirth);

  // If linking to a travel item, verify ownership
  if (data.travelItemId) {
    const travelItem = await prisma.travelItem.findFirst({
      where: {
        id: data.travelItemId,
        participantId: participant.id,
      },
    });

    if (!travelItem) {
      throw new NotFoundError('Travel item not found');
    }
  }

  // Generate PDF
  const { filePath, fileName } = await generateDeclarationPdf(participant.id, {
    name: data.name,
    modeOfTransport: data.modeOfTransport,
    fromPlace: data.fromPlace,
    toPlace: data.toPlace,
    travelDate: travelDateObj,
    flightNumber: data.flightNumber,
    bookingReference: data.bookingReference,
    dateOfBirth: data.dateOfBirth,
    idNumber: data.idNumber,
    sendingOrgName: data.sendingOrgName,
    sendingOrgOid: data.sendingOrgOid,
    sendingOrgAddress: data.sendingOrgAddress,
    signatureDataUrl: data.signatureDataUrl,
  });

  // Create the declaration record
  const declaration = await prisma.declarationOfTravel.create({
    data: {
      participantId: participant.id,
      travelItemId: data.travelItemId || null,
      name: data.name,
      modeOfTransport: data.modeOfTransport,
      fromPlace: data.fromPlace,
      toPlace: data.toPlace,
      travelDate: travelDateObj,
      flightNumber: data.flightNumber || null,
      bookingReference: data.bookingReference || null,
      dateOfBirth: dateOfBirthObj,
      idNumber: data.idNumber,
      sendingOrgName: data.sendingOrgName,
      sendingOrgOid: data.sendingOrgOid || null,
      sendingOrgAddress: data.sendingOrgAddress,
      signatureDataUrl: data.signatureDataUrl,
      generatedPdfPath: filePath,
    },
  });

  // Also create a document record for the PDF so it appears in the participant's documents
  await prisma.document.create({
    data: {
      participantId: participant.id,
      storedFilePath: filePath,
      originalFilename: fileName,
      renamedFilename: fileName,
      mimeType: 'application/pdf',
      fileSize: 0, // We don't have the exact size here, it's not critical
      documentType: DocumentType.OTHER, // Declaration of travel
    },
  });

  // Log the change
  await prisma.changeLogEntry.create({
    data: {
      participantId: participant.id,
      userType: 'PARTICIPANT',
      fieldName: 'declarationOfTravel',
      previousValue: '',
      newValue: `Created declaration for ${data.fromPlace} to ${data.toPlace}`,
    },
  });

  res.status(201).json(declaration);
}));

/**
 * DELETE /api/participant/declarations-of-travel/:id
 * Delete a declaration of travel
 */
router.delete('/declarations-of-travel/:id', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Cannot delete declarations after approval');
  }

  const declaration = await prisma.declarationOfTravel.findFirst({
    where: {
      id: req.params.id,
      participantId: participant.id,
    },
  });

  if (!declaration) {
    throw new NotFoundError('Declaration not found');
  }

  // Delete the PDF from storage if it exists
  if (declaration.generatedPdfPath) {
    const storage = getStorageService();
    try {
      await storage.delete(declaration.generatedPdfPath);
    } catch (error) {
      console.error('[Declaration] Failed to delete PDF from storage:', error);
    }

    // Also delete the document record
    await prisma.document.deleteMany({
      where: {
        participantId: participant.id,
        storedFilePath: declaration.generatedPdfPath,
      },
    });
  }

  // Delete the declaration
  await prisma.declarationOfTravel.delete({
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

/**
 * GET /api/participant/exchange-rate
 * Get exchange rate for a specific currency and date
 * Query params: currency, purchaseDate (ISO string)
 */
router.get('/exchange-rate', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const { currency, purchaseDate } = req.query;

  if (!currency) {
    res.status(400).json({ error: 'Currency is required' });
    return;
  }

  const currencyCode = (currency as string).toUpperCase();

  if (currencyCode === 'EUR') {
    res.json({
      currency: 'EUR',
      rateToEur: 1,
      supportedCurrencies: SUPPORTED_CURRENCIES,
    });
    return;
  }

  const date = purchaseDate ? new Date(purchaseDate as string) : new Date();

  if (isNaN(date.getTime())) {
    res.status(400).json({ error: 'Invalid date format' });
    return;
  }

  const rate = await getExchangeRate(currencyCode, date);

  res.json({
    currency: currencyCode,
    rateToEur: rate,
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    supportedCurrencies: SUPPORTED_CURRENCIES,
  });
}));

/**
 * POST /api/participant/convert-currency
 * Convert amount from a currency to EUR using InforEuro rates
 * Body: { amount, currency, purchaseDate }
 */
router.post('/convert-currency', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const { amount, currency, purchaseDate } = req.body;

  if (typeof amount !== 'number' || !currency) {
    res.status(400).json({ error: 'Amount and currency are required' });
    return;
  }

  const date = purchaseDate ? new Date(purchaseDate) : new Date();
  const eurAmount = await convertToEur(amount, currency, date);
  const rate = await getExchangeRate(currency, date);

  res.json({
    originalAmount: amount,
    originalCurrency: currency.toUpperCase(),
    eurAmount,
    rateToEur: rate,
    purchaseDate: date.toISOString(),
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  });
}));

export default router;

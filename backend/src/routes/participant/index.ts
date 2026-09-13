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
import { ParticipantStatus, AiReviewStatus, TransportMode, DocumentType } from '@prisma/client';
import { getExchangeRate, convertToEur, SUPPORTED_CURRENCIES } from '../../services/exchangeRate/index.js';
import { getEmailService } from '../../services/email/index.js';
import { generateDeclarationPdf } from '../../services/pdf/index.js';
import { validateCityCountry } from '../../services/geocoding/index.js';
import { sortTravelItemsByJourney } from '../../utils/sortTravelItems.js';
import { getEffectiveLimit } from '../../utils/effectiveLimit.js';
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
  // Strip all whitespace from IBAN so it is always stored space-free (accountant requirement)
  bankAccountIban: z.string().min(1, 'IBAN is required').transform((s) => s.replace(/\s+/g, '').toUpperCase()),
  bankAccountHolderName: z.string().min(1, 'Account holder name is required'),
  bankAccountBic: z.string().optional(),
  bankName: z.string().optional(),
  personalAddress: z.string().optional(),
  personalCity: z.string().optional(),
  personalPostalCode: z.string().optional(),
  personalCountry: z.string().optional(),
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
  // Document linking
  documentId: z.string().nullable().optional(),
  additionalDocumentIds: z.string().nullable().optional(), // JSON array of additional document IDs
  // Multi-passenger bookings
  participantPortion: z.number().nullable().optional(),
  // Car travel specific
  distanceKm: z.number().nullable().optional(),
  isDriverCarpool: z.boolean().optional(),
  // Company / airline name
  companyName: z.string().nullable().optional(),
  // Exclude from reimbursement
  excludedFromReimbursement: z.boolean().optional(),
  exclusionReason: z.enum(['HOSTING_ORG_PAID', 'OTHER']).nullable().optional(),
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
  reason?: string | null;
  isCarTravel?: boolean;
  licensePlate?: string | null;
  driverName?: string | null;
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
  // New fields for car travel and reason
  reason: z.string().nullable().optional(),
  isCarTravel: z.boolean().optional(),
  licensePlate: z.string().nullable().optional(),
  driverName: z.string().nullable().optional(),
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
          carRatePerKm: true,
          aiAnalysisUnlocked: true,
          participantInstructions: true,
          documentDeadline: true,
          contactEmail: true,
          contactPhone: true,
          organisation: {
            select: {
              id: true,
              name: true,
              oid: true,
            },
          },
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

  // Applicable limit: individual override, else the country limit
  const effectiveLimit = data ? getEffectiveLimit(data, data.project.countryLimits) : null;

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
      bankName: data?.bankName,
      personalAddress: data?.personalAddress,
      personalCity: data?.personalCity,
      personalPostalCode: data?.personalPostalCode,
      personalCountry: data?.personalCountry,
      participantNote: data?.participantNote,
      detectedHomeCountry: data?.detectedHomeCountry,
      homeCountryConfidence: data?.homeCountryConfidence,
      homeCountryReasoning: data?.homeCountryReasoning,
      noReimbursement: data?.noReimbursement,
      reopenedAt: data?.reopenedAt,
      reopenMessage: data?.reopenMessage,
    },
    project: {
      ...data?.project,
      disseminationEnabled: data?.project.disseminationEnabled || false,
      carRatePerKm: data?.project.carRatePerKm ?? 0.22,
      organisation: data?.project.organisation || null,
    },
    documents: data?.documents,
    travelItems: sortTravelItemsByJourney(data?.travelItems ?? []),
    reimbursementSummary: data?.reimbursementSummary,
    declarationsOnHonor: data?.declarationsOnHonor,
    declarationsOfTravel: data?.declarationsOfTravel,
    maxReimbursementForCountry: effectiveLimit?.maxReimbursement || null,
    greenTravel: effectiveLimit?.greenTravel || false,
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

    // Enforce 15-document limit
    const existingDocCount = await prisma.document.count({
      where: { participantId: participant.id },
    });
    if (existingDocCount >= 15) {
      throw new ValidationError(
        'You have reached the maximum of 15 documents. Only upload documents for travel items you will claim reimbursement for. If you have additional evidence, you can add more detail manually after AI consolidation.'
      );
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

    // Create document record (type will be determined during consolidation)
    // If DB creation fails after a successful upload, clean up the orphaned S3 file
    let document;
    try {
      document = await prisma.document.create({
        data: {
          participantId: participant.id,
          storedFilePath: storagePath,
          originalFilename: req.file.originalname,
          renamedFilename: req.file.originalname,
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
          documentType: 'OTHER', // Will be updated during consolidation
        },
      });
    } catch (dbError) {
      // Upload succeeded but DB record failed — delete the orphaned file
      storage.delete(storagePath).catch((e) => console.error('[Upload] Failed to clean up orphaned file after DB error:', e));
      throw dbError;
    }

    // Clear the consolidation flag since we have new documents
    await prisma.participant.update({
      where: { id: participant.id },
      data: { journeyConsolidatedAt: null },
    });

    // Extract document data in the background (don't block the response)
    // This enables the AI to analyze the document so consolidation works later
    consolidationService.extractAndStoreDocumentData(
      document.id,
      req.file.buffer,
      req.file.mimetype
    ).catch((error) => {
      console.error(`[Upload] Background extraction failed for document ${document.id}:`, error);
    });

    res.status(201).json({
      document,
      message: 'Document uploaded successfully.',
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

  // AI analysis ("Build my trips") is locked until the project has ended,
  // unless the organisation has opened it early. Participants upload before/
  // during the project; trips are only built once the project is over.
  const gateProject = await prisma.project.findUnique({
    where: { id: participant.projectId },
    select: { endDate: true, aiAnalysisUnlocked: true },
  });
  if (gateProject) {
    const projectEnded = Date.now() >= gateProject.endDate.getTime();
    if (!projectEnded && !gateProject.aiAnalysisUnlocked) {
      throw new ForbiddenError('AI analysis opens when the project ends');
    }
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

  // Send email notifying the participant that analysis is complete
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const magicLink = `${frontendUrl}/reimbursement?token=${participant.magicLinkToken}`;
  const fullParticipant = await prisma.participant.findUnique({
    where: { id: participant.id },
    include: { project: true },
  });
  if (fullParticipant) {
    const emailService = getEmailService();
    emailService
      .sendAnalysisComplete(
        fullParticipant.email,
        fullParticipant.firstName,
        fullParticipant.project.name,
        magicLink
      )
      .catch((err) => console.error('[Consolidation] Failed to send analysis-complete email:', err));
  }

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
  // Car travel specific
  distanceKm: z.number().nullable().optional(),
  isDriverCarpool: z.boolean().nullable().optional(),
  // Company / airline name and comment
  companyName: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
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

  // Convert currency to EUR if not already (respect the project's exchange-rate mode)
  let amountEur = result.data.amountEur as number | undefined;
  const amountOriginal = result.data.amountOriginal as number;
  const currencyOriginal = result.data.currencyOriginal as string;
  if (!amountEur && amountOriginal && currencyOriginal) {
    const { convertToEurForParticipant } = await import('../../services/exchangeRate/index.js');
    amountEur = await convertToEurForParticipant(
      participant.id,
      amountOriginal,
      currencyOriginal,
      (result.data.purchaseDate as Date | null) || undefined
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
      checked: true, // Manually created items are checked by default
      // Car travel specific fields
      distanceKm: result.data.distanceKm || null,
      isDriverCarpool: result.data.isDriverCarpool ?? false,
      // Optional fields
      companyName: result.data.companyName || null,
      comment: result.data.comment || null,
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
    // Store original AI amount and currency if not already set
    if (!current.originalAmountFromAi) {
      updateData.originalAmountFromAi = current.amountOriginal;
      updateData.originalCurrencyFromAi = current.currencyOriginal;
    }
  }

  // Recalculate amountEur when the amount, currency, or purchase date changes.
  const amountOrCurrencyOrDateChanged =
    result.data.amountOriginal !== undefined ||
    result.data.currencyOriginal !== undefined ||
    result.data.purchaseDate !== undefined;
  if (amountOrCurrencyOrDateChanged) {
    const newAmount = (result.data.amountOriginal ?? current.amountOriginal) as number | null;
    const currency = (result.data.currencyOriginal || current.currencyOriginal) as string;
    const newPurchaseDate = (result.data.purchaseDate as Date | undefined) ?? current.purchaseDate ?? undefined;
    if (newAmount != null) {
      if (currency === 'EUR') {
        updateData.amountEur = newAmount;
      } else if (current.exchangeRateOverride != null) {
        // Respect an org-set per-item override
        updateData.amountEur = Math.round(newAmount * current.exchangeRateOverride * 100) / 100;
      } else {
        const { convertToEurForParticipant } = await import('../../services/exchangeRate/index.js');
        updateData.amountEur = await convertToEurForParticipant(participant.id, newAmount, currency, newPurchaseDate);
      }
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
 * Query params:
 *   deleteDocuments=true - also delete linked documents from storage and DB
 */
router.delete('/travel-items/:id', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;
  const deleteDocuments = req.query.deleteDocuments === 'true';

  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Cannot delete travel items after approval');
  }

  // Verify ownership and get linked documents
  const item = await prisma.travelItem.findFirst({
    where: {
      id: req.params.id,
      participantId: participant.id,
    },
  });

  if (!item) {
    throw new NotFoundError('Travel item not found');
  }

  // Collect document IDs to delete if requested
  const docIdsToDelete: string[] = [];
  if (deleteDocuments) {
    if (item.documentId) {
      docIdsToDelete.push(item.documentId);
    }
    if (item.additionalDocumentIds) {
      try {
        const additionalIds = JSON.parse(item.additionalDocumentIds) as string[];
        docIdsToDelete.push(...additionalIds);
      } catch {
        // Ignore parse errors
      }
    }
  }

  // Delete travel item first
  await prisma.travelItem.delete({
    where: { id: req.params.id },
  });

  // Delete linked documents if requested — but only if not referenced by other travel items
  if (deleteDocuments && docIdsToDelete.length > 0) {
    const storage = getStorageService();
    for (const docId of docIdsToDelete) {
      // Check if any OTHER travel items still reference this document
      const otherReferences = await prisma.travelItem.findMany({
        where: {
          participantId: participant.id,
          id: { not: req.params.id },
          OR: [
            { documentId: docId },
            { additionalDocumentIds: { contains: docId } },
          ],
        },
      });

      if (otherReferences.length > 0) {
        console.log(`[Delete] Skipping document ${docId} — still referenced by ${otherReferences.length} other travel item(s)`);
        continue;
      }

      const doc = await prisma.document.findFirst({
        where: { id: docId, participantId: participant.id },
      });
      if (doc) {
        // Delete from storage
        try {
          await storage.delete(doc.storedFilePath);
        } catch (error) {
          console.error(`[Delete] Failed to delete file from storage: ${doc.storedFilePath}`, error);
        }
        // Delete from DB
        await prisma.document.delete({ where: { id: docId } });
      }
    }
  }

  // Recalculate summary
  const aiService = getAiService();
  await aiService.recalculateParticipantSummary(participant.id);

  res.json({ success: true, deletedDocuments: docIdsToDelete.length });
}));

/**
 * PATCH /api/participant/travel-items/:id/toggle-checked
 * Toggle the checked status of a travel item
 */
router.patch('/travel-items/:id/toggle-checked', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Cannot modify travel items after approval');
  }

  // Verify ownership
  const travelItem = await prisma.travelItem.findFirst({
    where: {
      id: req.params.id,
      participantId: participant.id,
    },
  });

  if (!travelItem) {
    throw new NotFoundError('Travel item not found');
  }

  // Toggle the checked status
  const updated = await prisma.travelItem.update({
    where: { id: req.params.id },
    data: { checked: !travelItem.checked },
  });

  res.json(updated);
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
 * Unlink a specific document from a travel item
 * Body: { documentId: string } - the document to unlink
 */
router.delete('/travel-items/:id/link-document', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Cannot modify travel items after approval');
  }

  const { documentId: docIdToUnlink } = req.body;

  if (!docIdToUnlink) {
    throw new ValidationError('documentId is required');
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

  // Get the document being unlinked for logging
  const docToUnlink = await prisma.document.findFirst({
    where: { id: docIdToUnlink, participantId: participant.id },
  });

  // Determine if it's the primary document or an additional document
  const isPrimaryDoc = travelItem.documentId === docIdToUnlink;
  let additionalIds: string[] = [];
  try {
    additionalIds = travelItem.additionalDocumentIds ? JSON.parse(travelItem.additionalDocumentIds) : [];
  } catch {
    additionalIds = [];
  }
  const isAdditionalDoc = additionalIds.includes(docIdToUnlink);

  if (!isPrimaryDoc && !isAdditionalDoc) {
    throw new ValidationError('Document is not linked to this travel item');
  }

  // Update travel item to remove the document link
  const updateData: Record<string, unknown> = {};
  if (isPrimaryDoc) {
    updateData.documentId = null;
  }
  if (isAdditionalDoc) {
    const newAdditionalIds = additionalIds.filter((id: string) => id !== docIdToUnlink);
    updateData.additionalDocumentIds = newAdditionalIds.length > 0 ? JSON.stringify(newAdditionalIds) : null;
  }

  const updated = await prisma.travelItem.update({
    where: { id: req.params.id },
    data: updateData,
  });

  // Log the change
  if (docToUnlink) {
    await prisma.changeLogEntry.create({
      data: {
        participantId: participant.id,
        userType: 'PARTICIPANT',
        fieldName: 'travelItem.documentLink',
        previousValue: `Linked to: ${docToUnlink.renamedFilename}`,
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
    bankName: updated.bankName,
    personalAddress: updated.personalAddress,
    personalCity: updated.personalCity,
    personalPostalCode: updated.personalPostalCode,
    personalCountry: updated.personalCountry,
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
  const { filePath, fileName, fileSize } = await generateDeclarationPdf(participant.id, {
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
    reason: data.reason,
    isCarTravel: data.isCarTravel,
    licensePlate: data.licensePlate,
    driverName: data.driverName,
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
      reason: data.reason || null,
      isCarTravel: data.isCarTravel || false,
      licensePlate: data.licensePlate || null,
      driverName: data.driverName || null,
    },
  });

  // Also create a document record for the PDF so it appears in the participant's documents
  const declarationDoc = await prisma.document.create({
    data: {
      participantId: participant.id,
      storedFilePath: filePath,
      originalFilename: fileName,
      renamedFilename: fileName,
      mimeType: 'application/pdf',
      fileSize,
      documentType: DocumentType.OTHER, // Declaration of travel
    },
  });

  // Auto-link the declaration PDF to the travel item
  if (data.travelItemId) {
    const existingItem = await prisma.travelItem.findUnique({ where: { id: data.travelItemId } });
    if (existingItem) {
      if (!existingItem.documentId) {
        await prisma.travelItem.update({
          where: { id: data.travelItemId },
          data: { documentId: declarationDoc.id },
        });
      } else {
        const additionalIds: string[] = existingItem.additionalDocumentIds ? JSON.parse(existingItem.additionalDocumentIds) : [];
        additionalIds.push(declarationDoc.id);
        await prisma.travelItem.update({
          where: { id: data.travelItemId },
          data: { additionalDocumentIds: JSON.stringify(additionalIds) },
        });
      }
    }
  }

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

    // Delete the document record (travelItem.documentId is cleared via FK SetNull),
    // and strip the id from any travel item's additionalDocumentIds JSON list,
    // where the PDF may have been auto-linked on creation.
    const pdfDocs = await prisma.document.findMany({
      where: {
        participantId: participant.id,
        storedFilePath: declaration.generatedPdfPath,
      },
      select: { id: true },
    });
    const pdfDocIds = pdfDocs.map((d) => d.id);

    if (pdfDocIds.length > 0) {
      const itemsWithExtras = await prisma.travelItem.findMany({
        where: { participantId: participant.id, additionalDocumentIds: { not: null } },
        select: { id: true, additionalDocumentIds: true },
      });
      for (const item of itemsWithExtras) {
        try {
          const ids = JSON.parse(item.additionalDocumentIds!) as string[];
          const remaining = ids.filter((id) => !pdfDocIds.includes(id));
          if (remaining.length !== ids.length) {
            await prisma.travelItem.update({
              where: { id: item.id },
              data: { additionalDocumentIds: remaining.length > 0 ? JSON.stringify(remaining) : null },
            });
          }
        } catch {
          // Malformed JSON — leave as-is
        }
      }

      await prisma.document.deleteMany({ where: { id: { in: pdfDocIds } } });
    }
  }

  // Delete the declaration
  await prisma.declarationOfTravel.delete({
    where: { id: declaration.id },
  });

  res.json({ success: true });
}));

/**
 * PATCH /api/participant/declarations-of-travel/:id
 * Update a declaration of travel (e.g. reassign to a different travel item)
 */
const updateDeclarationSchema = z.object({
  travelItemId: z.string().uuid().nullable().optional(),
});

router.patch('/declarations-of-travel/:id', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;

  if (participant.status === 'ADMIN_APPROVED' || participant.status === 'PAID') {
    throw new ForbiddenError('Cannot modify declarations after approval');
  }

  const result = updateDeclarationSchema.safeParse(req.body);
  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }

  const declaration = await prisma.declarationOfTravel.findFirst({
    where: { id: req.params.id, participantId: participant.id },
  });

  if (!declaration) {
    throw new NotFoundError('Declaration not found');
  }

  // If travelItemId is provided, verify it belongs to this participant
  if (result.data.travelItemId) {
    const travelItem = await prisma.travelItem.findFirst({
      where: { id: result.data.travelItemId, participantId: participant.id },
    });
    if (!travelItem) {
      throw new NotFoundError('Travel item not found');
    }
  }

  const updated = await prisma.declarationOfTravel.update({
    where: { id: declaration.id },
    data: { travelItemId: result.data.travelItemId },
  });

  await prisma.changeLogEntry.create({
    data: {
      participantId: participant.id,
      userType: 'PARTICIPANT',
      fieldName: 'declaration.travelItemId',
      previousValue: declaration.travelItemId ?? '(none)',
      newValue: result.data.travelItemId ?? '(none)',
    },
  });

  res.json(updated);
}));

/**
 * PATCH /api/participant/no-reimbursement
 * Set no-reimbursement flag (participant opts out of reimbursement)
 */
router.patch('/no-reimbursement', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const participant = req.participant!;
  const { noReimbursement } = req.body;

  const updated = await prisma.participant.update({
    where: { id: participant.id },
    data: { noReimbursement: !!noReimbursement },
  });

  res.json({ noReimbursement: updated.noReimbursement });
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

  // If participant opted out of reimbursement, skip validation
  if (participant.noReimbursement) {
    await prisma.participant.update({
      where: { id: participant.id },
      data: { status: ParticipantStatus.PARTICIPANT_COMPLETE },
    });

    // Upsert a zero-amount reimbursement summary
    await prisma.reimbursementSummary.upsert({
      where: { participantId: participant.id },
      create: { participantId: participant.id, totalEur: 0, maxReimbursementAllowed: 0, amountToReimburse: 0, aiCheckOk: true },
      update: { totalEur: 0, amountToReimburse: 0, aiCheckOk: true },
    });

    // No review needed for no-reimbursement participants
    await prisma.participant.update({
      where: { id: participant.id },
      data: { aiReviewStatus: AiReviewStatus.COMPLETE },
    });

    res.json({ success: true });
    return;
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
    data: { status: ParticipantStatus.PARTICIPANT_COMPLETE, aiReviewStatus: AiReviewStatus.PENDING },
  });

  // Update summary
  await prisma.reimbursementSummary.update({
    where: { participantId: participant.id },
    data: { aiCheckOk: validation.aiCheckPassed },
  });

  // Send submission confirmation email (fire and forget)
  const participantWithProject = await prisma.participant.findUnique({
    where: { id: participant.id },
    include: { project: true },
  });
  if (participantWithProject) {
    const emailService = getEmailService();
    emailService.sendSubmissionConfirmation(
      participantWithProject.email,
      participantWithProject.firstName,
      participantWithProject.project.name
    ).catch((err) => console.error('[Email] Failed to send submission confirmation:', err));
  }

  // Generate AI review findings in the background (only once, on submission)
  (async () => {
    try {
      // Fetch full participant data for AI review
      const fullParticipant = await prisma.participant.findUnique({
        where: { id: participant.id },
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

      if (!fullParticipant || fullParticipant.travelItems.length === 0) return;

      fullParticipant.travelItems = sortTravelItemsByJourney(fullParticipant.travelItems);

      const countryLimit = await prisma.projectCountryLimit.findFirst({
        where: { projectId: fullParticipant.projectId, country: fullParticipant.country },
      });
      const effectiveLimit = getEffectiveLimit(fullParticipant, countryLimit);

      const { generateParticipantReview } = await import('../../services/ai/claudeAiService.js');
      const findings = await generateParticipantReview({
        participantName: `${fullParticipant.firstName} ${fullParticipant.lastName}`,
        participantCountry: fullParticipant.country,
        detectedHomeCountry: fullParticipant.detectedHomeCountry,
        homeCountryConfidence: fullParticipant.homeCountryConfidence,
        participantNote: fullParticipant.participantNote,
        consolidationSummary: fullParticipant.consolidationSummary,
        projectCountry: fullParticipant.project.country,
        projectStartDate: fullParticipant.project.startDate.toISOString().split('T')[0],
        projectEndDate: fullParticipant.project.endDate.toISOString().split('T')[0],
        maxReimbursementForCountry: effectiveLimit.maxReimbursement,
        travelItems: fullParticipant.travelItems.map((item) => ({
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
          exclusionReason: item.exclusionReason,
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
        documents: fullParticipant.documents.map((doc) => ({
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
        declarationsOnHonor: fullParticipant.declarationsOnHonor.map((d) => ({
          missingDocumentType: d.missingDocumentType,
          description: d.description,
          reason: d.reason,
        })),
        declarationsOfTravel: fullParticipant.declarationsOfTravel.map((d) => ({
          fromPlace: d.fromPlace,
          toPlace: d.toPlace,
          travelDate: d.travelDate?.toISOString().split('T')[0] || null,
          flightNumber: d.flightNumber,
          modeOfTransport: d.modeOfTransport,
        })),
        changeLogEntries: fullParticipant.changeLogEntries.map((e) => ({
          userType: e.userType,
          fieldName: e.fieldName,
          previousValue: e.previousValue,
          newValue: e.newValue,
        })),
        reimbursementSummary: fullParticipant.reimbursementSummary ? {
          totalEur: fullParticipant.reimbursementSummary.totalEur,
          maxReimbursementAllowed: fullParticipant.reimbursementSummary.maxReimbursementAllowed,
          amountToReimburse: fullParticipant.reimbursementSummary.amountToReimburse,
        } : null,
        bankDetailsComplete: !!(fullParticipant.bankAccountIban && fullParticipant.bankAccountHolderName && fullParticipant.bankAccountBic),
      });

      // Store findings in DB (including travelItemId link)
      if (findings.length > 0) {
        await prisma.aiReviewFinding.createMany({
          data: findings.map((f) => ({
            participantId: participant.id,
            severity: f.severity,
            message: f.message,
            category: f.category,
            travelItemId: (f as any).travelItemId || null,
          })),
        });
      }

      await prisma.participant.update({
        where: { id: participant.id },
        data: { aiReviewStatus: AiReviewStatus.COMPLETE },
      });
      console.log(`[AI Review] Generated ${findings.length} findings for participant ${participant.id}`);
    } catch (error) {
      console.error(`[AI Review] Failed to generate review for participant ${participant.id}:`, error);
      await prisma.participant.update({
        where: { id: participant.id },
        data: { aiReviewStatus: AiReviewStatus.FAILED },
      }).catch(() => {}); // Don't throw if this update fails
    }
  })();

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

  // Use the project's exchange-rate mode + per-currency overrides
  const { getEffectiveRateForParticipant } = await import('../../services/exchangeRate/index.js');
  const rate = await getEffectiveRateForParticipant(req.participant!.id, currencyCode, date);

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
  // Use the project's exchange-rate mode + per-currency overrides
  const { getEffectiveRateForParticipant } = await import('../../services/exchangeRate/index.js');
  const rate = await getEffectiveRateForParticipant(req.participant!.id, currency, date);
  const eurAmount = Math.round(amount * rate * 100) / 100;

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

/**
 * GET /api/participant/validate-city-country
 * Validate if a city is in a given country using geocoding API
 */
router.get('/validate-city-country', participantAuth, asyncHandler(async (req: Request, res: Response) => {
  const { city, country } = req.query;

  if (!city || typeof city !== 'string') {
    throw new ValidationError('City is required');
  }

  if (!country || typeof country !== 'string') {
    throw new ValidationError('Country is required');
  }

  const result = await validateCityCountry(city, country);

  res.json({
    city,
    expectedCountry: country,
    detectedCountry: result.detectedCountry,
    matches: result.matches,
  });
}));

export default router;

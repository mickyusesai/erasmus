/**
 * Read-only support API (/api/support), for looking into a participant's reimbursement
 * while answering support questions. Needs a support key from super-admin (24 hours).
 * Bank account numbers are masked; nothing can be changed here.
 */
import { Router, Request, Response } from 'express';
import prisma from '../../utils/prisma.js';
import { asyncHandler, NotFoundError } from '../../middleware/errorHandler.js';
import { supportKeyAuth } from '../../services/support/supportKeys.js';
import { getStorageService } from '../../services/storage/index.js';
import { getEffectiveLimit } from '../../utils/effectiveLimit.js';
import { sortTravelItemsByJourney } from '../../utils/sortTravelItems.js';
import { bankAccountProblem, maskAccountNumber } from '../../utils/bankAccount.js';
import { buildGreenTravelSuggestion } from '../../services/greenTravel/suggestion.js';
import { findSharedDocuments } from '../../services/checks/sharedDocuments.js';
import { findOtherProjectOverlaps } from '../../services/checks/otherProjects.js';

const router = Router();
router.use(asyncHandler(supportKeyAuth));

const BANK_FIELDS = ['bankAccountIban'];
/** Organisation edits are logged masked already; participant edits are not */
const maskOnce = (value: string | null) => (value?.startsWith('••••') || value === '(empty)' ? value : maskAccountNumber(value));

/** GET /api/support/participants?q=joanna — find participants by name or email */
router.get('/participants', asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  const words = q.split(/\s+/).filter(Boolean).slice(0, 3);
  const participants = await prisma.participant.findMany({
    where: words.length
      ? {
          AND: words.map((w) => ({
            OR: [
              { firstName: { contains: w, mode: 'insensitive' as const } },
              { lastName: { contains: w, mode: 'insensitive' as const } },
              { email: { contains: w, mode: 'insensitive' as const } },
            ],
          })),
        }
      : undefined,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      country: true,
      status: true,
      project: { select: { id: true, name: true, organisation: { select: { name: true } } } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 25,
  });
  res.json({ participants });
}));

/** GET /api/support/participants/:id — everything the organiser sees, read-only */
router.get('/participants/:id', asyncHandler(async (req: Request, res: Response) => {
  const p = await prisma.participant.findUnique({
    where: { id: req.params.id },
    include: {
      project: { include: { countryLimits: true, organisation: { select: { id: true, name: true, email: true } } } },
      travelItems: true,
      documents: { include: { extraction: true }, orderBy: [{ uploadDate: 'asc' }, { id: 'asc' }] },
      reimbursementSummary: true,
      aiReviewFindings: { orderBy: { createdAt: 'asc' } },
      declarationsOnHonor: true,
      declarationsOfTravel: true,
      greenTravelDeclaration: { select: { signedAt: true, travelDaysClaimed: true, summaryJson: true } },
      changeLogEntries: { orderBy: { changedAt: 'desc' }, take: 150 },
      messages: { orderBy: { receivedAt: 'desc' }, take: 10 },
    },
  });
  if (!p) throw new NotFoundError('Participant not found');

  const effectiveLimit = getEffectiveLimit(p, p.project.countryLimits);
  const { getAiService } = await import('../../services/ai/index.js');
  const validation = await getAiService().validateReimbursement(p.id);
  const greenTravel = await buildGreenTravelSuggestion(p, effectiveLimit.greenTravel);
  const sharedDocs = await findSharedDocuments(p.id);
  const otherProjects = await findOtherProjectOverlaps(p.id);

  res.json({
    otherProjects,
    participant: {
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      email: p.email,
      country: p.country,
      status: p.status,
      noReimbursement: p.noReimbursement,
      participantNote: p.participantNote,
      notesInternal: p.notesInternal,
      reopenMessage: p.reopenMessage,
      reopenedAt: p.reopenedAt,
      aiReviewStatus: p.aiReviewStatus,
      detectedHomeCountry: p.detectedHomeCountry,
      homeCountryReasoning: p.homeCountryReasoning,
      bankAccount: p.bankAccountIban ? maskAccountNumber(p.bankAccountIban) : null,
      bankAccountCheck: p.bankAccountIban ? bankAccountProblem(p.bankAccountIban) ?? 'looks valid' : 'missing',
      bankAccountHolderName: p.bankAccountHolderName,
      bankAccountBic: p.bankAccountBic,
      maxReimbursementOverride: p.maxReimbursementOverride,
      greenTravelOverride: p.greenTravelOverride,
      greenTravelExtra: { foodEur: p.greenTravelFoodEur, accommodationEur: p.greenTravelAccommodationEur, note: p.greenTravelExtraNote, setAt: p.greenTravelExtraUpdatedAt },
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    },
    project: {
      id: p.project.id,
      name: p.project.name,
      organisation: p.project.organisation,
      country: p.project.country,
      startDate: p.project.startDate,
      endDate: p.project.endDate,
      exchangeRateMode: p.project.exchangeRateMode,
      requireAirlineDeclaration: p.project.requireAirlineDeclaration,
      requireGreenTravelDeclaration: p.project.requireGreenTravelDeclaration,
      greenTravelRule: {
        mode: p.project.greenTravelExtraMode,
        foodPerDayEur: p.project.greenTravelFoodPerDayEur,
        accommodationPerNightEur: p.project.greenTravelAccommodationPerNightEur,
      },
      countryLimits: p.project.countryLimits.map((l) => ({ country: l.country, max: l.maxReimbursementAmount, greenTravel: l.greenTravel })),
    },
    effectiveLimit,
    summary: p.reimbursementSummary,
    validation,
    trips: sortTravelItemsByJourney(p.travelItems),
    documents: p.documents.map((d) => ({
      id: d.id,
      filename: d.renamedFilename,
      originalFilename: d.originalFilename,
      type: d.documentType,
      mimeType: d.mimeType,
      sizeKb: Math.round(d.fileSize / 1024),
      uploadDate: d.uploadDate,
      contentHash: d.contentHash,
      sharedWith: sharedDocs.get(d.id) ?? [],
      extraction: d.extraction ? { ...d.extraction, rawAiResponse: d.extraction.rawAiResponse?.slice(0, 3000) ?? null } : null,
    })),
    findings: p.aiReviewFindings,
    declarationsOnHonor: p.declarationsOnHonor,
    declarationsOfTravel: p.declarationsOfTravel,
    greenTravelDeclaration: p.greenTravelDeclaration,
    greenTravel,
    changeLog: p.changeLogEntries.map((c) =>
      BANK_FIELDS.includes(c.fieldName)
        ? { ...c, previousValue: maskOnce(c.previousValue), newValue: maskOnce(c.newValue) }
        : c
    ),
    messages: p.messages,
  });
}));

/** GET /api/support/participants/:id/documents/:docId/url — a link to look at the file */
router.get('/participants/:id/documents/:docId/url', asyncHandler(async (req: Request, res: Response) => {
  const doc = await prisma.document.findFirst({ where: { id: req.params.docId, participantId: req.params.id } });
  if (!doc) throw new NotFoundError('Document not found');
  res.json({ url: await getStorageService().getUrl(doc.storedFilePath), mimeType: doc.mimeType, filename: doc.renamedFilename });
}));

/** GET /api/support/projects/:id — the project and its participants at a glance */
router.get('/projects/:id', asyncHandler(async (req: Request, res: Response) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: {
      organisation: { select: { name: true, email: true } },
      countryLimits: true,
      participants: {
        select: { id: true, firstName: true, lastName: true, country: true, status: true, reimbursementSummary: true },
        orderBy: { lastName: 'asc' },
      },
    },
  });
  if (!project) throw new NotFoundError('Project not found');
  res.json({ project });
}));

export default router;

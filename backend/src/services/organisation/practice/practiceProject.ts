/**
 * The practice project of an organisation: a made-up exchange ("Common Ground") with made-up
 * participants and sample tickets, to try every step with. It is created for a new
 * organisation, costs no credit, is not counted anywhere, and can be started again from
 * scratch as often as wanted.
 *
 * What is in it comes from content.ts; this file puts it in the database and in storage.
 */
import { v4 as uuidv4 } from 'uuid';
import type { DocumentType, Prisma, Project } from '@prisma/client';
import prisma from '../../../utils/prisma.js';
import { getStorageService } from '../../storage/index.js';
import { fileHash } from '../../checks/sameFile.js';
import { sampleTicketFilename, sampleTicketPdf, type SampleTicket } from '../../pdf/sampleTicketPdf.js';
import { storedFilesOf } from '../storedFiles.js';
import {
  PRACTICE_COUNTRY_LIMITS,
  PRACTICE_PEOPLE,
  PRACTICE_PROJECT,
  claimedEur,
  practiceDates,
  practiceEmail,
  practicePerson,
  practiceRoleOf,
  sampleTicketsFor,
  tripDate,
  tripPurchaseDate,
  type PracticePerson,
} from './content.js';

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

const DOCUMENT_TYPE: Record<SampleTicket['kind'], DocumentType> = {
  FLIGHT_TICKET: 'FLIGHT_INVOICE',
  BOARDING_PASS: 'FLIGHT_BOARDING_PASS',
  TRAIN_TICKET: 'TRAIN_TICKET',
  BUS_TICKET: 'BUS_TICKET',
};
const TYPE_LABEL: Record<SampleTicket['kind'], string> = {
  FLIGHT_TICKET: 'flight invoice',
  BOARDING_PASS: 'boarding pass',
  TRAIN_TICKET: 'train ticket',
  BUS_TICKET: 'bus ticket',
};

/** The name the app gives a file once it has been read: "2026 11 02 Berlin Porto flight invoice.pdf" */
function renamedFilename(ticket: SampleTicket): string {
  return `${ticket.date.toISOString().slice(0, 10).replace(/-/g, ' ')} ${ticket.from} ${ticket.to} ${TYPE_LABEL[ticket.kind]}.pdf`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface SampleFile {
  storagePath: string;
  filename: string;
  buffer: Buffer;
}

export function findPracticeProject(organisationId: string): Promise<Project | null> {
  return prisma.project.findFirst({ where: { organisationId, isPracticeProject: true }, orderBy: { createdAt: 'asc' } });
}

// ---------------------------------------------------------------------------------------------
// Creating
// ---------------------------------------------------------------------------------------------

interface PracticeRows {
  project: Prisma.ProjectCreateManyInput & { id: string };
  limits: Prisma.ProjectCountryLimitCreateManyInput[];
  participants: Prisma.ParticipantCreateManyInput[];
  summaries: Prisma.ReimbursementSummaryCreateManyInput[];
  documents: Prisma.DocumentCreateManyInput[];
  extractions: Prisma.DocumentExtractionCreateManyInput[];
  travelItems: Prisma.TravelItemCreateManyInput[];
  findings: Prisma.AiReviewFindingCreateManyInput[];
  changeLog: Prisma.ChangeLogEntryCreateManyInput[];
  files: SampleFile[];
}

/** Everything of the practice project as rows, with the sample tickets as files */
async function buildPracticeRows(organisationId: string, now: Date): Promise<PracticeRows> {
  const dates = practiceDates(now);
  const projectId = uuidv4();
  const rows: PracticeRows = {
    project: {
      id: projectId,
      organisationId,
      ...PRACTICE_PROJECT,
      startDate: dates.startDate,
      endDate: dates.endDate,
      isPracticeProject: true,
      maxParticipants: PRACTICE_PEOPLE.length,
      creditSource: null,
      aiAnalysisUnlocked: true,
      // Never picked up by the "your project has ended" email round
      endEmailSentAt: now,
    },
    limits: PRACTICE_COUNTRY_LIMITS.map((l) => ({ projectId, country: l.country, maxReimbursementAmount: l.max, greenTravel: l.greenTravel })),
    participants: [],
    summaries: [],
    documents: [],
    extractions: [],
    travelItems: [],
    findings: [],
    changeLog: [],
    files: [],
  };

  for (const [index, person] of PRACTICE_PEOPLE.entries()) {
    const participantId = uuidv4();
    const limit = PRACTICE_COUNTRY_LIMITS.find((l) => l.country === person.country)!;
    const submitted = person.submittedDaysAfterEnd !== null;
    // They uploaded in the evening, a few days after coming home
    const uploadedAt = submitted ? new Date(dates.endDate.getTime() + person.submittedDaysAfterEnd! * DAY + 18 * 60 * MINUTE) : null;
    const submittedAt = uploadedAt ? new Date(uploadedAt.getTime() + 20 * MINUTE) : null;

    rows.participants.push({
      id: participantId,
      projectId,
      firstName: person.firstName,
      lastName: person.lastName,
      email: practiceEmail(person),
      country: person.country,
      magicLinkToken: uuidv4(),
      magicLinkActive: true,
      tokenExpiresAt: new Date(now.getTime() + 180 * DAY),
      createdAt: new Date(dates.startDate.getTime() - 21 * DAY + index * MINUTE),
      lastMagicLinkSentAt:
        person.invitedDaysAfterEnd === null ? null : new Date(dates.endDate.getTime() + person.invitedDaysAfterEnd * DAY + 9 * 60 * MINUTE),
      ...(submitted && {
        status: 'PARTICIPANT_COMPLETE',
        bankAccountIban: person.bank!.iban,
        bankAccountHolderName: `${person.firstName} ${person.lastName}`,
        bankAccountBic: person.bank!.bic,
        bankName: 'Example Bank',
        personalAddress: person.bank!.street,
        personalPostalCode: person.bank!.postalCode,
        personalCity: person.bank!.city,
        personalCountry: person.country,
        participantNote: person.note ?? null,
        journeyConsolidatedAt: new Date(uploadedAt!.getTime() + 6 * MINUTE),
        detectedHomeCountry: person.country,
        homeCountryConfidence: 0.95,
        homeCountryReasoning: `The journey starts and ends in ${person.trips[0].from}.`,
        aiReviewStatus: 'COMPLETE',
        aiReviewedAt: new Date(submittedAt!.getTime() + MINUTE),
      }),
    });

    const total = submitted ? round2(person.trips.reduce((sum, trip) => sum + claimedEur(trip), 0)) : 0;
    rows.summaries.push({
      participantId,
      totalEur: total,
      maxReimbursementAllowed: limit.max,
      amountToReimburse: Math.min(total, limit.max),
      aiCheckOk: submitted,
    });
    if (!submitted) continue;

    const travelItemIds: string[] = [];
    const ticketIds: string[] = [];
    for (const trip of person.trips) {
      const travelItemId = uuidv4();
      let ticketId = '';
      const extraIds: string[] = [];

      for (const { file, ticket } of sampleTicketsFor(person, trip, dates)) {
        const documentId = uuidv4();
        const buffer = await sampleTicketPdf(ticket);
        const storagePath = `participants/${participantId}/documents/${uuidv4()}.pdf`;
        rows.files.push({ storagePath, filename: sampleTicketFilename(ticket), buffer });
        rows.documents.push({
          id: documentId,
          participantId,
          storedFilePath: storagePath,
          originalFilename: sampleTicketFilename(ticket),
          renamedFilename: renamedFilename(ticket),
          mimeType: 'application/pdf',
          fileSize: buffer.length,
          uploadDate: uploadedAt!,
          documentType: DOCUMENT_TYPE[ticket.kind],
          contentHash: fileHash(buffer),
        });
        rows.extractions.push({
          documentId,
          detectedDocumentType: DOCUMENT_TYPE[ticket.kind],
          confidence: 0.97,
          passengerName: ticket.passenger,
          fromLocation: ticket.from,
          toLocation: ticket.to,
          departureDate: ticket.date,
          purchaseDate: ticket.purchaseDate ?? null,
          documentDate: ticket.purchaseDate ?? ticket.date,
          flightNumber: trip.mode === 'PLANE' ? trip.serviceNumber : null,
          airline: trip.mode === 'PLANE' ? trip.carrier : null,
          bookingReference: ticket.bookingReference,
          seatNumber: file === 'BOARDING_PASS' ? ticket.seat ?? null : null,
          trainNumber: trip.mode === 'TRAIN' ? trip.serviceNumber : null,
          busCompany: trip.mode === 'BUS' ? trip.carrier : null,
          amount: ticket.amountEur ?? null,
          currency: ticket.amountEur === undefined ? null : 'EUR',
          numberOfPassengers: 1,
          extractionReasoning: 'Sample ticket of the practice project.',
          consolidated: true,
          consolidatedAt: new Date(uploadedAt!.getTime() + 6 * MINUTE),
        });
        if (file === 'TICKET') ticketId = documentId;
        else extraIds.push(documentId);
      }

      const claimed = claimedEur(trip);
      rows.travelItems.push({
        id: travelItemId,
        participantId,
        documentId: ticketId,
        additionalDocumentIds: extraIds.length ? JSON.stringify(extraIds) : null,
        modeOfTransport: trip.mode,
        fromLocation: trip.from,
        toLocation: trip.to,
        departureDate: tripDate(trip, dates),
        departureTime: trip.departureTime,
        bookingReference: trip.bookingReference,
        flightNumber: trip.mode === 'PLANE' ? trip.serviceNumber : null,
        amountOriginal: claimed,
        currencyOriginal: 'EUR',
        purchaseDate: tripPurchaseDate(trip, dates),
        amountEur: claimed,
        manuallyEdited: claimed !== trip.ticketEur,
        checked: true,
        originalAmountFromAi: trip.ticketEur,
        originalCurrencyFromAi: 'EUR',
        companyName: trip.carrier,
        priceSourceDocId: ticketId,
        routeMatchesCountry: true,
      });
      travelItemIds.push(travelItemId);
      ticketIds.push(ticketId);

      if (claimed !== trip.ticketEur) {
        const changedAt = new Date(uploadedAt!.getTime() + 12 * MINUTE);
        rows.changeLog.push(
          { participantId, userType: 'PARTICIPANT', fieldName: 'travelItem.amountOriginal', previousValue: String(trip.ticketEur), newValue: String(claimed), changedAt },
          {
            participantId,
            userType: 'PARTICIPANT',
            fieldName: 'travelItem.manualPriceChange',
            previousValue: `AI detected: ${trip.ticketEur} EUR`,
            newValue: `Changed to: ${claimed} EUR`,
            changedAt,
          }
        );
      }
    }

    if (person.note) {
      rows.changeLog.push({
        participantId,
        userType: 'PARTICIPANT',
        fieldName: 'participantNote',
        previousValue: '',
        newValue: person.note,
        changedAt: new Date(uploadedAt!.getTime() + 14 * MINUTE),
      });
    }

    for (const finding of person.findings) {
      rows.findings.push({
        participantId,
        severity: finding.severity,
        category: finding.category,
        message: finding.message,
        travelItemId: finding.trip === undefined ? null : travelItemIds[finding.trip],
        documentIds: finding.trip === undefined ? null : JSON.stringify([ticketIds[finding.trip]]),
        createdAt: new Date(submittedAt!.getTime() + MINUTE),
      });
    }
  }

  return rows;
}

async function storeFiles(files: SampleFile[]): Promise<void> {
  const storage = getStorageService();
  for (const file of files) {
    await storage.store({ buffer: file.buffer, originalname: file.filename, mimetype: 'application/pdf', size: file.buffer.length }, file.storagePath);
  }
}

async function removeFiles(paths: string[]): Promise<void> {
  const storage = getStorageService();
  for (const path of paths) {
    await storage.delete(path).catch((err) => console.error(`[Practice project] Could not delete file ${path}:`, err));
  }
}

async function createIfMissing(organisationId: string): Promise<Project> {
  const existing = await findPracticeProject(organisationId);
  if (existing) return existing;

  const rows = await buildPracticeRows(organisationId, new Date());
  await storeFiles(rows.files);

  let created = false;
  try {
    const project = await prisma.$transaction(
      async (tx) => {
        // One practice project per organisation, also when two requests arrive at the same moment
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'practice-project:' + organisationId}))`;
        const other = await tx.project.findFirst({ where: { organisationId, isPracticeProject: true } });
        if (other) return other;

        const project = await tx.project.create({ data: rows.project });
        await tx.projectCountryLimit.createMany({ data: rows.limits });
        await tx.participant.createMany({ data: rows.participants });
        await tx.reimbursementSummary.createMany({ data: rows.summaries });
        await tx.document.createMany({ data: rows.documents });
        await tx.documentExtraction.createMany({ data: rows.extractions });
        await tx.travelItem.createMany({ data: rows.travelItems });
        if (rows.findings.length) await tx.aiReviewFinding.createMany({ data: rows.findings });
        if (rows.changeLog.length) await tx.changeLogEntry.createMany({ data: rows.changeLog });
        created = true;
        return project;
      },
      { maxWait: 10_000, timeout: 30_000 }
    );
    return project;
  } finally {
    // Not created after all (another request was first, or it failed): the files are of no use
    if (!created) await removeFiles(rows.files.map((f) => f.storagePath));
  }
}

const beingCreated = new Map<string, Promise<Project>>();

/** The organisation's practice project; it is created when there is none yet */
export function ensurePracticeProject(organisationId: string): Promise<Project> {
  const running = beingCreated.get(organisationId);
  if (running) return running;
  const promise = createIfMissing(organisationId).finally(() => beingCreated.delete(organisationId));
  beingCreated.set(organisationId, promise);
  return promise;
}

/** For a new organisation: made in the background, so signing up never waits for it or fails on it */
export function preparePracticeProject(organisationId: string): void {
  ensurePracticeProject(organisationId).catch((err) => console.error(`[Practice project] Could not create it for organisation ${organisationId}:`, err));
}

// ---------------------------------------------------------------------------------------------
// Removing and starting again
// ---------------------------------------------------------------------------------------------

/** Removes the practice project with everything in it. Refuses any other project. */
export async function deletePracticeProject(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, isPracticeProject: true } });
  if (!project) return;
  if (!project.isPracticeProject) throw new Error(`Refusing to delete project ${projectId}: it is not a practice project`);

  await removeFiles(await storedFilesOf({ projectId }));
  await prisma.$transaction([
    // Activities point at the participant who created them without a cascade, so they go first
    prisma.disseminationActivity.deleteMany({ where: { projectId } }),
    prisma.project.deleteMany({ where: { id: projectId, isPracticeProject: true } }),
  ]);
}

/** Throws the practice project away and makes a fresh one: everything is back as it was at the start */
export async function restartPracticeProject(organisationId: string): Promise<Project> {
  await beingCreated.get(organisationId)?.catch(() => undefined);
  const old = await prisma.project.findMany({ where: { organisationId, isPracticeProject: true }, select: { id: true } });
  for (const { id } of old) await deletePracticeProject(id);
  return ensurePracticeProject(organisationId);
}

// ---------------------------------------------------------------------------------------------
// The participant the organiser plays
// ---------------------------------------------------------------------------------------------

/**
 * The sample tickets for the participant the organiser plays, made out to the name and the
 * dates as they are now. They are uploaded like any participant's files and read by the AI.
 */
export async function sampleUploadsFor(participant: {
  firstName: string;
  lastName: string;
  project: { startDate: Date; endDate: Date };
}): Promise<{ filename: string; buffer: Buffer }[]> {
  const you = practicePerson('YOU');
  const uploads: { filename: string; buffer: Buffer }[] = [];
  for (const trip of you.trips) {
    for (const { ticket } of sampleTicketsFor(participant, trip, participant.project)) {
      uploads.push({ filename: sampleTicketFilename(ticket), buffer: await sampleTicketPdf(ticket) });
    }
  }
  return uploads;
}

/** The made-up bank details the organiser can fill in with one click when playing the participant */
export function sampleBankDetailsFor(participant: { firstName: string; lastName: string; country: string }) {
  const bank = practicePerson('YOU').bank!;
  return {
    bankAccountIban: bank.iban,
    bankAccountHolderName: `${participant.firstName} ${participant.lastName}`,
    bankAccountBic: bank.bic,
    bankName: 'Example Bank',
    personalAddress: bank.street,
    personalPostalCode: bank.postalCode,
    personalCity: bank.city,
    personalCountry: participant.country,
  };
}

export { practiceRoleOf };
export type { PracticePerson };

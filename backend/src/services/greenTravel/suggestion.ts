/**
 * What the green travel extra card shows: days travelled, the participant's receipts
 * (converted to EUR for green travellers) and, when the project has a rule, the calculation.
 */
import { summarizeTravelDays } from '../../utils/travelDays.js';
import { extraTravelDates, calculateGreenTravelExtra, type ExtraReceipt, type GreenTravelCalculation } from '../../utils/greenTravelExtra.js';
import { convertToEurForParticipant } from '../exchangeRate/index.js';
import { receiptKey } from '../checks/sharedDocuments.js';

interface SuggestionInput {
  id: string;
  travelItems: { departureDate: Date; arrivalDate: Date | null; excludedFromReimbursement: boolean }[];
  documents: {
    id: string;
    renamedFilename: string;
    documentType: string;
    mimeType: string;
    uploadDate: Date;
    fileSize?: number;
    contentHash?: string | null;
    extraction: {
      amount: number | null;
      currency: string | null;
      documentDate: Date | null;
      merchantName?: string | null;
      correctedByOrganisation?: boolean;
    } | null;
  }[];
  project: {
    startDate: Date;
    endDate: Date;
    greenTravelExtraMode: string;
    greenTravelFoodPerDayEur: number | null;
    greenTravelAccommodationPerNightEur: number | null;
  };
}

/**
 * The same receipt uploaded twice: the identical file, the same file size and amount (files
 * uploaded before file hashes were kept), or the same shop, date and amount.
 */
function sameReceiptKeys(d: SuggestionInput['documents'][number]): string[] {
  const keys: string[] = [];
  if (d.contentHash) keys.push(`file:${d.contentHash}`);
  if (d.fileSize && d.extraction?.amount != null) keys.push(`size:${d.fileSize}:${Math.round(d.extraction.amount * 100)}`);
  const receipt = d.extraction
    ? receiptKey({
        id: d.id,
        documentType: d.documentType,
        contentHash: d.contentHash ?? null,
        renamedFilename: d.renamedFilename,
        extraction: { ...d.extraction, merchantName: d.extraction.merchantName ?? null },
      })
    : null;
  if (receipt) keys.push(`receipt:${receipt}`);
  return keys;
}

export async function buildGreenTravelSuggestion(participant: SuggestionInput, isGreen: boolean) {
  const travelDays = summarizeTravelDays(participant.travelItems, participant.project.startDate, participant.project.endDate);
  // Oldest first: when the same receipt was uploaded twice, the first upload counts
  const receiptDocs = participant.documents
    .filter((d) => d.documentType === 'HOTEL_INVOICE' || d.documentType === 'MEAL_RECEIPT')
    .sort((a, b) => a.uploadDate.getTime() - b.uploadDate.getTime());
  const receipts: ExtraReceipt[] = isGreen
    ? await Promise.all(
        receiptDocs.map(async (d): Promise<ExtraReceipt> => {
          const date = d.extraction?.documentDate ?? null;
          const receipt: ExtraReceipt = {
            id: d.id,
            kind: d.documentType === 'HOTEL_INVOICE' ? 'ACCOMMODATION' : 'FOOD',
            filename: d.renamedFilename,
            date: date ? date.toISOString().slice(0, 10) : null,
            amountEur: null,
            sameAs: sameReceiptKeys(d),
          };
          const amount = d.extraction?.amount;
          if (amount == null) return receipt;
          try {
            // Same rate rules as the tickets (project mode + per-currency overrides); no currency read = EUR
            receipt.amountEur = await convertToEurForParticipant(participant.id, amount, d.extraction?.currency || 'EUR', date);
          } catch {
            receipt.noRate = true;
          }
          return receipt;
        })
      )
    : [];

  // Later uploads of a receipt that is already there (shown, but not added up)
  const firstUpload = new Map<string, string>();
  const duplicateOf = new Map<string, string>();
  for (const d of receiptDocs) {
    const keys = sameReceiptKeys(d);
    const original = keys.map((k) => firstUpload.get(k)).find((name) => name !== undefined);
    if (original !== undefined) duplicateOf.set(d.id, original);
    else for (const k of keys) firstUpload.set(k, d.renamedFilename);
  }

  const { greenTravelExtraMode: mode, greenTravelFoodPerDayEur, greenTravelAccommodationPerNightEur } = participant.project;
  let calculation: GreenTravelCalculation | null = null;
  if (isGreen && (mode === 'RECEIPTS' || mode === 'FIXED')) {
    calculation = calculateGreenTravelExtra({
      mode,
      foodPerDayEur: greenTravelFoodPerDayEur,
      accommodationPerNightEur: greenTravelAccommodationPerNightEur,
      extra: extraTravelDates(participant.travelItems, participant.project.startDate, participant.project.endDate),
      projectStart: participant.project.startDate,
      projectEnd: participant.project.endDate,
      travelWindow: travelDays.firstTravelDate && travelDays.lastTravelDate
        ? { first: travelDays.firstTravelDate.toISOString().slice(0, 10), last: travelDays.lastTravelDate.toISOString().slice(0, 10) }
        : null,
      receipts,
    });
  }

  return {
    ...travelDays,
    receipts: receiptDocs.map((d) => ({
      id: d.id,
      renamedFilename: d.renamedFilename,
      documentType: d.documentType,
      mimeType: d.mimeType,
      uploadDate: d.uploadDate,
      amount: d.extraction?.amount ?? null,
      currency: d.extraction?.currency ?? null,
      documentDate: d.extraction?.documentDate ?? null,
      amountEur: receipts.find((r) => r.id === d.id)?.amountEur ?? null,
      corrected: d.extraction?.correctedByOrganisation ?? false,
      duplicateOf: duplicateOf.get(d.id) ?? null,
    })),
    mode,
    calculation,
  };
}

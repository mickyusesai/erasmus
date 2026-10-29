/**
 * What the green travel extra card shows: days travelled, the participant's receipts
 * (converted to EUR for green travellers) and, when the project has a rule, the calculation.
 */
import { summarizeTravelDays } from '../../utils/travelDays.js';
import { extraTravelDates, calculateGreenTravelExtra, type ExtraReceipt, type GreenTravelCalculation } from '../../utils/greenTravelExtra.js';
import { convertToEurForParticipant } from '../exchangeRate/index.js';

interface SuggestionInput {
  id: string;
  travelItems: { departureDate: Date; arrivalDate: Date | null; excludedFromReimbursement: boolean }[];
  documents: {
    id: string;
    renamedFilename: string;
    documentType: string;
    mimeType: string;
    uploadDate: Date;
    extraction: { amount: number | null; currency: string | null; documentDate: Date | null; correctedByOrganisation?: boolean } | null;
  }[];
  project: {
    startDate: Date;
    endDate: Date;
    greenTravelExtraMode: string;
    greenTravelFoodPerDayEur: number | null;
    greenTravelAccommodationPerNightEur: number | null;
  };
}

export async function buildGreenTravelSuggestion(participant: SuggestionInput, isGreen: boolean) {
  const travelDays = summarizeTravelDays(participant.travelItems, participant.project.startDate, participant.project.endDate);
  const receiptDocs = participant.documents.filter((d) => d.documentType === 'HOTEL_INVOICE' || d.documentType === 'MEAL_RECEIPT');
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
    })),
    mode,
    calculation,
  };
}

import prisma from '../../utils/prisma.js';
import { getEffectiveRate, ProjectRateConfig } from './infoEuroService.js';

/**
 * Resolve the effective EUR rate for a currency in a participant's project,
 * honouring the project's exchange-rate mode and per-currency overrides.
 * Falls back to a plain purchase-date lookup if no project context is found.
 */
export async function getEffectiveRateForParticipant(
  participantId: string,
  currencyCode: string,
  purchaseDate?: Date | null
): Promise<number> {
  if ((currencyCode || 'EUR').toUpperCase() === 'EUR') return 1.0;

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    select: {
      project: {
        select: {
          endDate: true,
          exchangeRateMode: true,
          exchangeRateManualDate: true,
          currencyRates: { select: { currencyCode: true, rate: true } },
        },
      },
    },
  });

  const project = participant?.project;
  if (!project) {
    const { getExchangeRate } = await import('./infoEuroService.js');
    return getExchangeRate(currencyCode, purchaseDate || new Date());
  }

  const rateConfig: ProjectRateConfig = {
    exchangeRateMode: project.exchangeRateMode,
    exchangeRateManualDate: project.exchangeRateManualDate,
    endDate: project.endDate,
  };
  const currencyRates = new Map<string, number>();
  for (const cr of project.currencyRates) currencyRates.set(cr.currencyCode.toUpperCase(), cr.rate);

  return getEffectiveRate(rateConfig, currencyRates, currencyCode, purchaseDate);
}

/**
 * Load a participant's project exchange-rate context (mode/date + per-currency
 * overrides) and convert an amount to EUR using it. Use this in travel-item
 * create/edit paths so new amounts respect the project's chosen rate mode.
 * Falls back to a purchase-date lookup if the participant/project is missing.
 */
export async function convertToEurForParticipant(
  participantId: string,
  amount: number,
  currencyCode: string,
  purchaseDate?: Date | null
): Promise<number> {
  if ((currencyCode || 'EUR').toUpperCase() === 'EUR') return amount;
  const rate = await getEffectiveRateForParticipant(participantId, currencyCode, purchaseDate);
  return Math.round(amount * rate * 100) / 100;
}

export interface ProjectRecalcResult {
  participantsUpdated: number;
  itemsUpdated: number;
  itemsSkippedPaid: number;
  itemsSkippedOverride: number;
}

/**
 * Recompute the EUR amounts for every travel item in a project according to the
 * project's current exchange-rate mode and per-currency overrides, then refresh
 * each affected participant's reimbursement summary.
 *
 * Rules:
 *  - Participants already marked PAID are left untouched (money already sent).
 *  - Travel items with a per-item `exchangeRateOverride` are left untouched
 *    (that override is the most specific and wins).
 *  - EUR items are normalised to amountEur === amountOriginal.
 *
 * Returns counts useful for a confirmation message.
 */
export async function recalculateProjectExchangeRates(projectId: string): Promise<ProjectRecalcResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      currencyRates: true,
      participants: {
        include: { travelItems: true },
      },
    },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  const rateConfig: ProjectRateConfig = {
    exchangeRateMode: project.exchangeRateMode,
    exchangeRateManualDate: project.exchangeRateManualDate,
    endDate: project.endDate,
  };

  // Build per-currency override map (currencyCode → rate)
  const currencyRates = new Map<string, number>();
  for (const cr of project.currencyRates) {
    currencyRates.set(cr.currencyCode.toUpperCase(), cr.rate);
  }

  const result: ProjectRecalcResult = {
    participantsUpdated: 0,
    itemsUpdated: 0,
    itemsSkippedPaid: 0,
    itemsSkippedOverride: 0,
  };

  // Lazy import to avoid a circular dependency (ai service imports exchangeRate)
  const { getAiService } = await import('../ai/index.js');
  const aiService = getAiService();

  for (const participant of project.participants) {
    // Never retroactively change a participant who has already been paid out.
    if (participant.status === 'PAID') {
      result.itemsSkippedPaid += participant.travelItems.length;
      continue;
    }

    let participantTouched = false;

    for (const item of participant.travelItems) {
      // Per-item manual override wins — leave it as-is.
      if (item.exchangeRateOverride != null) {
        result.itemsSkippedOverride++;
        continue;
      }

      // Nothing to convert without an original amount.
      if (item.amountOriginal == null) continue;

      const currency = (item.currencyOriginal || 'EUR').toUpperCase();
      const rate = await getEffectiveRate(rateConfig, currencyRates, currency, item.purchaseDate);

      const newAmountEur = Math.round(item.amountOriginal * rate * 100) / 100;
      const newLuggageEur =
        item.luggageAmount != null ? Math.round(item.luggageAmount * rate * 100) / 100 : item.luggageAmountEur;

      // Only write when something actually changed.
      if (newAmountEur !== item.amountEur || newLuggageEur !== item.luggageAmountEur) {
        await prisma.travelItem.update({
          where: { id: item.id },
          data: { amountEur: newAmountEur, luggageAmountEur: newLuggageEur },
        });
        result.itemsUpdated++;
        participantTouched = true;
      }
    }

    // Refresh the summary for every non-paid participant (totals may shift even
    // if a specific item didn't, e.g. a previously-failed conversion now resolves).
    await aiService.recalculateParticipantSummary(participant.id);
    if (participantTouched) result.participantsUpdated++;
  }

  return result;
}

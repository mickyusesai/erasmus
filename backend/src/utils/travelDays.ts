/**
 * Travel-day helpers used for the organiser's green-travel suggestion and the
 * green-travel declaration. Purely informational — the organiser decides.
 */

export interface TravelDaySummary {
  /** Calendar days spanned by all travel dates (0 when there are none) */
  totalTravelDays: number;
  /** Days before the project start plus days after the project end */
  extraTravelDays: number;
  firstTravelDate: Date | null;
  lastTravelDate: Date | null;
}

function dayUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function summarizeTravelDays(
  travelItems: { departureDate: Date | null; arrivalDate: Date | null; excludedFromReimbursement: boolean }[],
  projectStart: Date,
  projectEnd: Date
): TravelDaySummary {
  const dates = travelItems
    .filter((t) => !t.excludedFromReimbursement)
    .flatMap((t) => [t.departureDate, t.arrivalDate])
    .filter((d): d is Date => !!d);
  if (dates.length === 0) {
    return { totalTravelDays: 0, extraTravelDays: 0, firstTravelDate: null, lastTravelDate: null };
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const days = dates.map(dayUtc);
  const first = Math.min(...days);
  const last = Math.max(...days);
  const start = dayUtc(projectStart);
  const end = dayUtc(projectEnd);
  const before = Math.max(0, Math.round((start - first) / dayMs));
  const after = Math.max(0, Math.round((last - end) / dayMs));
  return {
    totalTravelDays: Math.round((last - first) / dayMs) + 1,
    extraTravelDays: before + after,
    firstTravelDate: new Date(first),
    lastTravelDate: new Date(last),
  };
}

/** Days beyond the project dates, derived from the tickets */
export function suggestTravelDays(
  travelItems: { departureDate: Date | null; arrivalDate: Date | null; excludedFromReimbursement: boolean }[],
  projectStart: Date,
  projectEnd: Date
): number {
  return summarizeTravelDays(travelItems, projectStart, projectEnd).extraTravelDays;
}

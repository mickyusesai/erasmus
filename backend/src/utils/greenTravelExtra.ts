/**
 * The project's rule for the green travel extra: food and accommodation for the
 * journey of a green traveller.
 *
 * MANUAL   – the organiser types the amounts per participant (no calculation)
 * RECEIPTS – the participant's receipts: food capped per travel day (the extra days
 *            outside the project, and project days with a trip, e.g. snacks for the
 *            way home on the last day), accommodation capped at (extra nights × nightly limit)
 * FIXED    – a fixed amount per extra day (food) and per extra night (accommodation)
 *
 * This only suggests the amounts. The organiser still checks and saves them.
 */

export const GREEN_TRAVEL_EXTRA_MODES = ['MANUAL', 'RECEIPTS', 'FIXED'] as const;
export type GreenTravelExtraMode = (typeof GREEN_TRAVEL_EXTRA_MODES)[number];

export function isGreenTravelExtraMode(value: unknown): value is GreenTravelExtraMode {
  return typeof value === 'string' && (GREEN_TRAVEL_EXTRA_MODES as readonly string[]).includes(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ExtraTravelDates {
  /** Travel days before the project start and after the project end (YYYY-MM-DD) */
  days: string[];
  /**
   * Nights away from home outside the project (the date of the evening): every
   * extra day before the start, and every extra day after the end except the
   * last one (that evening the participant is home).
   */
  nights: string[];
  /** Project days with a trip (e.g. the first and last day), when food for the journey counts too */
  projectTravelDays: string[];
}

/** Same day span as summarizeTravelDays (utils/travelDays.ts), as lists of dates */
export function extraTravelDates(
  travelItems: { departureDate: Date | null; arrivalDate: Date | null; excludedFromReimbursement: boolean }[],
  projectStart: Date,
  projectEnd: Date
): ExtraTravelDates {
  const dates = travelItems
    .filter((t) => !t.excludedFromReimbursement)
    .flatMap((t) => [t.departureDate, t.arrivalDate])
    .filter((d): d is Date => !!d)
    .map(dayUtc);
  if (dates.length === 0) return { days: [], nights: [], projectTravelDays: [] };

  const first = Math.min(...dates);
  const last = Math.max(...dates);
  const start = dayUtc(projectStart);
  const end = Math.max(dayUtc(projectEnd), start);
  const projectTravelDays = [...new Set(dates.filter((d) => d >= start && d <= end))].sort((a, b) => a - b).map(isoDay);

  const days: string[] = [];
  const nights: string[] = [];
  for (let d = first; d < start && d <= last; d += DAY_MS) {
    days.push(isoDay(d));
    nights.push(isoDay(d));
  }
  for (let d = Math.max(end + DAY_MS, first); d <= last; d += DAY_MS) {
    days.push(isoDay(d));
    if (d < last) nights.push(isoDay(d));
  }
  return { days, nights, projectTravelDays };
}

export interface ExtraReceipt {
  id: string;
  kind: 'FOOD' | 'ACCOMMODATION';
  filename: string;
  /** Date on the receipt (YYYY-MM-DD), null when the AI could not read one */
  date: string | null;
  /** Amount in EUR, null when there is no readable amount */
  amountEur: number | null;
  /** True when the amount is in another currency and no exchange rate was found */
  noRate?: boolean;
  /**
   * Keys that are the same for the same receipt uploaded twice (file hash, shop + date + amount).
   * Only the first upload counts.
   */
  sameAs?: string[];
}

export type NotCountedReason = 'NO_AMOUNT' | 'NO_RATE' | 'NO_DATE' | 'DURING_PROJECT' | 'NOT_AN_EXTRA_DAY' | 'DUPLICATE';

export interface GreenTravelCalculation {
  mode: 'RECEIPTS' | 'FIXED';
  foodPerDayEur: number;
  accommodationPerNightEur: number;
  extraDays: string[];
  extraNights: string[];
  /** RECEIPTS: project days with a trip, when food receipts count too */
  projectTravelDays: string[];
  /** Suggested amounts */
  foodEur: number;
  accommodationEur: number;
  /** RECEIPTS: food spent per travel day and what counts after the daily limit */
  foodDays: { date: string; spentEur: number; countedEur: number }[];
  /** RECEIPTS: accommodation receipts on the extra nights, and the cap (nights × limit) */
  accommodationSpentEur: number;
  accommodationCapEur: number;
  /** RECEIPTS: receipts left out, with the reason (amountEur so the organiser can count one anyway) */
  notCounted: {
    id: string;
    filename: string;
    kind: ExtraReceipt['kind'];
    date: string | null;
    amountEur: number | null;
    reason: NotCountedReason;
    /** DUPLICATE: the file that counts instead */
    duplicateOf?: string;
  }[];
  /** RECEIPTS: dates read a year off (e.g. 2025 instead of 2026) that were corrected to the trip */
  correctedDates: { id: string; filename: string; from: string; to: string }[];
}

export function calculateGreenTravelExtra(input: {
  mode: 'RECEIPTS' | 'FIXED';
  foodPerDayEur: number | null;
  accommodationPerNightEur: number | null;
  extra: ExtraTravelDates;
  projectStart: Date;
  projectEnd: Date;
  /** First and last travel day (YYYY-MM-DD), to correct a misread year on any receipt of the trip */
  travelWindow?: { first: string; last: string } | null;
  receipts: ExtraReceipt[];
}): GreenTravelCalculation {
  const foodPerDay = Math.max(0, input.foodPerDayEur ?? 0);
  const perNight = Math.max(0, input.accommodationPerNightEur ?? 0);
  const { days, nights } = input.extra;
  const base = {
    mode: input.mode,
    foodPerDayEur: foodPerDay,
    accommodationPerNightEur: perNight,
    extraDays: days,
    extraNights: nights,
    projectTravelDays: input.extra.projectTravelDays ?? [],
  };

  if (input.mode === 'FIXED') {
    return {
      ...base,
      foodEur: round2(days.length * foodPerDay),
      accommodationEur: round2(nights.length * perNight),
      foodDays: [],
      accommodationSpentEur: 0,
      accommodationCapEur: round2(nights.length * perNight),
      notCounted: [],
      correctedDates: [],
    };
  }

  // Food counts on every travel day: the extra days, and project days with a trip
  const foodDays = [...new Set([...days, ...(input.extra.projectTravelDays ?? [])])].sort();
  const foodDaySet = new Set(foodDays);
  const nightSet = new Set(nights);
  const startDay = isoDay(dayUtc(input.projectStart));
  const endDay = isoDay(dayUtc(input.projectEnd));
  const dayBefore = (date: string) => isoDay(Date.parse(`${date}T00:00:00Z`) - DAY_MS);

  const spentPerDay = new Map<string, number>();
  let accommodationSpent = 0;
  const notCounted: GreenTravelCalculation['notCounted'] = [];
  const correctedDates: GreenTravelCalculation['correctedDates'] = [];

  const counts = (kind: ExtraReceipt['kind'], date: string) =>
    kind === 'FOOD' ? foodDaySet.has(date) : nightSet.has(date) || nightSet.has(dayBefore(date)); // hotel bills are often dated at check-out
  const shiftYear = (date: string, years: number) => `${Number(date.slice(0, 4)) + years}${date.slice(4)}`;
  const window = input.travelWindow;
  const duringTrip = (date: string) => !!window && date >= window.first && date <= window.last;
  const firstCopy = new Map<string, string>(); // sameAs key → filename of the first upload

  for (const r of input.receipts) {
    const leaveOut = (reason: NotCountedReason, date = r.date, duplicateOf?: string) =>
      notCounted.push({ id: r.id, filename: r.filename, kind: r.kind, date, amountEur: r.amountEur, reason, ...(duplicateOf ? { duplicateOf } : {}) });
    const original = (r.sameAs ?? []).map((key) => firstCopy.get(key)).find((name) => name !== undefined);
    if (original !== undefined) {
      leaveOut('DUPLICATE', r.date, original);
      continue;
    }
    for (const key of r.sameAs ?? []) firstCopy.set(key, r.filename);
    if (r.amountEur == null) {
      leaveOut(r.noRate ? 'NO_RATE' : 'NO_AMOUNT');
      continue;
    }
    if (!r.date) {
      leaveOut('NO_DATE');
      continue;
    }
    let date = r.date;
    // A year misread (16-09-2025 on a trip in September 2026): use the trip's year. Also when the
    // corrected day doesn't count, so the organiser sees the real reason (e.g. a project day).
    if (!counts(r.kind, date)) {
      const shifted = [shiftYear(date, 1), shiftYear(date, -1)];
      const fixed = shifted.find((d) => counts(r.kind, d)) ?? (duringTrip(date) ? undefined : shifted.find(duringTrip));
      if (fixed) {
        correctedDates.push({ id: r.id, filename: r.filename, from: date, to: fixed });
        date = fixed;
      }
    }
    if (r.kind === 'FOOD' && counts('FOOD', date)) {
      spentPerDay.set(date, (spentPerDay.get(date) ?? 0) + r.amountEur);
      continue;
    }
    if (r.kind === 'ACCOMMODATION' && counts('ACCOMMODATION', date)) {
      accommodationSpent += r.amountEur;
      continue;
    }
    leaveOut(date >= startDay && date <= endDay ? 'DURING_PROJECT' : 'NOT_AN_EXTRA_DAY', date);
  }

  const spentDays = foodDays
    .filter((d) => spentPerDay.has(d))
    .map((date) => {
      const spentEur = round2(spentPerDay.get(date)!);
      return { date, spentEur, countedEur: round2(Math.min(spentEur, foodPerDay)) };
    });
  const accommodationCapEur = round2(nights.length * perNight);
  const accommodationSpentEur = round2(accommodationSpent);

  return {
    ...base,
    foodEur: round2(spentDays.reduce((sum, d) => sum + d.countedEur, 0)),
    accommodationEur: round2(Math.min(accommodationSpentEur, accommodationCapEur)),
    foodDays: spentDays,
    accommodationSpentEur,
    accommodationCapEur,
    notCounted,
    correctedDates,
  };
}

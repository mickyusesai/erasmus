import { normalizePlace, samePlace } from './placeMatch.js';

/**
 * Puts a participant's trips in travel order. Used everywhere trips are listed
 * (organiser and participant pages, the AI review, the audit PDF).
 *
 * - Days follow the departure dates.
 * - Within a day, the organiser's own order wins (sortOrder, set with the arrows).
 * - Otherwise the trips are chained: the order is chosen in which each trip starts
 *   where the previous one ended ("Cluj-Napoca Airport (clj)" → "Cluj-Napoca (clj)"),
 *   continuing from where the previous day ended. Departure times from the tickets
 *   weigh in when known. Ties keep the order in which the trips were created.
 */
export interface SortableTravelItem {
  departureDate: Date | string;
  fromLocation: string;
  toLocation: string;
  departureTime?: string | null;
  sortOrder?: number | null;
  createdAt?: Date | string | null;
}

const MAX_EXACT_SEARCH = 10; // trips per day; above this a greedy chain is used

function dayKey(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function airportCode(place: string): string | null {
  const m = place.match(/\(([A-Za-z]{3})\)/);
  return m ? m[1].toUpperCase() : null;
}

/** How well one trip continues the previous one: 3 same place, 1 same city, 0 unrelated */
function connection(to: string, from: string): number {
  const codeA = airportCode(to);
  const codeB = airportCode(from);
  if (codeA && codeB) return codeA === codeB ? 3 : 0;
  const a = normalizePlace(to);
  const b = normalizePlace(from);
  if (!a || !b) return 0;
  if (a === b) return 3;
  return samePlace(to, from) ? 1 : 0;
}

function timeMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Score of putting b right after a */
function pairScore(a: SortableTravelItem, b: SortableTravelItem, aIndex: number, bIndex: number): number {
  let score = connection(a.toLocation, b.fromLocation);
  const ta = timeMinutes(a.departureTime);
  const tb = timeMinutes(b.departureTime);
  if (ta != null && tb != null) score += ta <= tb ? 4 : -4;
  // Tiny preference for the creation order, so ties stay as they were
  if (bIndex > aIndex) score += 0.01;
  return score;
}

/** Best order of one day's trips (highest total score of consecutive pairs) */
function orderDay<T extends SortableTravelItem>(day: T[], previousTo: string | null): T[] {
  const n = day.length;
  if (n <= 1) return day;

  const startScore = (i: number) => (previousTo ? connection(previousTo, day[i].fromLocation) : 0);

  if (n > MAX_EXACT_SEARCH) {
    // Greedy: start where the previous day ended (or with the first trip), then follow the chain
    const remaining = day.map((item, index) => ({ item, index }));
    const result: T[] = [];
    let current = remaining.reduce((best, c) => (startScore(c.index) > startScore(best.index) ? c : best), remaining[0]);
    while (remaining.length > 0) {
      remaining.splice(remaining.indexOf(current), 1);
      result.push(current.item);
      if (remaining.length === 0) break;
      const from = current;
      current = remaining.reduce(
        (best, c) => (pairScore(from.item, c.item, from.index, c.index) > pairScore(from.item, best.item, from.index, best.index) ? c : best),
        remaining[0]
      );
    }
    return result;
  }

  // Exact search over orders (dynamic programming over subsets)
  const size = 1 << n;
  const best = new Float64Array(size * n).fill(-Infinity);
  const prev = new Int8Array(size * n).fill(-1);
  for (let i = 0; i < n; i++) best[(1 << i) * n + i] = startScore(i) + (n - i) * 0.001;
  for (let mask = 1; mask < size; mask++) {
    for (let last = 0; last < n; last++) {
      const cur = best[mask * n + last];
      if (cur === -Infinity || !(mask & (1 << last))) continue;
      for (let next = 0; next < n; next++) {
        if (mask & (1 << next)) continue;
        const nextMask = mask | (1 << next);
        const value = cur + pairScore(day[last], day[next], last, next);
        if (value > best[nextMask * n + next]) {
          best[nextMask * n + next] = value;
          prev[nextMask * n + next] = last;
        }
      }
    }
  }
  const full = size - 1;
  let last = 0;
  for (let i = 1; i < n; i++) if (best[full * n + i] > best[full * n + last]) last = i;
  const order: number[] = [];
  let mask = full;
  while (last !== -1) {
    order.push(last);
    const p = prev[mask * n + last];
    mask &= ~(1 << last);
    last = p;
  }
  return order.reverse().map((i) => day[i]);
}

export function sortTravelItemsByJourney<T extends SortableTravelItem>(items: T[]): T[] {
  if (items.length <= 1) return items;

  // Creation order is the tie-breaker (the trip builder creates trips in its own order)
  const created = (item: T) => (item.createdAt ? new Date(item.createdAt).getTime() : 0);
  const byDay = new Map<string, T[]>();
  const indexed = items.map((item, i) => ({ item, i }));
  indexed.sort((a, b) => {
    const da = dayKey(a.item.departureDate);
    const db = dayKey(b.item.departureDate);
    if (da !== db) return da < db ? -1 : 1;
    return created(a.item) - created(b.item) || a.i - b.i;
  });
  for (const { item } of indexed) {
    const key = dayKey(item.departureDate);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(item);
  }

  const result: T[] = [];
  let previousTo: string | null = null;
  for (const day of byDay.values()) {
    const manual = day.some((item) => item.sortOrder != null);
    const ordered: T[] = manual
      ? [...day].sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER))
      : orderDay(day, previousTo);
    result.push(...ordered);
    previousTo = ordered[ordered.length - 1].toLocation;
  }
  return result;
}

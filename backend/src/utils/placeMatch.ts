/**
 * Loose place matching for trips: "Wrocław Główny" and "Wroclaw", or "Rīga" and
 * "Riga", are the same place. Used to recognise that an AI-built trip already
 * exists (e.g. added manually by the participant) so regenerating never
 * duplicates it.
 */
const STATION_WORDS = new Set([
  'glowny', 'glowna', 'centralna', 'centralny', 'central', 'centrale', 'centraal', 'hbf', 'hauptbahnhof',
  'station', 'stacja', 'dworzec', 'autobusowy', 'autobusowa', 'bus', 'busstation', 'airport', 'lotnisko',
  'aeroporto', 'aeropuerto', 'flughafen', 'terminal', 'piazza', 'principe', 'sao', 'ao', 'st', 'sta', 'gare',
  'nord', 'sud', 'est', 'ovest', 'east', 'west', 'north', 'south', 'main', 'international', 'intl',
]);

export function normalizePlace(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/gi, 'l')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STATION_WORDS.has(w) && !/^t\d$/.test(w))
    .join(' ')
    .trim();
}

export function samePlace(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizePlace(a);
  const y = normalizePlace(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const xs = x.split(' ');
  const ys = y.split(' ');
  // "milano" vs "milan malpensa" / "warszawa" vs "warsaw central": first significant token, allowing a 1-char stem difference
  const stem = (s: string) => s.slice(0, Math.max(4, s.length - 1));
  return xs[0].startsWith(stem(ys[0])) || ys[0].startsWith(stem(xs[0])) || x.includes(y) || y.includes(x);
}

/** Same calendar day, or at most one day apart (overnight legs) */
export function sameTravelDay(a: Date | string | null | undefined, b: Date | string | null | undefined): boolean {
  if (!a || !b) return false;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.abs(da - db) <= 36 * 60 * 60 * 1000;
}

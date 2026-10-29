import { describe, it, expect } from 'vitest';
import { sortTravelItemsByJourney } from '../utils/sortTravelItems.js';

let n = 0;
const trip = (day: string, from: string, to: string, extra: { departureTime?: string; sortOrder?: number } = {}) => ({
  id: `${from} → ${to}`,
  departureDate: new Date(`${day}T00:00:00Z`),
  fromLocation: from,
  toLocation: to,
  createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, n++)),
  ...extra,
});
const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe('trip order', () => {
  it("puts Giulia's participant's trips in travel order (created in a different order)", () => {
    // Created in the order the trip builder happened to make them
    const items = [
      trip('2026-10-01', 'Cluj-Napoca (clj)', 'Bologna (blq)'),
      trip('2026-10-10', 'Bologna (blq)', 'Cluj-Napoca (clj)'),
      trip('2026-10-01', 'Cluj-Napoca (home)', 'Cluj-Napoca Airport (clj)'),
      trip('2026-10-01', 'Bologna Centrale', 'Rimini'),
      trip('2026-10-01', 'Bologna Airport', 'Bologna Train Station'),
      trip('2026-10-01', 'Rimini (local, Zone 1)', 'Rimini (local, Zone 1)'),
      trip('2026-10-10', 'Rimini Train Station', 'Bologna Guglielmo Marconi Airport'),
      trip('2026-10-10', 'Cluj-Napoca Airport (clj)', 'Cluj-Napoca (home)'),
    ];
    expect(ids(sortTravelItemsByJourney(items))).toEqual([
      'Cluj-Napoca (home) → Cluj-Napoca Airport (clj)',
      'Cluj-Napoca (clj) → Bologna (blq)',
      'Bologna Airport → Bologna Train Station',
      'Bologna Centrale → Rimini',
      'Rimini (local, Zone 1) → Rimini (local, Zone 1)',
      'Rimini Train Station → Bologna Guglielmo Marconi Airport',
      'Bologna (blq) → Cluj-Napoca (clj)',
      'Cluj-Napoca Airport (clj) → Cluj-Napoca (home)',
    ]);
  });

  it('chains same-day legs', () => {
    const items = [trip('2026-09-01', 'Eindhoven', 'Dordrecht'), trip('2026-09-01', 'Krakow', 'Eindhoven')];
    expect(ids(sortTravelItemsByJourney(items))).toEqual(['Krakow → Eindhoven', 'Eindhoven → Dordrecht']);
  });

  it('uses departure times from the tickets', () => {
    const items = [
      trip('2026-09-01', 'Riga', 'Valmiera', { departureTime: '18:40' }),
      trip('2026-09-01', 'Riga Airport', 'Riga', { departureTime: '17:05' }),
    ];
    expect(ids(sortTravelItemsByJourney(items))).toEqual(['Riga Airport → Riga', 'Riga → Valmiera']);
  });

  it("follows the organiser's order within a day, dates still decide the days", () => {
    const items = [
      trip('2026-09-02', 'B', 'C'),
      trip('2026-09-01', 'X', 'Y', { sortOrder: 1 }),
      trip('2026-09-01', 'Y', 'Z', { sortOrder: 0 }),
    ];
    expect(ids(sortTravelItemsByJourney(items))).toEqual(['Y → Z', 'X → Y', 'B → C']);
  });

  it('keeps creation order when nothing connects', () => {
    const items = [trip('2026-09-01', 'A', 'B'), trip('2026-09-01', 'C', 'D'), trip('2026-09-01', 'E', 'F')];
    expect(ids(sortTravelItemsByJourney(items))).toEqual(['A → B', 'C → D', 'E → F']);
  });
});

import { describe, it, expect } from 'vitest';
import { compareTrips } from '../services/checks/otherProjects.js';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const trip = (date: string, from: string, to: string, excluded = false) => ({
  departureDate: d(date),
  arrivalDate: null,
  fromLocation: from,
  toLocation: to,
  excludedFromReimbursement: excluded,
});

// One project ends on 3 Oct, the next starts on 6 Oct in the same country
const first = { startDate: d('2026-09-24'), endDate: d('2026-10-03') };
const second = { startDate: d('2026-10-06'), endDate: d('2026-10-16') };

describe('the same person in two projects', () => {
  it('finds the trip home and the trip out on the same days', () => {
    const home = [trip('2026-09-22', 'Kraków', 'Riga'), trip('2026-10-05', 'Riga', 'Vilnius'), trip('2026-10-07', 'Vilnius', 'Kraków')];
    const out = [trip('2026-10-04', 'Kraków', 'Warszawa'), trip('2026-10-05', 'Warszawa', 'Vilnius'), trip('2026-10-06', 'Vilnius', 'Riga'), trip('2026-10-17', 'Riga', 'Kraków')];
    const result = compareTrips(home, first, out, second);
    expect(result.sameDays).toEqual([{ date: '2026-10-05', here: ['Riga → Vilnius'], there: ['Warszawa → Vilnius'] }]);
    // Travelling home on 7 Oct while the next project (6–16 Oct) was running
    expect(result.hereDuringOther).toEqual([{ date: '2026-10-07', trip: 'Vilnius → Kraków' }]);
    expect(result.thereDuringThis).toEqual([]);
  });

  it('finds nothing when the projects are apart, travel days at the edges are normal', () => {
    const a = [trip('2026-09-24', 'Kraków', 'Riga'), trip('2026-10-03', 'Riga', 'Kraków')];
    const b = [trip('2026-10-06', 'Kraków', 'Riga'), trip('2026-10-16', 'Riga', 'Kraków', false), trip('2026-10-05', 'Riga', 'Kraków', true)];
    expect(compareTrips(a, first, b, second)).toEqual({ sameDays: [], hereDuringOther: [], thereDuringThis: [] });
  });
});

import { describe, it, expect } from 'vitest';
import { computePayable } from '../utils/reimbursementMath.js';
import { computeAllowanceLineAmount, suggestTravelDays } from '../services/allowances/index.js';

const legacy = (totalEur: number, max: number, multi: boolean) =>
  max > 0 && !multi ? Math.min(totalEur, max) : totalEur;

describe('computePayable', () => {
  it('equals the historical formula when there are no allowances', () => {
    for (const [travel, max, multi] of [
      [344, 309, false], [200, 309, false], [344, 0, false], [344, 309, true],
    ] as [number, number, boolean][]) {
      const r = computePayable({ travelEur: travel, allowanceInsideCap: 0, allowanceOnTop: 0, maxReimbursement: max, hasMultiPersonBooking: multi });
      expect(r.total).toBe(legacy(travel, max, multi));
      expect(r.base).toBe(legacy(travel, max, multi));
    }
  });

  it('adds on-top allowances after the cap', () => {
    const r = computePayable({ travelEur: 344, allowanceInsideCap: 0, allowanceOnTop: 80, maxReimbursement: 309, hasMultiPersonBooking: false });
    expect(r.base).toBe(309);
    expect(r.total).toBe(389);
    expect(r.capped).toBe(true);
  });

  it('caps inside-cap allowances together with travel', () => {
    const r = computePayable({ travelEur: 250, allowanceInsideCap: 100, allowanceOnTop: 0, maxReimbursement: 309, hasMultiPersonBooking: false });
    expect(r.total).toBe(309);
    const r2 = computePayable({ travelEur: 200, allowanceInsideCap: 50, allowanceOnTop: 0, maxReimbursement: 309, hasMultiPersonBooking: false });
    expect(r2.total).toBe(250);
    expect(r2.capped).toBe(false);
  });
});

describe('computeAllowanceLineAmount', () => {
  const base = { active: true, audience: 'ALL' as const, countsTowardMax: false, amountPerDay: null, maxDays: null, capPerDay: null, capTotal: null };
  it('per travel day clamps to maxDays', () => {
    const rule = { ...base, mode: 'PER_TRAVEL_DAY' as const, amountPerDay: 20, maxDays: 4 };
    expect(computeAllowanceLineAmount(rule, 2, 0)).toBe(40);
    expect(computeAllowanceLineAmount(rule, 9, 0)).toBe(80);
    expect(computeAllowanceLineAmount(rule, null, 0)).toBe(0);
  });
  it('per receipt applies per-day and total caps', () => {
    const rule = { ...base, mode: 'PER_RECEIPT' as const, capPerDay: 20, capTotal: 50 };
    expect(computeAllowanceLineAmount(rule, 2, 35)).toBe(35);
    expect(computeAllowanceLineAmount(rule, 2, 70)).toBe(40);
    expect(computeAllowanceLineAmount(rule, 5, 120)).toBe(50);
  });
});

describe('suggestTravelDays', () => {
  it('counts days before the project start and after the end', () => {
    const items = [
      { departureDate: new Date('2026-03-01T08:00:00Z'), arrivalDate: new Date('2026-03-02T20:00:00Z'), excludedFromReimbursement: false },
      { departureDate: new Date('2026-03-10T08:00:00Z'), arrivalDate: new Date('2026-03-11T22:00:00Z'), excludedFromReimbursement: false },
    ];
    expect(suggestTravelDays(items, new Date('2026-03-03'), new Date('2026-03-09'))).toBe(4);
  });
});

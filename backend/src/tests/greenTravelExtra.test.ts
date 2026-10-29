import { describe, it, expect } from 'vitest';
import { extraTravelDates, calculateGreenTravelExtra, type ExtraReceipt } from '../utils/greenTravelExtra.js';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const trip = (dep: string, arr: string | null = null, excluded = false) => ({
  departureDate: d(dep),
  arrivalDate: arr ? d(arr) : null,
  excludedFromReimbursement: excluded,
});
const projectStart = d('2026-08-25');
const projectEnd = d('2026-09-02');

describe('extra travel dates', () => {
  it('counts the days outside the project and the nights away from home', () => {
    // arrives the day before the start, flies home the day after the end
    expect(extraTravelDates([trip('2026-08-24'), trip('2026-09-03')], projectStart, projectEnd)).toEqual({
      days: ['2026-08-24', '2026-09-03'],
      nights: ['2026-08-24'],
    });
  });

  it('handles two travel days each way', () => {
    const items = [trip('2026-08-23'), trip('2026-08-24'), trip('2026-09-03'), trip('2026-09-04')];
    expect(extraTravelDates(items, projectStart, projectEnd)).toEqual({
      days: ['2026-08-23', '2026-08-24', '2026-09-03', '2026-09-04'],
      nights: ['2026-08-23', '2026-08-24', '2026-09-03'],
    });
  });

  it('ignores trips that are not reimbursed and travel inside the project', () => {
    const items = [trip('2026-08-20', null, true), trip('2026-08-25'), trip('2026-09-02')];
    expect(extraTravelDates(items, projectStart, projectEnd)).toEqual({ days: [], nights: [] });
  });
});

describe('green travel extra from receipts', () => {
  const extra = extraTravelDates([trip('2026-08-24'), trip('2026-09-03')], projectStart, projectEnd);
  const r = (id: string, kind: ExtraReceipt['kind'], date: string | null, amountEur: number | null, noRate = false): ExtraReceipt =>
    ({ id, kind, filename: `${id}.jpg`, date, amountEur, noRate });

  const result = calculateGreenTravelExtra({
    mode: 'RECEIPTS',
    foodPerDayEur: 40,
    accommodationPerNightEur: 35,
    extra,
    projectStart,
    projectEnd,
    receipts: [
      r('lunch', 'FOOD', '2026-08-24', 30),
      r('dinner', 'FOOD', '2026-08-24', 22.1),
      r('bus-snack', 'FOOD', '2026-09-03', 18.4),
      r('project-cafe', 'FOOD', '2026-08-27', 12),
      r('hotel', 'ACCOMMODATION', '2026-08-25', 80), // check-out the morning after the night of 24 Aug
      r('hotel-home', 'ACCOMMODATION', '2026-09-04', 60),
      r('blurry', 'FOOD', null, 9),
      r('unreadable', 'FOOD', '2026-08-24', null),
      r('zloty', 'FOOD', '2026-09-03', null, true),
    ],
  });

  it('caps food per day', () => {
    expect(result.foodDays).toEqual([
      { date: '2026-08-24', spentEur: 52.1, countedEur: 40 },
      { date: '2026-09-03', spentEur: 18.4, countedEur: 18.4 },
    ]);
    expect(result.foodEur).toBe(58.4);
  });

  it('caps accommodation at the extra nights times the nightly limit', () => {
    expect(result.accommodationSpentEur).toBe(80);
    expect(result.accommodationCapEur).toBe(35);
    expect(result.accommodationEur).toBe(35);
  });

  it('lists what it left out and why', () => {
    expect(result.notCounted.map((n) => [n.id, n.reason])).toEqual([
      ['project-cafe', 'DURING_PROJECT'],
      ['hotel-home', 'NOT_AN_EXTRA_DAY'],
      ['blurry', 'NO_DATE'],
      ['unreadable', 'NO_AMOUNT'],
      ['zloty', 'NO_RATE'],
    ]);
  });

  it('pays nothing without limits', () => {
    const none = calculateGreenTravelExtra({
      mode: 'RECEIPTS', foodPerDayEur: null, accommodationPerNightEur: null, extra, projectStart, projectEnd,
      receipts: [r('lunch', 'FOOD', '2026-08-24', 30)],
    });
    expect(none.foodEur).toBe(0);
    expect(none.accommodationEur).toBe(0);
  });
});

describe('receipt dates read a year off', () => {
  it('uses the trip year when only the year is wrong', () => {
    const extra = extraTravelDates([trip('2026-08-24'), trip('2026-09-03')], projectStart, projectEnd);
    const result = calculateGreenTravelExtra({
      mode: 'RECEIPTS', foodPerDayEur: 20, accommodationPerNightEur: 35, extra, projectStart, projectEnd,
      receipts: [{ id: 'rachunek', kind: 'FOOD', filename: 'rachunek.jpg', date: '2025-09-03', amountEur: 23.4 }],
    });
    expect(result.correctedDates).toEqual([{ id: 'rachunek', filename: 'rachunek.jpg', from: '2025-09-03', to: '2026-09-03' }]);
    expect(result.foodDays).toEqual([{ date: '2026-09-03', spentEur: 23.4, countedEur: 20 }]);
    expect(result.notCounted).toEqual([]);
  });

  it('keeps receipts that are simply on another day out, with their amount', () => {
    const extra = extraTravelDates([trip('2026-08-24'), trip('2026-09-03')], projectStart, projectEnd);
    const result = calculateGreenTravelExtra({
      mode: 'RECEIPTS', foodPerDayEur: 20, accommodationPerNightEur: 35, extra, projectStart, projectEnd,
      receipts: [{ id: 'cafe', kind: 'FOOD', filename: 'cafe.jpg', date: '2026-08-27', amountEur: 12 }],
    });
    expect(result.correctedDates).toEqual([]);
    expect(result.notCounted).toEqual([{ id: 'cafe', filename: 'cafe.jpg', kind: 'FOOD', date: '2026-08-27', amountEur: 12, reason: 'DURING_PROJECT' }]);
  });
});

describe('green travel extra as a fixed amount', () => {
  it('pays per extra day and per extra night', () => {
    const items = [trip('2026-08-23'), trip('2026-08-24'), trip('2026-09-03'), trip('2026-09-04')];
    const result = calculateGreenTravelExtra({
      mode: 'FIXED',
      foodPerDayEur: 40,
      accommodationPerNightEur: 35,
      extra: extraTravelDates(items, projectStart, projectEnd),
      projectStart,
      projectEnd,
      receipts: [],
    });
    expect(result.foodEur).toBe(160);
    expect(result.accommodationEur).toBe(105);
  });
});

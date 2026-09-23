import { describe, it, expect } from 'vitest';
import { computePayable } from '../utils/reimbursementMath.js';
import { suggestTravelDays, summarizeTravelDays } from '../utils/travelDays.js';

const legacy = (totalEur: number, max: number, multi: boolean) =>
  max > 0 && !multi ? Math.min(totalEur, max) : totalEur;

describe('computePayable', () => {
  it('equals the historical formula when there is no green travel extra', () => {
    for (const [travel, max, multi] of [
      [344, 309, false], [200, 309, false], [344, 0, false], [344, 309, true],
    ] as [number, number, boolean][]) {
      const r = computePayable({ travelEur: travel, allowanceInsideCap: 0, allowanceOnTop: 0, maxReimbursement: max, hasMultiPersonBooking: multi });
      expect(r.total).toBe(legacy(travel, max, multi));
    }
  });

  it('adds the green travel extra after the cap', () => {
    const r = computePayable({ travelEur: 344, allowanceInsideCap: 0, allowanceOnTop: 80, maxReimbursement: 309, hasMultiPersonBooking: false });
    expect(r.base).toBe(309);
    expect(r.total).toBe(389);
    expect(r.capped).toBe(true);
  });
});

describe('travel days', () => {
  const items = [
    { departureDate: new Date('2026-03-01T08:00:00Z'), arrivalDate: new Date('2026-03-02T20:00:00Z'), excludedFromReimbursement: false },
    { departureDate: new Date('2026-03-10T08:00:00Z'), arrivalDate: new Date('2026-03-11T22:00:00Z'), excludedFromReimbursement: false },
  ];
  it('counts days before the project start and after the end', () => {
    expect(suggestTravelDays(items, new Date('2026-03-03'), new Date('2026-03-09'))).toBe(4);
  });
  it('summarises the span', () => {
    const s = summarizeTravelDays(items, new Date('2026-03-03'), new Date('2026-03-09'));
    expect(s.totalTravelDays).toBe(11);
    expect(s.firstTravelDate?.toISOString().slice(0, 10)).toBe('2026-03-01');
    expect(s.lastTravelDate?.toISOString().slice(0, 10)).toBe('2026-03-11');
  });
});

describe('consolidation provider-error mapping', () => {
  it('extracts the rejected content part index from an invalid-PDF error', async () => {
    const { JourneyConsolidationService } = await import('../services/ai/journeyConsolidationService.js');
    const svc = new JourneyConsolidationService() as unknown as { unreadablePartIndex: (e: unknown) => number | null; describeFailure: (e: unknown) => string };
    const err = { status: 400, message: '400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.0.content.3.pdf.source.base64.data: The PDF specified was not valid."}}' };
    expect(svc.unreadablePartIndex(err)).toBe(3);
    expect(svc.unreadablePartIndex({ message: 'overloaded_error' })).toBeNull();
    expect(svc.describeFailure({ status: 529, message: 'overloaded' })).toMatch(/busy/);
  });
});

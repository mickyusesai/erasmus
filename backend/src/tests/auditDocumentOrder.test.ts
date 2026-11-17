import { describe, it, expect } from 'vitest';
import { orderDocumentsByJourney, orderDeclarationsByJourney } from '../utils/auditDocumentOrder.js';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const doc = (id: string, documentType: string, extraction: { flightNumber?: string; documentDate?: Date } | null = null) => ({ id, documentType, extraction });
const trip = (documentId: string | null, additional: string[] = [], extra: { flightNumber?: string; luggageDocumentId?: string } = {}) => ({
  documentId,
  additionalDocumentIds: additional.length ? JSON.stringify(additional) : null,
  luggageDocumentId: extra.luggageDocumentId ?? null,
  flightNumber: extra.flightNumber ?? null,
});

describe('audit file: documents in travel order', () => {
  // Uploaded in this order: boarding pass, train ticket, bus ticket, bank screenshot, …, flight invoice last
  const uploads = [
    doc('bp-out', 'FLIGHT_BOARDING_PASS'),
    doc('train', 'TRAIN_TICKET'),
    doc('bus', 'BUS_TICKET'),
    doc('bank', 'BANK_TRANSACTION'),
    doc('bp-back', 'FLIGHT_BOARDING_PASS'),
    doc('invoice', 'FLIGHT_INVOICE'),
  ];
  const trips = [
    trip('bp-out', ['invoice'], { flightNumber: 'W4 3393' }), // #1 flight out
    trip('train'), // #2
    trip('bus', ['bank']), // #3
    trip('invoice', ['bp-back'], { flightNumber: 'W4 3394' }), // #4 flight back, same invoice
  ];

  it('lists each trip’s files together, trip by trip', () => {
    const order = orderDocumentsByJourney(trips, uploads);
    expect(order.map((o) => o.document.id)).toEqual(['bp-out', 'invoice', 'train', 'bus', 'bank', 'bp-back']);
  });

  it('says which trips use a file; a shared file sits with the first one', () => {
    const order = orderDocumentsByJourney(trips, uploads);
    expect(order.find((o) => o.document.id === 'invoice')!.trips).toEqual([1, 4]);
    expect(order.find((o) => o.document.id === 'train')!.trips).toEqual([2]);
  });

  it('puts an unlinked boarding pass with the flight it names', () => {
    const order = orderDocumentsByJourney(
      [trip('invoice', [], { flightNumber: 'W4 3393' }), trip('train'), trip('invoice', [], { flightNumber: 'W4 3394' })],
      [doc('bp-back', 'FLIGHT_BOARDING_PASS', { flightNumber: 'w43394' }), doc('train', 'TRAIN_TICKET'), doc('invoice', 'FLIGHT_INVOICE')]
    );
    expect(order.map((o) => [o.document.id, o.trips])).toEqual([['invoice', [1, 3]], ['train', [2]], ['bp-back', [3]]]);
  });

  it('keeps files without a trip after the trips, and receipts last by receipt date', () => {
    const order = orderDocumentsByJourney(
      [trip('train')],
      [
        doc('hotel', 'HOTEL_INVOICE', { documentDate: d('2026-10-02') }),
        doc('loose', 'OTHER'),
        doc('meal-undated', 'MEAL_RECEIPT'),
        doc('meal', 'MEAL_RECEIPT', { documentDate: d('2026-10-01') }),
        doc('train', 'TRAIN_TICKET'),
        doc('luggage', 'LUGGAGE_INVOICE'),
      ]
    );
    expect(order.map((o) => o.document.id)).toEqual(['train', 'loose', 'luggage', 'meal', 'hotel', 'meal-undated']);
    expect(order.find((o) => o.document.id === 'loose')!.trips).toEqual([]);
  });

  it('ignores links to files that no longer exist and files linked twice to one trip', () => {
    const order = orderDocumentsByJourney([trip('gone', ['train', 'train'], { luggageDocumentId: 'train' })], [doc('train', 'TRAIN_TICKET')]);
    expect(order).toEqual([{ document: doc('train', 'TRAIN_TICKET'), trips: [1] }]);
  });
});

describe('audit file: declarations of travel in travel order', () => {
  it('follows the trips, then the travel date', () => {
    const decl = (id: string, travelItemId: string | null, travelDate: string, createdAt: string) => ({ id, travelItemId, travelDate: d(travelDate), createdAt: d(createdAt) });
    const sorted = orderDeclarationsByJourney(
      [{ id: 'out' }, { id: 'back' }],
      [decl('loose-late', null, '2026-10-12', '2026-10-18'), decl('for-back', 'back', '2026-10-10', '2026-10-18'), decl('loose-early', null, '2026-10-02', '2026-10-19'), decl('for-out', 'out', '2026-10-01', '2026-10-20')]
    );
    expect(sorted.map((x) => x.id)).toEqual(['for-out', 'for-back', 'loose-early', 'loose-late']);
  });
});

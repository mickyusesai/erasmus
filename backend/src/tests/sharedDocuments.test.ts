import { describe, it, expect } from 'vitest';
import { receiptKey } from '../services/checks/sharedDocuments.js';

const doc = (type: string, amount: number | null, date: string | null, merchant: string | null, currency = 'PLN') => ({
  id: 'x',
  documentType: type,
  contentHash: null,
  renamedFilename: 'r.jpg',
  extraction: { amount, currency, documentDate: date ? new Date(`${date}T00:00:00Z`) : null, merchantName: merchant },
});

describe('receipts claimed twice', () => {
  it('matches the same fuel receipt uploaded by two people', () => {
    expect(receiptKey(doc('FUEL_RECEIPT', 251.4, '2026-09-04', 'ORLEN Stacja 123'))).toBe(
      receiptKey(doc('FUEL_RECEIPT', 251.4, '2026-09-04', 'orlen  stacja 123'))
    );
  });

  it('needs amount, date and shop, and never matches tickets', () => {
    expect(receiptKey(doc('FUEL_RECEIPT', 251.4, null, 'ORLEN'))).toBeNull();
    expect(receiptKey(doc('FUEL_RECEIPT', 251.4, '2026-09-04', null))).toBeNull();
    expect(receiptKey(doc('BUS_TICKET', 6.63, '2026-09-04', 'Lux Express'))).toBeNull();
  });
});

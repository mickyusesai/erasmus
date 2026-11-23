import { describe, it, expect } from 'vitest';
import { canUnlink, whyNotLinkable, type LinkCandidate } from '../services/affiliate/customers.js';
import { OPEN_PURCHASE_STATUSES } from '../routes/stripe/webhook.js';

const org = (over: Partial<LinkCandidate> = {}): LinkCandidate => ({
  id: 'org-1',
  name: 'Youth Bridge',
  isTestAccount: false,
  customerLink: null,
  ...over,
});

describe('linking a customer to an affiliate by hand', () => {
  it('accepts an organisation that has no affiliate yet', () => {
    expect(whyNotLinkable('affiliate-1', org())).toBeNull();
  });

  it('refuses the affiliate itself', () => {
    expect(whyNotLinkable('org-1', org())).toBe('Youth Bridge is the affiliate itself');
  });

  it('refuses an organisation that already has an affiliate, this one or another: one affiliate per customer', () => {
    expect(whyNotLinkable('affiliate-1', org({ customerLink: { affiliate: { name: 'Mobility Friends' } } }))).toBe(
      'Youth Bridge is already a customer of Mobility Friends'
    );
  });

  it('refuses the onboarding test account', () => {
    expect(whyNotLinkable('affiliate-1', org({ isTestAccount: true }))).toBe('Youth Bridge is the onboarding test account');
  });
});

describe('undoing a link', () => {
  it('a hand-made link that earned nothing can be removed', () => {
    expect(canUnlink({ addedBy: 'admin@example.test', commissionCount: 0 })).toBe(true);
  });

  it('a link that earned commission stays (also when that commission was reversed later)', () => {
    expect(canUnlink({ addedBy: 'admin@example.test', commissionCount: 1 })).toBe(false);
  });

  it('a link made through the affiliate code stays', () => {
    expect(canUnlink({ addedBy: null, commissionCount: 0 })).toBe(false);
  });
});

describe('which purchases a payment notice may still complete', () => {
  it('open ones only: a completed or refunded purchase is never handled a second time', () => {
    expect(OPEN_PURCHASE_STATUSES).toEqual(['PENDING', 'EXPIRED', 'FAILED']);
    expect(OPEN_PURCHASE_STATUSES).not.toContain('COMPLETED');
    expect(OPEN_PURCHASE_STATUSES).not.toContain('REFUNDED');
  });
});

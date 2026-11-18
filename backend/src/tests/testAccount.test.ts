import { describe, it, expect } from 'vitest';
import { suggestedTestAccountEmail } from '../services/organisation/testAccount.js';

describe('onboarding test account: where its emails go by default', () => {
  it('adds +onboarding-test to the super admin’s own address', () => {
    expect(suggestedTestAccountEmail('micky@example.org')).toBe('micky+onboarding-test@example.org');
  });

  it('replaces an existing +tag instead of stacking a second one', () => {
    expect(suggestedTestAccountEmail('Micky+admin@Example.org')).toBe('micky+onboarding-test@example.org');
  });

  it('leaves something that is not an email address alone', () => {
    expect(suggestedTestAccountEmail('not-an-email')).toBe('not-an-email');
  });
});

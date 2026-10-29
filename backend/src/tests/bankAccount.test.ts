import { describe, it, expect } from 'vitest';
import { bankAccountProblem, ibanChecksumOk, maskAccountNumber, normaliseAccountNumber } from '../utils/bankAccount.js';

describe('bank account checks', () => {
  it('accepts valid IBANs, with or without spaces', () => {
    expect(bankAccountProblem('LT77 3250 0001 7278 1485')).toBeNull();
    expect(bankAccountProblem('NL91ABNA0417164300')).toBeNull();
    expect(bankAccountProblem('de89 3704 0044 0532 0130 00')).toBeNull();
    expect(ibanChecksumOk(normaliseAccountNumber('GB82 WEST 1234 5698 7654 32'))).toBe(true);
  });

  it('catches typos and junk', () => {
    expect(bankAccountProblem('LT773250000172781486')).toMatch(/add up/);
    expect(bankAccountProblem('NL91ABNA041716')).toMatch(/length/);
    expect(bankAccountProblem('-')).toMatch(/No bank account/);
    expect(bankAccountProblem('n/a')).toMatch(/letters and digits/);
    expect(bankAccountProblem('')).toMatch(/No bank account/);
    expect(bankAccountProblem('1234')).toMatch(/incomplete/);
  });

  it('allows account numbers from countries without IBAN', () => {
    expect(bankAccountProblem('40817810099910004312')).toBeNull();
  });

  it('masks the number', () => {
    expect(maskAccountNumber('LT77 3250 0001 7278 1485')).toBe('•••• 1485');
    expect(maskAccountNumber(null)).toBe('(empty)');
  });
});

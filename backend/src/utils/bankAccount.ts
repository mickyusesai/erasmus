/**
 * Checks on a participant's bank account number. IBANs are verified with their check
 * digits; other account numbers (some partner countries have no IBAN) only need to look
 * like an account number, so "-" or "n/a" can't be submitted.
 */

/** Uppercase, without spaces or dashes */
export function normaliseAccountNumber(value: string | null | undefined): string {
  return (value || '').replace(/[\s-]/g, '').toUpperCase();
}

/** IBAN length per country (Erasmus+ programme and partner countries) */
const IBAN_LENGTH: Record<string, number> = {
  AD: 24, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BY: 28, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18,
  EE: 20, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, HR: 21, HU: 28, IE: 22,
  IL: 23, IS: 26, IT: 27, KZ: 20, LB: 28, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MD: 24, ME: 22, MK: 19,
  MT: 31, NL: 18, NO: 15, PL: 28, PS: 29, PT: 25, RO: 24, RS: 22, SE: 24, SI: 19, SK: 24, SM: 27, TN: 24,
  TR: 26, UA: 29, XK: 20,
};

export function looksLikeIban(value: string): boolean {
  return /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(value);
}

/** ISO 13616 check: move the first 4 characters to the end, letters → numbers, mod 97 must be 1 */
export function ibanChecksumOk(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of code) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** A short explanation when the account number can't be right, otherwise null */
export function bankAccountProblem(value: string | null | undefined): string | null {
  const account = normaliseAccountNumber(value);
  if (!account) return 'No bank account number';
  if (!/^[A-Z0-9]+$/.test(account)) return 'The bank account number can only contain letters and digits';
  if (/^[A-Z]{2}\d{2}/.test(account)) {
    const expected = IBAN_LENGTH[account.slice(0, 2)];
    if (expected && account.length !== expected) return `This IBAN has the wrong length (${account.slice(0, 2)} IBANs have ${expected} characters)`;
    if (!looksLikeIban(account)) return 'This IBAN has the wrong length';
    if (!ibanChecksumOk(account)) return "This IBAN doesn't add up (check for a typo)";
    return null;
  }
  if (account.replace(/[^0-9]/g, '').length < 6) return 'The bank account number looks incomplete';
  return null;
}

/** "•••• 1234" for change logs and emails */
export function maskAccountNumber(value: string | null | undefined): string {
  const account = normaliseAccountNumber(value);
  return account ? `•••• ${account.slice(-4)}` : '(empty)';
}

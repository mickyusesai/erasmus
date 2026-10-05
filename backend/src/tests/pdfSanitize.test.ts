import { describe, it, expect } from 'vitest';
import { sanitizePdfBuffer } from '../utils/pdfSanitize.js';

describe('sanitizePdfBuffer', () => {
  it('leaves a clean PDF untouched', () => {
    const buf = Buffer.from('%PDF-1.4\n1 0 obj');
    const r = sanitizePdfBuffer(buf)!;
    expect(r.repaired).toBe(false);
    expect(r.buffer).toBe(buf);
  });
  it('strips leading junk before the header', () => {
    const buf = Buffer.from('\n        \n        \n\n\n%PDF-1.4\n%junk');
    const r = sanitizePdfBuffer(buf)!;
    expect(r.repaired).toBe(true);
    expect(r.strippedBytes).toBe(21);
    expect(r.buffer.subarray(0, 8).toString()).toBe('%PDF-1.4');
  });
  it('returns null for a non-PDF (e.g. HTML saved as .pdf)', () => {
    expect(sanitizePdfBuffer(Buffer.from('<!DOCTYPE html><html>…'))).toBeNull();
  });
});

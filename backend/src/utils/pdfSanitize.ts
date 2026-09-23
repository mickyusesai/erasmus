/**
 * Some download portals prepend whitespace or other bytes before the PDF
 * header (seen with a Grimaldi ferry ticket: 21 blank bytes before "%PDF").
 * Lenient readers open such files; strict parsers (the AI provider's) reject
 * them. Repair by dropping everything before the header.
 */
export interface SanitizedPdf {
  buffer: Buffer;
  /** True when leading bytes were stripped */
  repaired: boolean;
  strippedBytes: number;
}

const HEADER = Buffer.from('%PDF');
const SEARCH_WINDOW = 1024;

/** Returns the cleaned buffer, or null when no PDF header is found near the start */
export function sanitizePdfBuffer(buf: Buffer): SanitizedPdf | null {
  const offset = buf.subarray(0, SEARCH_WINDOW).indexOf(HEADER);
  if (offset < 0) return null;
  if (offset === 0) return { buffer: buf, repaired: false, strippedBytes: 0 };
  return { buffer: buf.subarray(offset), repaired: true, strippedBytes: offset };
}

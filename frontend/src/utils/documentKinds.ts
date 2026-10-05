/**
 * Receipts for the green-travel extra (hotel invoices, meal receipts). They never
 * become trips, are not sent to the trip-building AI, and don't count towards
 * the per-participant document limit.
 */
export const RECEIPT_DOCUMENT_TYPES = ['HOTEL_INVOICE', 'MEAL_RECEIPT'] as const;
export type ReceiptDocumentType = (typeof RECEIPT_DOCUMENT_TYPES)[number];

export function isReceiptDocumentType(type: string | null | undefined): type is ReceiptDocumentType {
  return !!type && (RECEIPT_DOCUMENT_TYPES as readonly string[]).includes(type);
}

export function isReceiptDocument(doc: { documentType: string }): boolean {
  return isReceiptDocumentType(doc.documentType);
}

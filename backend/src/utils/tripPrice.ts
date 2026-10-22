/**
 * Whether a trip has a price. Keep frontend/src/utils/tripPrice.ts
 * byte-identical (separate package, no shared build).
 *
 * `priceMissing` is the AI's verdict when it built the trips ("no price in the
 * documents"). It stays in the database after someone types a price in, so on
 * its own it must never be shown as "no price".
 */
export interface TripPriceFields {
  priceMissing?: boolean | null;
  amountOriginal?: number | null;
  amountEur?: number | null;
  amountIncludedInRoundTrip?: boolean | null;
  excludedFromReimbursement?: boolean | null;
}

/** The trip is claimed but has no amount (a round-trip return leg is priced on its outbound leg) */
export function tripHasNoPrice(item: TripPriceFields): boolean {
  if (item.amountIncludedInRoundTrip || item.excludedFromReimbursement) return false;
  return item.amountOriginal == null && item.amountEur == null;
}

/** The AI found no price in the documents, and a person typed one in afterwards */
export function tripPriceTypedIn(item: TripPriceFields): boolean {
  return !!item.priceMissing && (item.amountOriginal != null || item.amountEur != null);
}

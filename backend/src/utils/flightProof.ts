/**
 * Proof that a participant actually took a flight: the boarding pass, or a written
 * declaration from the airline (some National Agencies, e.g. Italy, require the latter
 * instead of a declaration on honour when a boarding pass is lost).
 */
export const FLIGHT_PROOF_TYPES = ['FLIGHT_BOARDING_PASS', 'AIRLINE_DECLARATION'] as const;
export type FlightProofType = (typeof FLIGHT_PROOF_TYPES)[number];

export function isFlightProofType(type: string | null | undefined): type is FlightProofType {
  return !!type && (FLIGHT_PROOF_TYPES as readonly string[]).includes(type);
}

export function isFlightProof(doc: { documentType: string }): boolean {
  return isFlightProofType(doc.documentType);
}

/** Ids of every document linked to a trip (main document, additional ones, luggage invoice) */
export function linkedDocumentIds(item: {
  documentId?: string | null;
  additionalDocumentIds?: string | null;
  luggageDocumentId?: string | null;
}): string[] {
  let extra: string[] = [];
  try {
    extra = item.additionalDocumentIds ? (JSON.parse(item.additionalDocumentIds) as string[]) : [];
  } catch {
    extra = [];
  }
  return [item.documentId, ...extra, item.luggageDocumentId].filter((id): id is string => !!id);
}

/**
 * Whether a flight has its proof. Projects that accept a declaration on honour keep the
 * original, lenient rule (any boarding pass in the file counts); projects that require the
 * airline's declaration need a boarding pass or airline declaration on that very flight.
 */
export function flightHasProof(
  item: { documentId?: string | null; additionalDocumentIds?: string | null; luggageDocumentId?: string | null },
  documents: { id: string; documentType: string }[],
  perFlight: boolean
): boolean {
  if (!perFlight) return documents.some(isFlightProof);
  const ids = new Set(linkedDocumentIds(item));
  return documents.some((d) => ids.has(d.id) && isFlightProof(d));
}

/** Whether a declaration on honour may replace a missing boarding pass in this project */
export function flightDeclarationsAccepted(project: { requireAirlineDeclaration?: boolean | null } | null | undefined): boolean {
  return !project?.requireAirlineDeclaration;
}

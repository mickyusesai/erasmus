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

// ---------------------------------------------------------------------------------------------
// A participant's word against the file
// ---------------------------------------------------------------------------------------------

const DOCUMENT_TYPES = new Set([
  'FLIGHT_INVOICE', 'FLIGHT_BOARDING_PASS', 'AIRLINE_DECLARATION', 'TRAIN_TICKET', 'BUS_TICKET', 'FUEL_RECEIPT',
  'GREEN_TRAVEL_DECLARATION', 'HOTEL_INVOICE', 'MEAL_RECEIPT', 'BANK_TRANSACTION', 'LUGGAGE_INVOICE', 'INTERRAIL_PASS', 'OTHER',
]);

/** How sure the AI must be before its reading outweighs what a participant says a file is */
export const SURE_ENOUGH = 0.8;

export interface ReadingLike {
  detectedDocumentType: string;
  confidence: number;
  /** The AI's own answer: it says what the AI thought, also where the participant's word was stored over it */
  rawAiResponse?: string | null;
}

/** What the AI itself read a file as, and how sure it was (null when the file could not be read) */
export function aiReadingOf(extraction: ReadingLike): { type: string; confidence: number } | null {
  const raw = extraction.rawAiResponse ?? '';
  const json = raw.match(/\{[\s\S]*\}/);
  if (json) {
    try {
      const parsed = JSON.parse(json[0]) as { documentType?: unknown; confidence?: unknown };
      const type = typeof parsed.documentType === 'string' ? parsed.documentType.toUpperCase() : null;
      if (type && DOCUMENT_TYPES.has(type)) {
        return { type, confidence: typeof parsed.confidence === 'number' ? parsed.confidence : extraction.confidence };
      }
    } catch {
      // not the AI's JSON (e.g. an error message): fall back to what was stored
    }
  }
  if (extraction.confidence <= 0.1) return null; // a failed reading says nothing
  return { type: extraction.detectedDocumentType, confidence: extraction.confidence };
}

/**
 * The type the AI read a file as when that clearly is not proof of a flight: a booking
 * confirmation, an invoice, a ticket, a bank statement... Null when the AI found a boarding pass
 * or an airline declaration, was not sure, or could not read the file. A participant who says
 * such a file is their boarding pass is mistaken (typically: the invoice uploaded because the
 * boarding pass was asked for), and the file must not count as proof that they flew.
 */
export function readAsNotFlightProof(extraction: ReadingLike | null | undefined): string | null {
  if (!extraction) return null;
  const reading = aiReadingOf(extraction);
  if (!reading || reading.type === 'OTHER' || isFlightProofType(reading.type)) return null;
  return reading.confidence >= SURE_ENOUGH ? reading.type : null;
}

const WHAT_IT_IS: Record<string, string> = {
  FLIGHT_INVOICE: 'the booking confirmation or invoice of a flight',
  TRAIN_TICKET: 'a train ticket',
  BUS_TICKET: 'a bus ticket',
  BANK_TRANSACTION: 'a bank statement or payment',
  LUGGAGE_INVOICE: 'a luggage invoice',
  HOTEL_INVOICE: 'an accommodation invoice',
  MEAL_RECEIPT: 'a receipt',
  FUEL_RECEIPT: 'a fuel receipt',
  INTERRAIL_PASS: 'an Interrail pass',
  GREEN_TRAVEL_DECLARATION: 'a green travel declaration',
};

/** Said to a participant who tries to use such a file as proof of a flight */
export function notFlightProofMessage(filename: string, readAs: string): string {
  return `"${filename}" is ${WHAT_IT_IS[readAs] ?? 'not a boarding pass'}, not proof that you took the flight. Please upload the boarding pass itself (with gate, seat and barcode), or the airline's written confirmation that you flew.`;
}

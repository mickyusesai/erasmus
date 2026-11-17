/**
 * The order of the supporting documents in the audit file: trip by trip in travel order
 * (the numbering of the "Travel Items Breakdown"), each trip's files as they are listed
 * there. A file used by several trips sits with the first one. A boarding pass that isn't
 * linked goes with the flight whose number it carries. Files that belong to no trip come
 * after the trips, and the food and accommodation receipts close the list by receipt date.
 */
import { isFlightProof, linkedDocumentIds } from './flightProof.js';
import { isReceiptDocument } from './documentKinds.js';

interface TripLike {
  documentId?: string | null;
  additionalDocumentIds?: string | null;
  luggageDocumentId?: string | null;
  flightNumber?: string | null;
}

interface DocumentLike {
  id: string;
  documentType: string;
  extraction?: { flightNumber?: string | null; documentDate?: Date | null } | null;
}

export interface OrderedDocument<D> {
  document: D;
  /** The trips that use this file, numbered as in the breakdown (1 = first trip) */
  trips: number[];
}

const flightCode = (value: string | null | undefined) => (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * travelItems: already in travel order (sortTravelItemsByJourney).
 * documents: in the order to fall back on (upload date) for files without a trip.
 */
export function orderDocumentsByJourney<D extends DocumentLike>(travelItems: TripLike[], documents: D[]): OrderedDocument<D>[] {
  const byId = new Map(documents.map((d) => [d.id, d]));
  const tripsOf = new Map<string, number[]>();
  const perTrip: string[][] = travelItems.map(() => []);

  travelItems.forEach((item, index) => {
    for (const id of linkedDocumentIds(item)) {
      if (!byId.has(id) || perTrip[index].includes(id)) continue;
      perTrip[index].push(id);
      tripsOf.set(id, [...(tripsOf.get(id) ?? []), index + 1]);
    }
  });

  // Boarding passes and airline declarations that nobody linked: with the flight they name
  for (const d of documents) {
    if (tripsOf.has(d.id) || !isFlightProof(d)) continue;
    const code = flightCode(d.extraction?.flightNumber);
    if (!code) continue;
    const index = travelItems.findIndex((item) => flightCode(item.flightNumber) === code);
    if (index === -1) continue;
    perTrip[index].push(d.id);
    tripsOf.set(d.id, [index + 1]);
  }

  const ordered: OrderedDocument<D>[] = [];
  const placed = new Set<string>();
  const place = (d: D) => {
    if (placed.has(d.id)) return;
    placed.add(d.id);
    ordered.push({ document: d, trips: tripsOf.get(d.id) ?? [] });
  };

  for (const ids of perTrip) for (const id of ids) place(byId.get(id)!);

  const rest = documents.filter((d) => !placed.has(d.id));
  rest.filter((d) => !isReceiptDocument(d)).forEach(place);
  // Receipts by the date on the receipt; the ones without a date keep their place at the end
  const receiptTime = (d: D) => d.extraction?.documentDate?.getTime() ?? Number.POSITIVE_INFINITY;
  rest
    .filter(isReceiptDocument)
    .map((d, i) => ({ d, i }))
    .sort((a, b) => receiptTime(a.d) - receiptTime(b.d) || a.i - b.i)
    .forEach(({ d }) => place(d));

  return ordered;
}

interface DeclarationLike {
  travelItemId?: string | null;
  travelDate: Date;
  createdAt: Date;
}

/** Declarations of travel in the order of the trips they stand in for */
export function orderDeclarationsByJourney<T extends DeclarationLike>(travelItems: { id: string }[], declarations: T[]): T[] {
  const position = new Map(travelItems.map((item, index) => [item.id, index]));
  const rank = (d: T) => (d.travelItemId != null && position.has(d.travelItemId) ? position.get(d.travelItemId)! : Number.POSITIVE_INFINITY);
  return [...declarations].sort(
    (a, b) => rank(a) - rank(b) || a.travelDate.getTime() - b.travelDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime()
  );
}

import { describe, it, expect } from 'vitest';
import { flightHasProof, linkedDocumentIds, isFlightProofType, flightDeclarationsAccepted } from '../utils/flightProof.js';

const docs = [
  { id: 'invoice', documentType: 'FLIGHT_INVOICE' },
  { id: 'bp-out', documentType: 'FLIGHT_BOARDING_PASS' },
  { id: 'airline', documentType: 'AIRLINE_DECLARATION' },
  { id: 'other', documentType: 'OTHER' },
];
const outbound = { documentId: 'invoice', additionalDocumentIds: JSON.stringify(['bp-out']) };
const ret = { documentId: 'invoice', additionalDocumentIds: null };
const retWithAirline = { documentId: 'invoice', additionalDocumentIds: JSON.stringify(['airline']) };

describe('flight proof', () => {
  it('treats boarding passes and airline declarations as proof, nothing else', () => {
    expect(isFlightProofType('FLIGHT_BOARDING_PASS')).toBe(true);
    expect(isFlightProofType('AIRLINE_DECLARATION')).toBe(true);
    expect(isFlightProofType('FLIGHT_INVOICE')).toBe(false);
    expect(isFlightProofType(undefined)).toBe(false);
  });

  it('keeps the lenient rule when declarations on honour are accepted', () => {
    // any boarding pass in the file covers every flight (unchanged behaviour)
    expect(flightHasProof(ret, docs, false)).toBe(true);
  });

  it('requires proof on the flight itself when the airline declaration is required', () => {
    expect(flightHasProof(outbound, docs, true)).toBe(true);
    expect(flightHasProof(ret, docs, true)).toBe(false);
    expect(flightHasProof(retWithAirline, docs, true)).toBe(true);
  });

  it('reads linked document ids defensively', () => {
    expect(linkedDocumentIds({ documentId: 'a', additionalDocumentIds: '["b","c"]', luggageDocumentId: 'd' })).toEqual(['a', 'b', 'c', 'd']);
    expect(linkedDocumentIds({ documentId: null, additionalDocumentIds: 'not json' })).toEqual([]);
  });

  it('only refuses declarations when the project asks for it', () => {
    expect(flightDeclarationsAccepted({ requireAirlineDeclaration: true })).toBe(false);
    expect(flightDeclarationsAccepted({ requireAirlineDeclaration: false })).toBe(true);
    expect(flightDeclarationsAccepted(null)).toBe(true);
  });
});

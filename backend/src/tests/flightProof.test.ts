import { describe, it, expect } from 'vitest';
import { flightHasProof, linkedDocumentIds, isFlightProofType, flightDeclarationsAccepted, aiReadingOf, readAsNotFlightProof, notFlightProofMessage } from '../utils/flightProof.js';

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

describe('a file called a boarding pass that is not one', () => {
  // As stored for a participant who uploaded the flight's invoice as "the airline's declaration":
  // the participant's word in the column, the AI's own answer in its raw response
  const invoiceAsDeclaration = {
    detectedDocumentType: 'AIRLINE_DECLARATION',
    confidence: 0.97,
    rawAiResponse: '```json\n{"documentType": "FLIGHT_INVOICE", "confidence": 0.97, "fromLocation": "OTP", "toLocation": "ATH"}\n```',
  };

  it('is read as what the AI itself said, not as what was stored over it', () => {
    expect(aiReadingOf(invoiceAsDeclaration)).toEqual({ type: 'FLIGHT_INVOICE', confidence: 0.97 });
    expect(readAsNotFlightProof(invoiceAsDeclaration)).toBe('FLIGHT_INVOICE');
  });

  it('a real boarding pass or airline declaration stays proof', () => {
    expect(readAsNotFlightProof({ detectedDocumentType: 'FLIGHT_BOARDING_PASS', confidence: 0.98, rawAiResponse: '{"documentType":"FLIGHT_BOARDING_PASS","confidence":0.98}' })).toBeNull();
    expect(readAsNotFlightProof({ detectedDocumentType: 'AIRLINE_DECLARATION', confidence: 0.9, rawAiResponse: '{"documentType":"AIRLINE_DECLARATION"}' })).toBeNull();
  });

  it("the participant's word stands when the AI was not sure, found nothing, or could not read the file", () => {
    expect(readAsNotFlightProof({ detectedDocumentType: 'FLIGHT_BOARDING_PASS', confidence: 0.6, rawAiResponse: '{"documentType":"FLIGHT_INVOICE","confidence":0.6}' })).toBeNull();
    expect(readAsNotFlightProof({ detectedDocumentType: 'FLIGHT_BOARDING_PASS', confidence: 0.9, rawAiResponse: '{"documentType":"OTHER","confidence":0.9}' })).toBeNull();
    expect(readAsNotFlightProof({ detectedDocumentType: 'OTHER', confidence: 0.1, rawAiResponse: 'Anthropic API error: overloaded' })).toBeNull();
    expect(readAsNotFlightProof(null)).toBeNull();
  });

  it('an older reading without the raw answer is judged by what was stored', () => {
    expect(readAsNotFlightProof({ detectedDocumentType: 'FLIGHT_INVOICE', confidence: 0.99, rawAiResponse: null })).toBe('FLIGHT_INVOICE');
  });

  it('the participant is told what the file is and what is needed instead', () => {
    const message = notFlightProofMessage('RIGA-BUCHAREST.pdf', 'FLIGHT_INVOICE');
    expect(message).toContain('"RIGA-BUCHAREST.pdf" is the booking confirmation or invoice of a flight, not proof that you took the flight.');
    expect(message).toContain('boarding pass itself');
  });
});

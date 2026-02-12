import Anthropic from '@anthropic-ai/sdk';
import {
  TravelDocumentAiService,
  DocumentAnalysisResult,
  ExtractedTravelItem,
  ReimbursementValidation,
  MissingItem,
  DocumentType,
  TransportMode,
} from './types.js';
import prisma from '../../utils/prisma.js';
import { convertToEur as convertWithInforEuro } from '../exchangeRate/index.js';

/**
 * Claude Vision AI Service for document analysis
 * Uses Anthropic's Claude API with vision capabilities to analyze travel documents
 */
export class ClaudeAiService implements TravelDocumentAiService {
  private client: Anthropic;
  private model: string = 'claude-3-haiku-20240307';

  // Exchange rates (EUR base) - in production, use a real API
  private exchangeRates: Record<string, number> = {
    EUR: 1.0,
    USD: 0.92,
    GBP: 1.17,
    PLN: 0.23,
    CZK: 0.041,
    HUF: 0.0026,
    RON: 0.20,
    BGN: 0.51,
    SEK: 0.088,
    DKK: 0.13,
    NOK: 0.085,
    CHF: 1.05,
  };

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async analyzeDocument(
    fileBuffer: Buffer,
    mimeType: string,
    originalFilename: string
  ): Promise<DocumentAnalysisResult> {
    console.log(`[Claude AI] Analyzing document: ${originalFilename}`);

    // Convert buffer to base64
    const base64Data = fileBuffer.toString('base64');

    // Determine the media type for Claude
    let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';
    if (mimeType.includes('png')) {
      mediaType = 'image/png';
    } else if (mimeType.includes('gif')) {
      mediaType = 'image/gif';
    } else if (mimeType.includes('webp')) {
      mediaType = 'image/webp';
    }

    // For PDFs, we need to handle them differently
    // Claude can process PDFs directly as of recent updates
    const isPdf = mimeType.includes('pdf');

    try {
      const prompt = `You are an expert at analyzing travel documents for Erasmus+ reimbursement purposes.

Analyze this travel document and extract all relevant information. This could be:
- A flight booking confirmation or invoice
- A boarding pass
- A train ticket
- A bus ticket
- A fuel receipt
- A green travel declaration
- A hotel invoice (for green travel participants who need overnight stays)

Please respond with a JSON object (and ONLY a JSON object, no other text) with the following structure:
{
  "documentType": "FLIGHT_INVOICE" | "FLIGHT_BOARDING_PASS" | "TRAIN_TICKET" | "BUS_TICKET" | "FUEL_RECEIPT" | "GREEN_TRAVEL_DECLARATION" | "HOTEL_INVOICE" | "OTHER",
  "confidence": 0.0-1.0,
  "ocrText": "The key text extracted from the document",
  "isRoundTrip": true/false,
  "numberOfPassengers": 1,
  "allPassengerNames": "Name1, Name2, Name3",
  "outboundFlightNumber": "Flight number for outbound journey or null",
  "returnFlightNumber": "Flight number for return journey or null",
  "travelItems": [
    {
      "modeOfTransport": "PLANE" | "TRAIN" | "BUS" | "CAR" | "FERRY" | "OTHER",
      "fromLocation": "City or airport name",
      "toLocation": "City or airport name",
      "departureDate": "YYYY-MM-DD",
      "arrivalDate": "YYYY-MM-DD or null",
      "bookingReference": "Reference code or null",
      "flightNumber": "Flight number or null",
      "amountOriginal": 123.45,
      "currencyOriginal": "EUR",
      "purchaseDate": "YYYY-MM-DD or null"
    }
  ],
  "warnings": ["Any issues or uncertainties about the extraction"]
}

IMPORTANT - Round-trip detection:
- If this is a ROUND-TRIP booking (both outbound AND return in one booking), set isRoundTrip to true
- For round-trips, create ONE item in travelItems with the TOTAL price (do NOT split into two items)
- Set outboundFlightNumber and returnFlightNumber if both are visible
- Add a warning like "Round-trip booking - requires 2 boarding passes for confirmation"

IMPORTANT - Multi-passenger detection:
- Count how many passengers are on this booking
- If more than 1 passenger, list all names in allPassengerNames (comma-separated)
- The amountOriginal in travelItems should be the TOTAL price, NOT per-person
- Add a warning like "Multi-passenger booking: X passengers for total price Y"

Other important notes:
- Extract actual values from the document, don't make them up
- If you can't find a value, use null
- For airports, try to extract the city name (e.g., "Barcelona" not just "BCN")
- The amount should be the total price paid by the traveler
- Currency should be the 3-letter code (EUR, USD, GBP, PLN, CZK, etc.)
- Confidence should reflect how certain you are about the document type and extraction quality
- Add warnings for anything unclear, partially visible, or potentially incorrect`;

      let response;

      if (isPdf) {
        // For PDFs, use the document type with beta header
        console.log('[Claude AI] Processing PDF document...');
        response = await this.client.messages.create(
          {
            model: this.model,
            max_tokens: 2000,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'document',
                    source: {
                      type: 'base64',
                      media_type: 'application/pdf',
                      data: base64Data,
                    },
                  } as unknown as Anthropic.Messages.ContentBlockParam,
                  {
                    type: 'text',
                    text: prompt,
                  },
                ],
              },
            ],
          },
          {
            headers: {
              'anthropic-beta': 'pdfs-2024-09-25',
            },
          }
        );
      } else {
        // For images, use Claude Vision
        response = await this.client.messages.create({
          model: this.model,
          max_tokens: 2000,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: base64Data,
                  },
                },
                {
                  type: 'text',
                  text: prompt,
                },
              ],
            },
          ],
        });
      }

      // Extract the text response
      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      const responseText = textBlock.text;
      console.log(`[Claude AI] Raw response: ${responseText.substring(0, 500)}...`);

      // Parse the JSON response
      // Find JSON in the response (Claude might add some text around it)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not find JSON in Claude response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Map the response to our format
      const documentType = this.mapDocumentType(parsed.documentType);
      const extractedItems: ExtractedTravelItem[] = (parsed.travelItems || []).map(
        (item: Record<string, unknown>) => ({
          modeOfTransport: this.mapTransportMode(item.modeOfTransport as string),
          fromLocation: item.fromLocation || 'Unknown',
          toLocation: item.toLocation || 'Unknown',
          departureDate: item.departureDate ? new Date(item.departureDate as string) : new Date(),
          arrivalDate: item.arrivalDate ? new Date(item.arrivalDate as string) : undefined,
          bookingReference: item.bookingReference || undefined,
          flightNumber: item.flightNumber || undefined,
          amountOriginal: typeof item.amountOriginal === 'number' ? item.amountOriginal : 0,
          currencyOriginal: (item.currencyOriginal as string) || 'EUR',
          purchaseDate: item.purchaseDate ? new Date(item.purchaseDate as string) : undefined,
        })
      );

      const suggestedFilename = this.generateFilename(
        documentType,
        extractedItems[0] || {},
        originalFilename
      );

      console.log(`[Claude AI] Extracted ${extractedItems.length} travel items, type: ${documentType}, isRoundTrip: ${parsed.isRoundTrip}, passengers: ${parsed.numberOfPassengers}`);

      return {
        documentType,
        confidence: parsed.confidence || 0.7,
        ocrText: parsed.ocrText || '',
        suggestedFilename,
        extractedTravelItems: extractedItems,
        warnings: parsed.warnings || [],
        // Round-trip and multi-passenger detection
        isRoundTrip: parsed.isRoundTrip || false,
        numberOfPassengers: parsed.numberOfPassengers || 1,
        allPassengerNames: parsed.allPassengerNames || undefined,
        outboundFlightNumber: parsed.outboundFlightNumber || undefined,
        returnFlightNumber: parsed.returnFlightNumber || undefined,
      };
    } catch (error) {
      console.error('[Claude AI] Error analyzing document:', error);

      // Return a fallback result
      return {
        documentType: DocumentType.OTHER,
        confidence: 0.1,
        ocrText: `Error analyzing document: ${error instanceof Error ? error.message : 'Unknown error'}`,
        suggestedFilename: this.generateFilename(DocumentType.OTHER, {}, originalFilename),
        extractedTravelItems: [],
        warnings: [`Failed to analyze document: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  private mapDocumentType(type: string): DocumentType {
    const mapping: Record<string, DocumentType> = {
      FLIGHT_INVOICE: DocumentType.FLIGHT_INVOICE,
      FLIGHT_BOARDING_PASS: DocumentType.FLIGHT_BOARDING_PASS,
      TRAIN_TICKET: DocumentType.TRAIN_TICKET,
      BUS_TICKET: DocumentType.BUS_TICKET,
      FUEL_RECEIPT: DocumentType.FUEL_RECEIPT,
      GREEN_TRAVEL_DECLARATION: DocumentType.GREEN_TRAVEL_DECLARATION,
      HOTEL_INVOICE: DocumentType.HOTEL_INVOICE,
      OTHER: DocumentType.OTHER,
    };
    return mapping[type] || DocumentType.OTHER;
  }

  private mapTransportMode(mode: string): TransportMode {
    const mapping: Record<string, TransportMode> = {
      PLANE: TransportMode.PLANE,
      TRAIN: TransportMode.TRAIN,
      BUS: TransportMode.BUS,
      CAR: TransportMode.CAR,
      FERRY: TransportMode.FERRY,
      OTHER: TransportMode.OTHER,
    };
    return mapping[mode] || TransportMode.OTHER;
  }

  generateFilename(
    documentType: DocumentType,
    extractedData: Partial<ExtractedTravelItem>,
    originalFilename: string
  ): string {
    const date = extractedData.departureDate
      ? new Date(extractedData.departureDate).toISOString().split('T')[0].replace(/-/g, ' ')
      : new Date().toISOString().split('T')[0].replace(/-/g, ' ');

    const from = extractedData.fromLocation || 'Origin';
    const to = extractedData.toLocation || 'Destination';

    const typeLabels: Record<DocumentType, string> = {
      FLIGHT_INVOICE: 'flight invoice',
      FLIGHT_BOARDING_PASS: 'boarding pass',
      TRAIN_TICKET: 'train ticket',
      BUS_TICKET: 'bus ticket',
      FUEL_RECEIPT: 'fuel receipt',
      GREEN_TRAVEL_DECLARATION: 'green travel declaration',
      HOTEL_INVOICE: 'hotel invoice',
      BANK_TRANSACTION: 'bank transaction',
      OTHER: 'document',
    };

    const extension = originalFilename.split('.').pop() || 'pdf';
    const typeLabel = typeLabels[documentType];

    return `${date} ${from} ${to} ${typeLabel}.${extension}`;
  }

  async validateReimbursement(participantId: string): Promise<ReimbursementValidation> {
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: {
        documents: true,
        travelItems: true,
        declarationsOnHonor: true,
      },
    });

    if (!participant) {
      return {
        isComplete: false,
        missingItems: [{ type: 'data', description: 'Participant not found' }],
        warnings: [],
        aiCheckPassed: false,
      };
    }

    const missingItems: MissingItem[] = [];
    const warnings: string[] = [];

    // Check for bank details
    if (!participant.bankAccountIban) {
      missingItems.push({
        type: 'field',
        description: 'Bank account IBAN is required',
      });
    }

    if (!participant.bankAccountHolderName) {
      missingItems.push({
        type: 'field',
        description: 'Bank account holder name is required',
      });
    }

    // Check travel items have required data
    for (const item of participant.travelItems) {
      if (!item.fromLocation || !item.toLocation) {
        missingItems.push({
          type: 'data',
          description: `Travel item missing locations`,
          travelItemId: item.id,
        });
      }

      if (!item.departureDate) {
        missingItems.push({
          type: 'data',
          description: `Travel item missing departure date`,
          travelItemId: item.id,
        });
      }

      if (item.amountOriginal === null || item.amountOriginal === undefined) {
        missingItems.push({
          type: 'data',
          description: `Travel item missing amount`,
          travelItemId: item.id,
        });
      }

      // Check for boarding pass if flight
      if (item.modeOfTransport === TransportMode.PLANE) {
        const hasBoardingPass = participant.documents.some(
          (doc: { documentType: string }) => doc.documentType === DocumentType.FLIGHT_BOARDING_PASS
        );
        const hasDeclaration = participant.declarationsOnHonor.some(
          (dec: { missingDocumentType: string }) => dec.missingDocumentType === DocumentType.FLIGHT_BOARDING_PASS
        );

        if (!hasBoardingPass && !hasDeclaration) {
          missingItems.push({
            type: 'document',
            description: 'Boarding pass or declaration on honor required for flight',
            documentType: DocumentType.FLIGHT_BOARDING_PASS,
          });
        }
      }

      // Check for invoice/ticket for flights
      if (item.modeOfTransport === TransportMode.PLANE) {
        const hasInvoice = participant.documents.some(
          (doc: { documentType: string }) => doc.documentType === DocumentType.FLIGHT_INVOICE
        );
        if (!hasInvoice) {
          missingItems.push({
            type: 'document',
            description: 'Flight invoice or booking confirmation required',
            documentType: DocumentType.FLIGHT_INVOICE,
          });
        }
      }

      // Check non-EUR currency has purchase date
      if (item.currencyOriginal !== 'EUR' && !item.purchaseDate) {
        warnings.push(
          `Travel item with ${item.currencyOriginal} currency is missing purchase date for exchange rate`
        );
      }
    }

    // Check if at least one travel item exists
    if (participant.travelItems.length === 0) {
      missingItems.push({
        type: 'data',
        description: 'At least one travel item is required',
      });
    }

    // Check if at least one document exists
    if (participant.documents.length === 0) {
      missingItems.push({
        type: 'document',
        description: 'At least one travel document is required',
      });
    }

    const isComplete = missingItems.length === 0;
    const aiCheckPassed = isComplete && warnings.length === 0;

    return {
      isComplete,
      missingItems,
      warnings,
      aiCheckPassed,
    };
  }

  async recalculateParticipantSummary(participantId: string): Promise<void> {
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: {
        travelItems: true,
        project: {
          include: {
            countryLimits: true,
          },
        },
      },
    });

    if (!participant) {
      throw new Error('Participant not found');
    }

    // Calculate total EUR (only count items with known amounts, exclude items marked as excluded)
    let totalEur = 0;
    for (const item of participant.travelItems) {
      if (!item.excludedFromReimbursement && item.amountEur !== null) {
        totalEur += item.amountEur;
      }
    }

    // Get max reimbursement for participant's country
    const countryLimit = participant.project.countryLimits.find(
      (limit: { country: string; maxReimbursementAmount: number }) => limit.country === participant.country
    );
    const maxReimbursementAllowed = countryLimit?.maxReimbursementAmount || 0;

    // Calculate amount to reimburse (capped at max)
    const amountToReimburse = Math.min(totalEur, maxReimbursementAllowed);

    // Validate
    const validation = await this.validateReimbursement(participantId);

    // Upsert reimbursement summary
    await prisma.reimbursementSummary.upsert({
      where: { participantId },
      create: {
        participantId,
        totalEur,
        maxReimbursementAllowed,
        amountToReimburse,
        aiCheckOk: validation.aiCheckPassed,
      },
      update: {
        totalEur,
        maxReimbursementAllowed,
        amountToReimburse,
        aiCheckOk: validation.aiCheckPassed,
      },
    });
  }

  async convertToEur(
    amount: number,
    currency: string,
    purchaseDate?: Date
  ): Promise<number> {
    // Use InforEuro service for official EC exchange rates
    try {
      return await convertWithInforEuro(amount, currency, purchaseDate);
    } catch (error) {
      console.error('[Claude AI] Error using InforEuro, falling back to hardcoded rates:', error);

      // Fallback to hardcoded rates if InforEuro fails
      const rate = this.exchangeRates[currency.toUpperCase()];
      if (!rate) {
        console.warn(`[Claude AI] Unknown currency: ${currency}, using 1:1 rate`);
        return amount;
      }

      return Math.round(amount * rate * 100) / 100;
    }
  }
}

export interface ReviewFinding {
  severity: 'critical' | 'important' | 'info';
  message: string;
  category: string;
}

/**
 * Generate a comprehensive AI review of a participant's reimbursement data.
 * Examines travel items, documents, declarations, changelog, and financial data
 * to produce an actionable checklist for the organisation.
 */
export async function generateParticipantReview(data: {
  participantName: string;
  participantCountry: string;
  detectedHomeCountry: string | null;
  homeCountryConfidence: number | null;
  participantNote: string | null;
  projectCountry: string;
  projectStartDate: string;
  projectEndDate: string;
  maxReimbursementForCountry: number;
  travelItems: Array<{
    id: string;
    modeOfTransport: string;
    fromLocation: string | null;
    toLocation: string | null;
    departureDate: string | null;
    flightNumber: string | null;
    bookingReference: string | null;
    amountOriginal: number | null;
    currencyOriginal: string | null;
    amountEur: number | null;
    purchaseDate: string | null;
    manuallyEdited: boolean;
    originalAmountFromAi: number | null;
    checked: boolean;
    priceMissing: boolean;
    routeMatchesCountry: boolean | null;
    excludedFromReimbursement: boolean;
    numberOfPassengers: number | null;
    participantPortion: number | null;
    distanceKm: number | null;
    validationWarnings: string | null;
    documentId: string | null;
    amountIncludedInRoundTrip: boolean;
    comment: string | null;
  }>;
  documents: Array<{
    id: string;
    documentType: string;
    originalFilename: string;
    extraction?: {
      confidence: number;
      detectedDocumentType: string;
      passengerName: string | null;
      amount: number | null;
      currency: string | null;
    } | null;
  }>;
  declarationsOnHonor: Array<{
    missingDocumentType: string;
    description: string;
    reason: string;
  }>;
  declarationsOfTravel: Array<{
    fromPlace: string;
    toPlace: string;
    travelDate: string | null;
    flightNumber: string | null;
    modeOfTransport: string;
  }>;
  changeLogEntries: Array<{
    userType: string;
    fieldName: string;
    previousValue: string | null;
    newValue: string | null;
  }>;
  reimbursementSummary: {
    totalEur: number | null;
    maxReimbursementAllowed: number | null;
    amountToReimburse: number | null;
  } | null;
  bankDetailsComplete: boolean;
}): Promise<ReviewFinding[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return [{ severity: 'info', message: 'AI review unavailable (API key not configured).', category: 'System' }];
  }

  const client = new Anthropic({ apiKey });

  const prompt = `You are an AI reviewer for an Erasmus+ travel reimbursement system. Your job is to review a participant's complete reimbursement data and produce a checklist of findings for the organisation administrator.

PARTICIPANT: "${data.participantName}" from ${data.participantCountry}
PROJECT: In ${data.projectCountry}, from ${data.projectStartDate} to ${data.projectEndDate}
${data.detectedHomeCountry ? `AI-DETECTED HOME COUNTRY: ${data.detectedHomeCountry} (confidence: ${data.homeCountryConfidence})` : ''}
${data.participantNote ? `PARTICIPANT NOTE: "${data.participantNote}"` : ''}
MAX REIMBURSEMENT FOR COUNTRY: €${data.maxReimbursementForCountry || 'Not set'}
TOTAL REIMBURSEMENT: €${data.reimbursementSummary?.totalEur || 0}
BANK DETAILS COMPLETE: ${data.bankDetailsComplete ? 'Yes' : 'No'}

TRAVEL ITEMS (${data.travelItems.length}):
${data.travelItems.map((item, i) => `  ${i + 1}. [${item.modeOfTransport}] ${item.fromLocation || '?'} → ${item.toLocation || '?'} on ${item.departureDate || '?'}
     Amount: €${item.amountEur ?? 'MISSING'}${item.manuallyEdited ? ` (MANUALLY CHANGED from AI-detected €${item.originalAmountFromAi})` : ''}
     ${item.priceMissing ? 'PRICE MISSING' : ''}${item.documentId ? '' : 'NO DOCUMENT LINKED'}
     ${item.flightNumber ? `Flight: ${item.flightNumber}` : item.modeOfTransport === 'PLANE' ? 'FLIGHT NUMBER MISSING' : ''}
     ${item.numberOfPassengers && item.numberOfPassengers > 1 ? `Multi-passenger booking (${item.numberOfPassengers} passengers, portion: ${item.participantPortion})` : ''}
     ${item.routeMatchesCountry === false ? 'ROUTE DOES NOT MATCH COUNTRY' : ''}
     ${item.excludedFromReimbursement ? 'EXCLUDED FROM REIMBURSEMENT' : ''}
     ${item.amountIncludedInRoundTrip ? 'Price included in round-trip outbound leg' : ''}
     ${item.distanceKm ? `Distance: ${item.distanceKm}km` : ''}
     ${item.currencyOriginal && item.currencyOriginal !== 'EUR' && !item.purchaseDate ? 'NON-EUR CURRENCY WITHOUT PURCHASE DATE' : ''}
     ${item.validationWarnings && item.validationWarnings !== '[]' ? `Warnings: ${item.validationWarnings}` : ''}
     ${item.comment ? `Comment: "${item.comment}"` : ''}`).join('\n')}

DOCUMENTS (${data.documents.length}):
${data.documents.map((doc, i) => `  ${i + 1}. [${doc.documentType}] ${doc.originalFilename}${doc.extraction ? ` (confidence: ${doc.extraction.confidence}, detected as: ${doc.extraction.detectedDocumentType})` : ''}`).join('\n')}

DECLARATIONS ON HONOR (${data.declarationsOnHonor.length}):
${data.declarationsOnHonor.map((d) => `  - Missing ${d.missingDocumentType}: "${d.description}" (Reason: ${d.reason})`).join('\n') || '  None'}

DECLARATIONS OF TRAVEL - MISSING BOARDING PASSES (${data.declarationsOfTravel.length}):
${data.declarationsOfTravel.map((d) => `  - ${d.modeOfTransport} ${d.fromPlace} → ${d.toPlace} on ${d.travelDate || '?'}${d.flightNumber ? ` (${d.flightNumber})` : ''}`).join('\n') || '  None'}

CHANGELOG (participant/admin edits, ${data.changeLogEntries.length} entries):
${data.changeLogEntries.slice(0, 30).map((e) => `  [${e.userType}] ${e.fieldName}: "${e.previousValue || '(empty)'}" → "${e.newValue || '(empty)'}"`).join('\n') || '  None'}

---

CHECK EACH OF THESE AND ONLY REPORT FINDINGS THAT ACTUALLY APPLY:

CRITICAL (organisation must verify):
1. Declaration of Travel created (missing boarding pass replaced by signed declaration) — org must verify legitimacy
2. Declaration on Honor created (missing document with sworn statement) — org must verify the claim
3. Participant manually changed a ticket amount from what the AI detected — possible cost inflation
4. Price missing on a travel item — cannot reimburse without verified amount
5. Travel item has no linked document — no proof of travel

IMPORTANT (should review):
6. Route doesn't match participant's home country — journey might not be to/from the project
7. AI-detected home country differs from participant's stated country — wrong country = wrong limit
8. Low confidence document extraction (< 0.7) — AI wasn't sure, data might be wrong
9. Multi-passenger booking — verify the participant's claimed portion is fair
10. Total reimbursement exceeds country limit — will be capped
11. Participant changed locations, dates, or other key fields in the changelog
12. Flight number missing for a plane travel item

INFORMATIONAL (good to know):
13. Non-EUR currency without purchase date — exchange rate can't be accurately calculated
14. Travel dates significantly outside project window (more than 2 days before/after)
15. Bank details incomplete
16. Documents uploaded but not linked to any travel item
17. Round-trip price allocation — make sure total is counted only once
18. Participant left a note explaining something
19. Unusual ratio of documents to travel items
20. Car travel — check if claimed distance seems reasonable for the route

RESPOND WITH A JSON ARRAY of findings. Each finding has:
- "severity": "critical" | "important" | "info"
- "message": A clear, short sentence (max 15 words) describing the finding
- "category": A 2-3 word category label (e.g., "Missing Document", "Price Change", "Declaration")

RULES:
- ONLY include findings that actually apply to this participant's data
- If everything looks good for a check, do NOT include it
- If there are no findings at all, return: [{"severity":"info","message":"All checks passed — reimbursement data looks complete and consistent.","category":"All Clear"}]
- Be specific: mention routes, amounts, document names when relevant
- Keep messages short and actionable
- Maximum 10 findings (prioritize by severity)
- Return ONLY the JSON array, nothing else`;

  try {
    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]';

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [{ severity: 'info', message: 'Unable to parse AI review response.', category: 'System' }];
    }

    const findings: ReviewFinding[] = JSON.parse(jsonMatch[0]);
    return findings.filter(
      (f) => f.severity && f.message && f.category
    );
  } catch (error) {
    console.error('[AI] Failed to generate participant review:', error);
    return [{ severity: 'info', message: 'Unable to generate review at this time.', category: 'System' }];
  }
}

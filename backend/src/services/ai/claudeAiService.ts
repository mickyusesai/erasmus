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
      LUGGAGE_INVOICE: 'luggage invoice',
      INTERRAIL_PASS: 'interrail pass',
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
        declarationsOfTravel: true,
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

    // If participant opted out of reimbursement, skip all validation
    if (participant.noReimbursement) {
      return {
        isComplete: true,
        missingItems: [],
        warnings: [],
        aiCheckPassed: true,
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
        const hasDeclarationOnHonor = participant.declarationsOnHonor.some(
          (dec: { missingDocumentType: string }) => dec.missingDocumentType === DocumentType.FLIGHT_BOARDING_PASS
        );
        const hasDeclarationOfTravel = participant.declarationsOfTravel.some(
          (dec: { travelItemId: string | null }) => dec.travelItemId === item.id
        );

        if (!hasBoardingPass && !hasDeclarationOnHonor && !hasDeclarationOfTravel) {
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
        if (item.luggageAmountEur !== null && item.luggageAmountEur !== undefined) {
          totalEur += item.luggageAmountEur;
        }
      }
    }

    // Get max reimbursement for participant's country
    const countryLimit = participant.project.countryLimits.find(
      (limit: { country: string; maxReimbursementAmount: number }) => limit.country === participant.country
    );
    const maxReimbursementAllowed = countryLimit?.maxReimbursementAmount || 0;

    // If any travel item is a multi-person booking, do not apply the per-person cap
    const hasMultiPersonBooking = participant.travelItems.some(
      (item) => item.numberOfPassengers !== null && item.numberOfPassengers > 1
    );

    // Calculate amount to reimburse (capped at max, or 100% if no max is configured or multi-person)
    const amountToReimburse = (maxReimbursementAllowed > 0 && !hasMultiPersonBooking)
      ? Math.min(totalEur, maxReimbursementAllowed)
      : totalEur;

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
  travelItemIndex?: number | null;  // 1-based index into travel items array (null = general finding)
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
  consolidationSummary: string | null;
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
    luggageAmount: number | null;
    luggageAmountEur: number | null;
    purchaseDateAutoFilled: boolean;
    comment: string | null;
    consolidationNotes: string | null;
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
}): Promise<(ReviewFinding & { travelItemId?: string | null })[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return [{ severity: 'info', message: 'AI review unavailable (API key not configured).', category: 'System' }];
  }

  const client = new Anthropic({ apiKey, maxRetries: 6 });

  // Build rules section from configurable rules
  const { buildRulesPrompt } = await import('./reviewRules.js');
  const rulesSection = buildRulesPrompt({
    participantCountry: data.participantCountry,
    projectCountry: data.projectCountry,
  });

  const prompt = `You are an AI reviewer for an Erasmus+ travel reimbursement system. You review a participant's complete data and produce an actionable checklist for the organisation administrator.

=== CONTEXT (read carefully) ===

PARTICIPANT'S HOME COUNTRY: ${data.participantCountry} (this is where they live and travel FROM)
${data.detectedHomeCountry ? `AI-DETECTED HOME COUNTRY: ${data.detectedHomeCountry} (confidence: ${(data.homeCountryConfidence! * 100).toFixed(0)}%)` : ''}
PARTICIPANT NAME: ${data.participantName}
PROJECT DESTINATION COUNTRY: ${data.projectCountry} (this is where the Erasmus+ project takes place, where participants travel TO)
PROJECT DATES: ${data.projectStartDate} to ${data.projectEndDate}
${data.participantNote ? `PARTICIPANT'S OWN NOTE: "${data.participantNote}"` : ''}
${data.consolidationSummary ? `\n=== CONSOLIDATION AI NOTES ===\nThe AI that processed the uploaded documents left these notes for you:\n${data.consolidationSummary}\n` : ''}
BANK DETAILS COMPLETE: ${data.bankDetailsComplete ? 'Yes' : 'No'}

The typical journey pattern is: participant travels FROM their home country (${data.participantCountry}) TO the project country (${data.projectCountry}), attends the project, then travels back home.

=== TRAVEL ITEMS (${data.travelItems.length}) ===
${data.travelItems.map((item, i) => {
    const flags = [];
    if (item.manuallyEdited) flags.push(`AMOUNT MANUALLY CHANGED by participant: AI detected €${item.originalAmountFromAi}, participant set €${item.amountEur}`);
    if (item.priceMissing) flags.push('PRICE IS MISSING');
    if (!item.documentId) flags.push('NO SUPPORTING DOCUMENT LINKED');
    if (item.modeOfTransport === 'PLANE' && !item.flightNumber) flags.push('FLIGHT NUMBER NOT FILLED IN');
    if (item.numberOfPassengers && item.numberOfPassengers > 1) flags.push(`MULTI-PERSON BOOKING: ${item.numberOfPassengers} passengers on this booking (full amount claimed by this participant)`);
    if (item.routeMatchesCountry === false) flags.push('ROUTE MAY NOT MATCH expected home↔project travel pattern');
    if (item.excludedFromReimbursement) flags.push('Participant excluded this from reimbursement');
    if (item.amountIncludedInRoundTrip) flags.push('Price already counted in outbound round-trip leg');
    if (item.luggageAmount) flags.push(`LUGGAGE FEE of €${item.luggageAmountEur || item.luggageAmount} was added from separate luggage invoice`);
    if (item.purchaseDateAutoFilled) flags.push('Purchase date was AUTO-FILLED from flight date (no purchase date found in documents)');
    if (item.distanceKm) flags.push(`Car distance: ${item.distanceKm}km`);
    return `${i + 1}. [${item.modeOfTransport}] ${item.fromLocation || '?'} → ${item.toLocation || '?'} | Date: ${item.departureDate || '?'}${item.purchaseDate ? ` | Purchase: ${item.purchaseDate}` : ''} | €${item.amountEur ?? 'MISSING'} (${item.currencyOriginal || 'EUR'})${item.flightNumber ? ` | Flight: ${item.flightNumber}` : ''}${item.bookingReference ? ` | Booking: ${item.bookingReference}` : ''}${flags.length > 0 ? '\n     ⚠ ' + flags.join('\n     ⚠ ') : ''}`;
  }).join('\n')}

=== DOCUMENTS (${data.documents.length}) ===
${data.documents.map((doc, i) => `${i + 1}. [${doc.documentType}] "${doc.originalFilename}"${doc.extraction ? ` — AI confidence: ${(doc.extraction.confidence * 100).toFixed(0)}%${doc.extraction.passengerName ? `, passenger: ${doc.extraction.passengerName}` : ''}` : ''}`).join('\n')}

=== DECLARATIONS OF TRAVEL (${data.declarationsOfTravel.length}) ===
These are SIGNED declarations the participant created to REPLACE missing boarding passes. Each one is a PDF with their signature. The organisation MUST manually verify each declaration is correct (check route, date, flight number match the travel item).
${data.declarationsOfTravel.map((d) => `- ${d.modeOfTransport}: ${d.fromPlace} → ${d.toPlace} on ${d.travelDate || '?'}${d.flightNumber ? ` (flight ${d.flightNumber})` : ''}`).join('\n') || 'None'}

=== DECLARATIONS ON HONOR (${data.declarationsOnHonor.length}) ===
These are sworn statements for other missing documents. The organisation should verify these claims.
${data.declarationsOnHonor.map((d) => `- Missing ${d.missingDocumentType}: "${d.description}" — Reason: "${d.reason}"`).join('\n') || 'None'}

=== CHANGELOG — MANUAL EDITS (${data.changeLogEntries.length} entries) ===
${data.changeLogEntries.slice(0, 30).map((e) => `[${e.userType}] ${e.fieldName}: "${e.previousValue || '(empty)'}" → "${e.newValue || '(empty)'}"`).join('\n') || 'No edits recorded'}

=== YOUR TASK ===

Review ALL the data above and report ONLY findings that actually apply. Go through these checks:

${rulesSection}
=== RESPONSE FORMAT ===

Return a JSON array. Each finding:
- "severity": "critical" | "important" | "info"
- "message": Clear, specific sentence (max 20 words). Mention routes, amounts, flight numbers when relevant.
- "category": Accurate 2-3 word label. Examples: "Declaration Check", "Amount Changed", "Flight Edit", "Missing Price", "No Document", "Route Mismatch", "Shared Booking", "Participant Note", "Bank Details", "Car Distance"
- "travelItemIndex": The 1-based index number of the travel item this finding relates to (from the TRAVEL ITEMS list above), or null if the finding is general / not about a specific travel item.

IMPORTANT RULES:
- ACTIONABILITY TEST (apply this to every potential finding before including it): Ask yourself "What specific action must the organisation take, and do I have concrete evidence of a real problem?" If your only answer is "check" or "verify" with no actual evidence of wrongdoing, do NOT include it.
- ONLY report PROBLEMS or things that need attention. NEVER report things that are fine/correct/matching/within limits.
- Do NOT create findings saying "X is correct" or "X matches" or "X is within limits". The organisation only wants to see issues, not confirmations.
- Examples of what NOT to report: "Home country matches", "Route matches expected pattern", "Bank details complete", "Total within limit", "Travel dates within range", "Document count matches", "Round-trip price counted correctly"
- Use ACCURATE categories — a flight number edit is "Flight Edit", NOT "Price Change"
- Be PRECISE with numbers — 72% is NOT below 70%. Only flag confidence below 70% if it's actually below 70%.
- Do NOT confuse the participant's home country (${data.participantCountry}) with the project country (${data.projectCountry})
- Declaration of Travel = the replacement document EXISTS and needs checking, NOT that something is missing
- NEVER flag bank detail fields (IBAN, BIC, holder name, bank name, address) as manual edits — participants always fill these in themselves
- NEVER create any finding about bank details being entered, cleared, or changed in the changelog — this is always expected participant behavior. This includes findings framed as "verify IBAN is correct" or "confirm bank details" where the ONLY source of concern is changelog activity — changelog evidence alone is NOT a valid reason to flag bank details.
- NEVER create a "Participant Note" finding unless the PARTICIPANT'S OWN NOTE field above actually contains text
- For route matching, use geographic knowledge: match cities to their countries (Chisinau=Moldova, Skopje=North Macedonia, Amsterdam/Eindhoven=Netherlands, etc.)
- numberOfPassengers=1 means ONE person, which is normal. Only flag shared bookings when numberOfPassengers is GREATER than 1.
- The no-document-linked rule ONLY applies to travel items that exist in the TRAVEL ITEMS list. Never apply it to journey legs that are not in the list.
- Do NOT flag name variations that are transliterations of the same name (e.g., Olexandr vs Oleksandr) — these are the same person.
- For round-trip return legs (amountIncludedInRoundTrip=true), NEVER create any finding — a €0 price on the return leg is correct expected behavior.
- For luggage fees, create exactly ONE informational finding. Do NOT create additional "Amount Check", "Invoice Check", or similar findings about the same booking amounts.
- Do NOT flag document type misclassifications (e.g., a bus ticket stored as TRAIN_TICKET) — the type is assigned during upload and cannot be changed by the organisation, making this unactionable.
- If everything is fine, pick ONE of these messages at random (vary your choice for each participant — never pick the same one twice in a row): "Everything looks perfect! Nothing to review here — go grab a coffee!", "Flawless submission! All documents check out. Time for a well-deserved break!", "All clear! This participant has their travel docs in perfect order. Gold star!", "Spotless! Every document, route, and amount checks out. Enjoy the free time!", "Nothing to flag here — this reimbursement is as clean as it gets!", "A+ submission! All checks passed with flying colors. You can skip to the next one!", "Zero issues found. This participant deserves an award for organisation!", "Everything matches perfectly. We checked twice — still perfect!". Return it as: [{"severity":"info","message":"<your chosen message>","category":"All Clear"}]
- Maximum 12 findings, prioritize critical > important > info
- travelItemIndex MUST be a valid 1-based index from the TRAVEL ITEMS list, or null. Do NOT guess.
- Return ONLY the JSON array`;

  try {
    const response = await (client.messages.create as Function)({
      model: 'claude-sonnet-4-6',
      max_tokens: 10000,
      thinking: { type: 'enabled', budget_tokens: 8000 },
      messages: [{ role: 'user', content: prompt }],
    });

    // Extended thinking returns multiple content blocks; find the text block for JSON
    const textBlock = (response.content as Array<{ type: string; text?: string }>).find(
      (b) => b.type === 'text',
    );
    const text = textBlock?.text?.trim() ?? '[]';

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [{ severity: 'info', message: 'Unable to parse AI review response.', category: 'System' }];
    }

    const rawFindings: Array<ReviewFinding & { travelItemIndex?: number | null }> = JSON.parse(jsonMatch[0]);
    // Map travelItemIndex (1-based) to travelItemId, then strip the index
    const findings: (ReviewFinding & { travelItemId?: string | null })[] = rawFindings
      .filter((f) => f.severity && f.message && f.category)
      .map((f) => {
        let travelItemId: string | null = null;
        if (f.travelItemIndex != null && f.travelItemIndex >= 1 && f.travelItemIndex <= data.travelItems.length) {
          travelItemId = data.travelItems[f.travelItemIndex - 1].id;
        }
        return {
          severity: f.severity,
          message: f.message,
          category: f.category,
          travelItemId,
        };
      })
      // "No Document" findings must reference a real travel item — never an inferred/missing leg
      .filter((f) => !(f.category === 'No Document' && f.travelItemId === null))
      // "Low Confidence" findings must only appear when a document actually has confidence < 0.70
      .filter((f) => {
        if (f.category !== 'Low Confidence') return true;
        // Extract all percentages from the message and verify at least one is genuinely < 70
        const pcts = [...f.message.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => parseFloat(m[1]));
        return pcts.length === 0 || pcts.some((p) => p < 70);
      });
    return findings;
  } catch (error) {
    console.error('[AI Review] Failed to generate participant review:', error);
    return [{ severity: 'info', message: 'Unable to generate review at this time.', category: 'System' }];
  }
}

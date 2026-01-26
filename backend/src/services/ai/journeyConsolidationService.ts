import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import prisma from '../../utils/prisma.js';
import { DocumentType, TransportMode } from './types.js';

// Maximum image size for Claude API (5MB)
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/**
 * Journey Consolidation Service
 *
 * This AI agent looks at ALL documents uploaded by a participant together
 * and builds a coherent travel journey. It understands context like:
 * - Boarding pass dates are departure dates, not purchase dates
 * - Booking confirmation dates might be purchase dates
 * - Flight invoices and boarding passes should be linked by booking reference
 * - The full journey story: home → event location → home
 */
export class JourneyConsolidationService {
  private client: Anthropic;
  private model: string = 'claude-sonnet-4-20250514'; // Use Sonnet for all - more capable

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Resize image if it exceeds the maximum size
   */
  private async resizeImageIfNeeded(buffer: Buffer, mimeType: string): Promise<Buffer> {
    if (buffer.length <= MAX_IMAGE_SIZE) {
      return buffer;
    }

    console.log(`[Consolidation] Resizing image from ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);

    // Calculate quality reduction needed
    const targetSize = MAX_IMAGE_SIZE * 0.9; // Aim for 90% of max to be safe
    let quality = Math.floor((targetSize / buffer.length) * 100);
    quality = Math.max(30, Math.min(quality, 80)); // Keep quality between 30-80

    let resized: Buffer;

    if (mimeType.includes('png')) {
      // Convert PNG to JPEG for better compression
      resized = await sharp(buffer)
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
    } else {
      resized = await sharp(buffer)
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
    }

    console.log(`[Consolidation] Resized to ${(resized.length / 1024 / 1024).toFixed(2)}MB`);
    return resized;
  }

  /**
   * Extract and store raw data from a single document
   * This is called during upload - we store the extraction but don't create travel items yet
   */
  async extractAndStoreDocumentData(
    documentId: string,
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<void> {
    console.log(`[Consolidation] Extracting data from document ${documentId}`);

    const isPdf = mimeType.includes('pdf');
    let base64Data: string;
    let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';

    if (!isPdf) {
      // Resize image if needed
      const processedBuffer = await this.resizeImageIfNeeded(fileBuffer, mimeType);
      base64Data = processedBuffer.toString('base64');
      // After resize, it's always JPEG
      if (fileBuffer.length > MAX_IMAGE_SIZE) {
        mediaType = 'image/jpeg';
      } else {
        if (mimeType.includes('png')) mediaType = 'image/png';
        else if (mimeType.includes('gif')) mediaType = 'image/gif';
        else if (mimeType.includes('webp')) mediaType = 'image/webp';
      }
    } else {
      base64Data = fileBuffer.toString('base64');
    }

    const prompt = `You are analyzing a travel document for Erasmus+ reimbursement.

IMPORTANT DATE CONTEXT:
- If this is a BOARDING PASS: The date shown is the DEPARTURE/FLIGHT date (when the person actually flew)
- If this is a FLIGHT INVOICE or BOOKING CONFIRMATION: There may be TWO dates:
  * The PURCHASE DATE (when the ticket was bought) - often shown as "booking date", "purchase date", "invoice date"
  * The DEPARTURE DATE (when the flight occurs) - shown as "flight date", "departure", or in the itinerary
- If this is a TRAIN or BUS TICKET: The date is typically the TRAVEL date

Extract ALL information you can find. Respond with ONLY a JSON object:
{
  "documentType": "FLIGHT_INVOICE" | "FLIGHT_BOARDING_PASS" | "TRAIN_TICKET" | "BUS_TICKET" | "FUEL_RECEIPT" | "GREEN_TRAVEL_DECLARATION" | "OTHER",
  "confidence": 0.0-1.0,
  "passengerName": "Full name of passenger or null",
  "fromLocation": "Origin city/airport or null",
  "toLocation": "Destination city/airport or null",
  "departureDate": "YYYY-MM-DD (the actual travel date) or null",
  "purchaseDate": "YYYY-MM-DD (when ticket was bought, if visible) or null",
  "documentDate": "YYYY-MM-DD (any other date on document) or null",
  "flightNumber": "e.g., KL1234 or null",
  "airline": "e.g., KLM or null",
  "bookingReference": "PNR/confirmation code or null",
  "seatNumber": "e.g., 14A or null",
  "trainNumber": "Train number or null",
  "busCompany": "Bus company name or null",
  "amount": 123.45 (numeric, total price) or null,
  "currency": "EUR/USD/GBP/PLN etc. or null"
}

Extract real values only - use null if not visible. For cities, prefer full names over airport codes.`;

    try {
      let response;

      if (isPdf) {
        // PDFs require beta header
        console.log('[Consolidation] Using Sonnet for PDF document');
        response = await this.client.messages.create(
          {
            model: this.model,
            max_tokens: 1500,
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
                  { type: 'text', text: prompt },
                ],
              },
            ],
          },
          { headers: { 'anthropic-beta': 'pdfs-2024-09-25' } }
        );
      } else {
        // Use Sonnet for images too - more accurate extraction
        console.log('[Consolidation] Using Sonnet for image document');
        response = await this.client.messages.create({
          model: this.model,
          max_tokens: 1500,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: mediaType, data: base64Data },
                },
                { type: 'text', text: prompt },
              ],
            },
          ],
        });
      }

      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not parse JSON from response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Store the extraction
      await prisma.documentExtraction.upsert({
        where: { documentId },
        create: {
          documentId,
          detectedDocumentType: this.mapDocumentType(parsed.documentType),
          confidence: parsed.confidence || 0.5,
          passengerName: parsed.passengerName || null,
          fromLocation: parsed.fromLocation || null,
          toLocation: parsed.toLocation || null,
          departureDate: parsed.departureDate ? new Date(parsed.departureDate) : null,
          purchaseDate: parsed.purchaseDate ? new Date(parsed.purchaseDate) : null,
          documentDate: parsed.documentDate ? new Date(parsed.documentDate) : null,
          flightNumber: parsed.flightNumber || null,
          airline: parsed.airline || null,
          bookingReference: parsed.bookingReference || null,
          seatNumber: parsed.seatNumber || null,
          trainNumber: parsed.trainNumber || null,
          busCompany: parsed.busCompany || null,
          amount: parsed.amount || null,
          currency: parsed.currency || null,
          rawAiResponse: textBlock.text,
        },
        update: {
          detectedDocumentType: this.mapDocumentType(parsed.documentType),
          confidence: parsed.confidence || 0.5,
          passengerName: parsed.passengerName || null,
          fromLocation: parsed.fromLocation || null,
          toLocation: parsed.toLocation || null,
          departureDate: parsed.departureDate ? new Date(parsed.departureDate) : null,
          purchaseDate: parsed.purchaseDate ? new Date(parsed.purchaseDate) : null,
          documentDate: parsed.documentDate ? new Date(parsed.documentDate) : null,
          flightNumber: parsed.flightNumber || null,
          airline: parsed.airline || null,
          bookingReference: parsed.bookingReference || null,
          seatNumber: parsed.seatNumber || null,
          trainNumber: parsed.trainNumber || null,
          busCompany: parsed.busCompany || null,
          amount: parsed.amount || null,
          currency: parsed.currency || null,
          rawAiResponse: textBlock.text,
          consolidated: false,
        },
      });

      // Update the document type based on AI detection
      await prisma.document.update({
        where: { id: documentId },
        data: { documentType: this.mapDocumentType(parsed.documentType) },
      });

      console.log(`[Consolidation] Stored extraction for document ${documentId}: ${parsed.documentType}`);
    } catch (error) {
      console.error(`[Consolidation] Error extracting document ${documentId}:`, error);

      // Store a failed extraction
      await prisma.documentExtraction.upsert({
        where: { documentId },
        create: {
          documentId,
          detectedDocumentType: 'OTHER',
          confidence: 0.1,
          rawAiResponse: error instanceof Error ? error.message : 'Unknown error',
        },
        update: {
          detectedDocumentType: 'OTHER',
          confidence: 0.1,
          rawAiResponse: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  /**
   * Consolidate all documents for a participant into a coherent journey
   * This is called when the participant moves from Step 1 to Step 2
   */
  async consolidateParticipantJourney(participantId: string): Promise<ConsolidationResult> {
    console.log(`[Consolidation] Starting journey consolidation for participant ${participantId}`);

    // Get participant with all documents and extractions
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: {
        project: true,
        documents: {
          include: { extraction: true },
        },
        travelItems: true,
      },
    });

    if (!participant) {
      throw new Error('Participant not found');
    }

    const extractions = participant.documents
      .filter((d) => d.extraction)
      .map((d) => ({
        ...d.extraction!,
        documentId: d.id, // Override with the actual document ID
      }));

    if (extractions.length === 0) {
      console.log('[Consolidation] No extractions found, nothing to consolidate');
      return {
        success: false,
        message: 'No document extractions available',
        travelItems: [],
        warnings: ['No documents have been analyzed yet'],
      };
    }

    // Build a summary for the AI to analyze
    const extractionSummary = extractions.map((e, i) => ({
      docIndex: i + 1,
      documentId: e.documentId,
      type: e.detectedDocumentType,
      passenger: e.passengerName,
      from: e.fromLocation,
      to: e.toLocation,
      departureDate: e.departureDate?.toISOString().split('T')[0],
      purchaseDate: e.purchaseDate?.toISOString().split('T')[0],
      flightNumber: e.flightNumber,
      bookingRef: e.bookingReference,
      amount: e.amount,
      currency: e.currency,
    }));

    const prompt = `You are an AI agent helping to process Erasmus+ travel reimbursements.

PARTICIPANT INFO:
- Name: ${participant.firstName} ${participant.lastName}
- Country (traveling from): ${participant.country}
- Project location: ${participant.project.country}
- Project dates: ${participant.project.startDate.toISOString().split('T')[0]} to ${participant.project.endDate.toISOString().split('T')[0]}

EXTRACTED DOCUMENT DATA:
${JSON.stringify(extractionSummary, null, 2)}

YOUR TASK:
1. Understand the complete journey: The participant likely traveled from their home country to the project location and back.
2. Link related documents: Match boarding passes to their flight invoices using booking references, flight numbers, or matching routes.
3. Create travel items: Each distinct travel segment (e.g., outbound flight, return flight) should be a separate travel item.
4. Identify issues: Flag any warnings (name mismatches, missing documents, conflicting data).

IMPORTANT RULES:
- Boarding pass dates are ALWAYS departure dates (when the person flew)
- Invoice/booking dates might be purchase dates OR departure dates - use context to determine
- If a boarding pass and invoice have the same route/flight, they are the SAME trip - use the invoice price
- Verify passenger name matches participant name (flag if different)
- Each leg of the journey should be ONE travel item (don't duplicate for boarding pass + invoice)

Respond with ONLY a JSON object:
{
  "journey_summary": "Brief description of the understood journey",
  "travel_items": [
    {
      "modeOfTransport": "PLANE" | "TRAIN" | "BUS" | "CAR" | "FERRY" | "OTHER",
      "fromLocation": "City name",
      "toLocation": "City name",
      "departureDate": "YYYY-MM-DD",
      "arrivalDate": "YYYY-MM-DD or null",
      "bookingReference": "Reference or null",
      "flightNumber": "Flight number or null",
      "amount": 123.45,
      "currency": "EUR",
      "purchaseDate": "YYYY-MM-DD or null",
      "linkedDocumentIds": ["doc-id-1", "doc-id-2"],
      "notes": "Any relevant notes about this leg"
    }
  ],
  "document_links": [
    {
      "invoiceDocId": "doc-id-for-invoice",
      "boardingPassDocId": "doc-id-for-boarding-pass",
      "reason": "Why these are linked (e.g., same booking reference)"
    }
  ],
  "warnings": [
    "List any issues found (name mismatches, missing boarding passes, etc.)"
  ],
  "missing_documents": [
    {
      "type": "FLIGHT_BOARDING_PASS",
      "description": "Missing boarding pass for flight on YYYY-MM-DD from X to Y"
    }
  ]
}`;

    // Build a set of valid document IDs for this participant
    const validDocumentIds = new Set(participant.documents.map((d) => d.id));

    try {
      // Text-only consolidation uses Sonnet for better reasoning
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not parse consolidation response');
      }

      const result = JSON.parse(jsonMatch[0]);
      console.log(`[Consolidation] Journey: ${result.journey_summary}`);

      // Delete existing travel items (we'll recreate them)
      await prisma.travelItem.deleteMany({
        where: { participantId },
      });

      // Create new travel items based on consolidation
      const createdItems = [];
      for (const item of result.travel_items || []) {
        // Find a valid document to link - only use IDs that actually exist
        const linkedDocs = (item.linkedDocumentIds || []) as string[];
        const validLinkedDoc = linkedDocs.find((docId: string) => validDocumentIds.has(docId));

        // If no valid linked doc found, try to match by document index reference
        let primaryDocId: string | null = validLinkedDoc || null;

        // If AI returned something like "doc-1" or index numbers, try to match
        if (!primaryDocId && linkedDocs.length > 0) {
          const docRef = linkedDocs[0];
          // Check if it's a numeric reference like "1" or "doc-1"
          const match = docRef.match(/(\d+)/);
          if (match) {
            const index = parseInt(match[1], 10) - 1; // AI uses 1-based indexing
            if (index >= 0 && index < participant.documents.length) {
              primaryDocId = participant.documents[index].id;
            }
          }
        }

        // Convert currency to EUR
        let amountEur = item.amount || 0;
        if (item.currency && item.currency !== 'EUR') {
          amountEur = this.convertToEur(item.amount, item.currency);
        }

        const travelItem = await prisma.travelItem.create({
          data: {
            participantId,
            documentId: primaryDocId, // Will be null if no valid document found
            modeOfTransport: this.mapTransportMode(item.modeOfTransport),
            fromLocation: item.fromLocation || 'Unknown',
            toLocation: item.toLocation || 'Unknown',
            departureDate: item.departureDate ? new Date(item.departureDate) : new Date(),
            arrivalDate: item.arrivalDate ? new Date(item.arrivalDate) : null,
            bookingReference: item.bookingReference || null,
            flightNumber: item.flightNumber || null,
            amountOriginal: item.amount || 0,
            currencyOriginal: item.currency || 'EUR',
            purchaseDate: item.purchaseDate ? new Date(item.purchaseDate) : null,
            amountEur,
            comment: item.notes || null,
          },
        });

        createdItems.push(travelItem);
      }

      // Mark extractions as consolidated
      await prisma.documentExtraction.updateMany({
        where: {
          documentId: { in: participant.documents.map((d) => d.id) },
        },
        data: {
          consolidated: true,
          consolidatedAt: new Date(),
        },
      });

      // Update participant consolidation timestamp
      await prisma.participant.update({
        where: { id: participantId },
        data: { journeyConsolidatedAt: new Date() },
      });

      console.log(`[Consolidation] Created ${createdItems.length} travel items`);

      return {
        success: true,
        message: result.journey_summary,
        travelItems: createdItems,
        warnings: result.warnings || [],
        missingDocuments: result.missing_documents || [],
        documentLinks: result.document_links || [],
      };
    } catch (error) {
      console.error('[Consolidation] Error consolidating journey:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        travelItems: [],
        warnings: ['Failed to consolidate journey - please check your documents'],
      };
    }
  }

  private mapDocumentType(type: string): DocumentType {
    const mapping: Record<string, DocumentType> = {
      FLIGHT_INVOICE: 'FLIGHT_INVOICE',
      FLIGHT_BOARDING_PASS: 'FLIGHT_BOARDING_PASS',
      TRAIN_TICKET: 'TRAIN_TICKET',
      BUS_TICKET: 'BUS_TICKET',
      FUEL_RECEIPT: 'FUEL_RECEIPT',
      GREEN_TRAVEL_DECLARATION: 'GREEN_TRAVEL_DECLARATION',
    };
    return (mapping[type] || 'OTHER') as DocumentType;
  }

  private mapTransportMode(mode: string): TransportMode {
    const mapping: Record<string, TransportMode> = {
      PLANE: 'PLANE',
      TRAIN: 'TRAIN',
      BUS: 'BUS',
      CAR: 'CAR',
      FERRY: 'FERRY',
    };
    return (mapping[mode] || 'OTHER') as TransportMode;
  }

  private convertToEur(amount: number, currency: string): number {
    const rates: Record<string, number> = {
      EUR: 1.0,
      USD: 0.92,
      GBP: 1.17,
      PLN: 0.23,
      CZK: 0.041,
      HUF: 0.0026,
      RON: 0.20,
      SEK: 0.088,
    };
    const rate = rates[currency.toUpperCase()] || 1;
    return Math.round(amount * rate * 100) / 100;
  }
}

export interface ConsolidationResult {
  success: boolean;
  message: string;
  travelItems: unknown[];
  warnings: string[];
  missingDocuments?: { type: string; description: string }[];
  documentLinks?: { invoiceDocId: string; boardingPassDocId: string; reason: string }[];
}

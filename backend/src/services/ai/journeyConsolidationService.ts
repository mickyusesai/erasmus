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
   * Uses iterative approach to ensure image is under limit
   */
  private async resizeImageIfNeeded(buffer: Buffer, mimeType: string): Promise<Buffer> {
    // Use a slightly lower target to account for base64 encoding overhead
    const TARGET_SIZE = MAX_IMAGE_SIZE * 0.85; // 85% of max to be safe

    if (buffer.length <= TARGET_SIZE) {
      return buffer;
    }

    console.log(`[Consolidation] Resizing image from ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);

    let resized = buffer;
    let maxDimension = 1800;
    let quality = 75;

    // Iteratively reduce size until under limit
    while (resized.length > TARGET_SIZE && quality >= 20) {
      console.log(`[Consolidation] Attempting resize: ${maxDimension}px, quality ${quality}`);

      resized = await sharp(buffer)
        .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();

      console.log(`[Consolidation] Result: ${(resized.length / 1024 / 1024).toFixed(2)}MB`);

      if (resized.length > TARGET_SIZE) {
        // Reduce quality and dimensions for next iteration
        quality -= 15;
        maxDimension -= 200;
        maxDimension = Math.max(maxDimension, 800); // Don't go below 800px
      }
    }

    // If still too large, do one final aggressive resize
    if (resized.length > TARGET_SIZE) {
      console.log(`[Consolidation] Final aggressive resize`);
      resized = await sharp(buffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 20, mozjpeg: true })
        .toBuffer();
      console.log(`[Consolidation] Final result: ${(resized.length / 1024 / 1024).toFixed(2)}MB`);
    }

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
      // Resize image if needed - resizing always outputs JPEG
      const processedBuffer = await this.resizeImageIfNeeded(fileBuffer, mimeType);
      base64Data = processedBuffer.toString('base64');
      // If image was resized, it's now JPEG; otherwise keep original type
      if (processedBuffer !== fileBuffer) {
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

IMAGE QUALITY NOTE:
This may be a PHOTO of a physical receipt or ticket (not a digital document). Photos can be blurry, tilted, low contrast, or show crumpled paper. TRY YOUR BEST to extract information even from poor quality images.

COMMON DOCUMENT TYPES:
- NS train tickets: "Enkele reis" (single trip), stations like "Rotterdam C." or "Eindhoven C.", date DD-MM-YYYY, price in EUR
- Station receipts: "Customer's receipt", show "PAYMENT Date:" and "Total:" - use payment date as travel date
- Bus tickets: FlixBus, Flibco, Bravo - look for route, date, and price
- Omio/Trainline receipts: Online booking - may show booking fee markup over actual ticket price

CRITICAL DATE PARSING INSTRUCTIONS:
Documents may show dates in various EUROPEAN formats. You MUST recognize and correctly parse:
- DD/MM/YYYY (e.g., 15/03/2025 = March 15, 2025)
- DD.MM.YYYY (e.g., 15.03.2025 = March 15, 2025)
- DD-MM-YYYY (e.g., 15-03-2025 = March 15, 2025)
- DD.MM.YY (e.g., 22.11.25 = November 22, 2025) - 2-digit year means 20XX
- "DD. MMM YYYY" with abbreviated month (e.g., "21. stu 2025" = November 21, 2025)
- Dates with day names (e.g., "petak, 21. stu 2025." = Friday, November 21, 2025)

MONTH NAMES - Full AND ABBREVIATED forms (tickets often use abbreviations like "stu" for studeni/November!):
  * Croatian: siječanj, veljača, ožujak, travanj, svibanj, lipanj, srpanj, kolovoz, rujan, listopad, studeni, prosinac
  * Polish: styczeń, luty, marzec, kwiecień, maj, czerwiec, lipiec, sierpień, wrzesień, październik, listopad, grudzień
  * Czech: leden, únor, březen, duben, květen, červen, červenec, srpen, září, říjen, listopad, prosinec
  * Hungarian: január, február, március, április, május, június, július, augusztus, szeptember, október, november, december
  * German: Januar, Februar, März, April, Mai, Juni, Juli, August, September, Oktober, November, Dezember
  * Dutch: januari, februari, maart, april, mei, juni, juli, augustus, september, oktober, november, december
  * Spanish: enero, febrero, marzo, abril, mayo, junio, julio, agosto, septiembre, octubre, noviembre, diciembre
  * French: janvier, février, mars, avril, mai, juin, juillet, août, septembre, octobre, novembre, décembre
  * Italian: gennaio, febbraio, marzo, aprile, maggio, giugno, luglio, agosto, settembre, ottobre, novembre, dicembre

ABBREVIATED MONTHS (CRITICAL for ticket parsing):
* Croatian: sij=Jan, velj=Feb, ozu=Mar, tra=Apr, svi=May, lip=Jun, srp=Jul, kol=Aug, ruj=Sep, lis=Oct, stu=Nov, pro=Dec
* German: Jan, Feb, Mär, Apr, Mai, Jun, Jul, Aug, Sep, Okt, Nov, Dez
* Example: "petak, 21. stu 2025." = Friday, November 21, 2025 (stu = studeni = November)

IMPORTANT: In European dates, the DAY comes FIRST, then the month. 15/03/2025 means March 15, NOT October 3!

DATE TYPE CONTEXT:
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
  "departureDate": "YYYY-MM-DD (ALWAYS output in this format, regardless of input format) or null",
  "purchaseDate": "YYYY-MM-DD (ALWAYS output in this format) or null",
  "documentDate": "YYYY-MM-DD (ALWAYS output in this format) or null",
  "flightNumber": "e.g., KL1234 or null",
  "airline": "e.g., KLM or null",
  "bookingReference": "PNR/confirmation code or null",
  "seatNumber": "e.g., 14A or null",
  "trainNumber": "Train number or null",
  "busCompany": "Bus company name or null",
  "amount": 123.45 (numeric, total price) or null,
  "currency": "EUR/USD/GBP/PLN etc. or null"
}

Extract real values only - use null if not visible.
For station names like "Rotterdam C." or "Eindhoven C." use just the city name (Rotterdam, Eindhoven).
For "Instaphalte: Airport" type entries, use the actual location (e.g., Eindhoven Airport).
REMEMBER: European dates are DD/MM/YYYY - day first, then month!`;

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
- Project start date: ${participant.project.startDate.toISOString().split('T')[0]}
- Project end date: ${participant.project.endDate.toISOString().split('T')[0]}

EXTRACTED DOCUMENT DATA:
${JSON.stringify(extractionSummary, null, 2)}

YOUR TASK:
1. Understand the complete journey: The participant likely traveled from their home country to the project location and back.
2. Link related documents: Match boarding passes to their flight invoices using booking references, flight numbers, or matching routes.
3. Create travel items: Each distinct travel segment (e.g., outbound flight, return flight) should be a separate travel item.
4. Identify issues: Flag any warnings (name mismatches, missing documents, conflicting data).

CRITICAL DATE PARSING:
- Documents may contain dates in EUROPEAN format (DD/MM/YYYY or DD.MM.YYYY) - day comes FIRST!
- Dates may include day names and abbreviated months (e.g., "petak, 21. stu 2025." = Friday, November 21, 2025)
- ABBREVIATED MONTHS (critical for tickets): Croatian: sij=Jan, velj=Feb, ozu=Mar, tra=Apr, svi=May, lip=Jun, srp=Jul, kol=Aug, ruj=Sep, lis=Oct, stu=Nov, pro=Dec
- Full Croatian months: siječanj, veljača, ožujak, travanj, svibanj, lipanj, srpanj, kolovoz, rujan, listopad, studeni, prosinac
- German months: Jan/Januar, Feb/Februar, Mär/März, Apr/April, Mai, Jun/Juni, Jul/Juli, Aug/August, Sep/September, Okt/Oktober, Nov/November, Dez/Dezember
- Always output dates in YYYY-MM-DD format

WARNING RULES:
- Travel dates are EXPECTED to be close to but outside the project period (participants travel TO the event before it starts and travel BACK after it ends)
- Only generate a warning if a travel date is MORE THAN 30 DAYS before the project start date OR MORE THAN 30 DAYS after the project end date
- Do NOT warn about dates that are within 30 days of the project period - this is normal

IMPORTANT RULES:
- Boarding pass dates are ALWAYS departure dates (when the person flew)
- Invoice/booking dates might be purchase dates OR departure dates - use context to determine
- If multiple documents exist for the SAME trip (e.g., Omio receipt + FlixBus ticket, or booking confirmation + boarding pass), use the HIGHEST price - that's what they actually paid including booking fees
- If a boarding pass and invoice have the same route/flight, they are the SAME trip - combine into ONE travel item
- Verify passenger name matches participant name (flag if different)
- Each leg of the journey should be ONE travel item (don't duplicate for boarding pass + invoice)
- Train receipts and tickets for the same journey should be combined - use the receipt amount as it's what was paid

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

      // Get existing travel items that have been manually edited
      const existingItems = participant.travelItems || [];
      const manuallyEditedItems = existingItems.filter((item) => item.manuallyEdited);
      const manuallyEditedSignatures = manuallyEditedItems.map((item) => ({
        id: item.id,
        signature: `${item.fromLocation.toLowerCase()}-${item.toLocation.toLowerCase()}-${item.departureDate.toISOString().split('T')[0]}`,
        item,
      }));

      console.log(`[Consolidation] Found ${manuallyEditedItems.length} manually edited items to preserve`);

      // Delete only non-manually-edited travel items (preserve manual edits)
      await prisma.travelItem.deleteMany({
        where: {
          participantId,
          manuallyEdited: false,
        },
      });

      // Create new travel items based on consolidation
      const createdItems = [];
      for (const item of result.travel_items || []) {
        // Check if this matches a manually edited item (same route and date)
        const itemSignature = `${(item.fromLocation || 'unknown').toLowerCase()}-${(item.toLocation || 'unknown').toLowerCase()}-${item.departureDate || ''}`;
        const existingMatch = manuallyEditedSignatures.find(
          (me) => me.signature === itemSignature ||
            // Fuzzy match: same locations but possibly different date format
            (me.item.fromLocation.toLowerCase().includes(item.fromLocation?.toLowerCase() || '') &&
             me.item.toLocation.toLowerCase().includes(item.toLocation?.toLowerCase() || ''))
        );

        if (existingMatch) {
          // Skip creating this item - we're preserving the manually edited version
          console.log(`[Consolidation] Preserving manually edited item: ${itemSignature}`);
          createdItems.push(existingMatch.item);
          continue;
        }
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
            manuallyEdited: false,
            originalAmountFromAi: item.amount || 0, // Store AI-detected amount for comparison
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

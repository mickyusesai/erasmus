import OpenAI from 'openai';
import sharp from 'sharp';
import prisma from '../../utils/prisma.js';
import { DocumentType, TransportMode } from './types.js';
import { getStorageService } from '../storage/index.js';
import { convertToEur as convertToEurService } from '../exchangeRate/infoEuroService.js';

// Maximum file size for OpenAI API (32MB per request, but we'll keep images smaller)
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
  private client: OpenAI;
  private model: string = 'gpt-5.2'; // GPT-5.2 with native PDF and vision support

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log(`[Consolidation Service] Using OpenAI ${this.model} for document extraction and analysis`);
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
    console.log(`[Consolidation] Extracting data from document ${documentId} using OpenAI GPT-5.2`);

    const isPdf = mimeType.includes('pdf');

    // Build the content array for the API request
    // GPT-5.2 supports both images and PDFs natively
    type ContentPart =
      | { type: 'image_url'; image_url: { url: string; detail: 'high' | 'low' | 'auto' } }
      | { type: 'file'; file: { file_data: string; filename: string } }
      | { type: 'text'; text: string };

    const contentParts: ContentPart[] = [];

    if (isPdf) {
      // Send PDF directly - GPT-5.2 has native PDF support
      const base64Data = fileBuffer.toString('base64');
      console.log(`[Consolidation] Sending PDF directly (${(fileBuffer.length / 1024).toFixed(1)}KB)`);

      contentParts.push({
        type: 'file',
        file: {
          file_data: `data:application/pdf;base64,${base64Data}`,
          filename: 'document.pdf',
        },
      });
    } else {
      // Process image - resize if needed
      const processedBuffer = await this.resizeImageIfNeeded(fileBuffer, mimeType);
      const base64Data = processedBuffer.toString('base64');
      let mediaType = 'image/jpeg';
      if (mimeType.includes('png')) mediaType = 'image/png';
      else if (mimeType.includes('gif')) mediaType = 'image/gif';
      else if (mimeType.includes('webp')) mediaType = 'image/webp';

      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${mediaType};base64,${base64Data}`,
          detail: 'high',
        },
      });
    }

    // LIGHT EXTRACTION: Quick analysis for immediate UI feedback
    // The heavy lifting is done in consolidation where AI sees ALL documents together
    const prompt = `You are analyzing a travel document for Erasmus+ reimbursement.
Quick extraction for UI feedback - a more thorough analysis will happen later.

IMAGE QUALITY NOTE:
This may be a PHOTO of a physical receipt or ticket (not a digital document). Photos can be blurry, tilted, low contrast, or show crumpled paper. TRY YOUR BEST to extract information even from poor quality images.

=== MULTILINGUAL DOCUMENT HANDLING ===
STEP 1: DETECT THE DOCUMENT LANGUAGE FIRST
Before extracting any data, identify what language the document is written in. Common languages:
- English, Dutch, German, French, Spanish, Italian, Polish, Croatian, Czech, Slovak, Hungarian, Romanian, etc.
Knowing the language helps you correctly interpret abbreviations, dates, and terminology.

STEP 2: INTERPRET IN CONTEXT OF THAT LANGUAGE
Once you know the language, use that context to understand abbreviations, month names, and terms.

DOCUMENT TYPE CLASSIFICATION:
Carefully determine the document type:

1. TICKET DOCUMENTS (have route/journey information):
   - FLIGHT_INVOICE: Flight booking confirmation, e-ticket, itinerary with flight details
   - FLIGHT_BOARDING_PASS: Boarding pass with gate, seat, flight number
   - TRAIN_TICKET: Train ticket with stations, date, sometimes price
   - BUS_TICKET: Bus ticket with route, date, company name

2. PAYMENT/RECEIPT DOCUMENTS (have amount but may lack route):
   - BANK_TRANSACTION: Bank statement, mobile banking screenshot, card transaction
   - These show merchant name, amount, date - but often NO route information
   - Example: "PLESO PRIJEVOZ, ZAGREB" is a payment to a bus company, not a ticket

3. OTHER DOCUMENTS:
   - FUEL_RECEIPT: Gas station receipt
   - GREEN_TRAVEL_DECLARATION: Declaration for green travel
   - INTERRAIL_PASS: Interrail or Eurail pass (multi-day rail travel pass)
   - OTHER: Anything else

CRITICAL: Bank transactions and payment screenshots are NOT tickets!
- If you see a bank app interface, transaction history, or payment confirmation
- If the document shows "Kartična transakcija" (card transaction), "ISPLATA" (payment), etc.
- Set documentType to "BANK_TRANSACTION"
- The date shown is the PURCHASE DATE (when payment was made), NOT the travel date
- fromLocation and toLocation should be null unless the route is explicitly stated

COMMON DOCUMENT PATTERNS:
- NS train tickets: "Enkele reis" (single trip), stations like "Rotterdam C.", date DD-MM-YYYY, price
- Station receipts: "Customer's receipt", show "PAYMENT Date:" and "Total:"
- Bus tickets: FlixBus, Flibco, Bravo - look for route, date, and price
- Omio/Trainline: Online booking - may show booking fee markup
- Bank transactions: Show merchant name (e.g., "PLESO PRIJEVOZ", "WIZZAIR"), amount, date
- Flight itineraries: Look for "Total price of your trip: XX.XX EUR" patterns

CRITICAL DATE PARSING INSTRUCTIONS:
Documents may show dates in various EUROPEAN formats. You MUST recognize and correctly parse:
- DD/MM/YYYY (e.g., 15/03/2025 = March 15, 2025)
- DD.MM.YYYY (e.g., 15.03.2025 = March 15, 2025)
- DD-MM-YYYY (e.g., 15-03-2025 = March 15, 2025)
- DD.MM.YY (e.g., 22.11.25 = November 22, 2025) - 2-digit year means 20XX
- "DD. MMM YYYY" with abbreviated month (e.g., "21. stu 2025" = November 21, 2025)

MONTH NAMES - Full AND ABBREVIATED forms (learn these patterns!):
  * Croatian full: siječanj, veljača, ožujak, travanj, svibanj, lipanj, srpanj, kolovoz, rujan, listopad, studeni, prosinac
  * Croatian abbrev: sij/sije=Jan, velj=Feb, ožu/ozu=Mar, tra=Apr, svi=May, lip=Jun, srp=Jul, kol=Aug, ruj=Sep, lis=Oct, stu=Nov, pro=Dec
  * German full: Januar, Februar, März, April, Mai, Juni, Juli, August, September, Oktober, November, Dezember
  * German abbrev: Jan, Feb, Mär/Mrz, Apr, Mai, Jun, Jul, Aug, Sep, Okt, Nov, Dez
  * Dutch full: januari, februari, maart, april, mei, juni, juli, augustus, september, oktober, november, december
  * Dutch abbrev: jan, feb, mrt, apr, mei, jun, jul, aug, sep, okt, nov, dec
  * Polish full: styczeń, luty, marzec, kwiecień, maj, czerwiec, lipiec, sierpień, wrzesień, październik, listopad, grudzień
  * Polish abbrev: sty=Jan, lut=Feb, mar=Mar, kwi=Apr, maj=May, cze=Jun, lip=Jul, sie=Aug, wrz=Sep, paź=Oct, lis=Nov, gru=Dec
  * French: janvier, février, mars, avril, mai, juin, juillet, août, septembre, octobre, novembre, décembre
  * Spanish: enero, febrero, marzo, abril, mayo, junio, julio, agosto, septiembre, octubre, noviembre, diciembre
  * Italian: gennaio, febbraio, marzo, aprile, maggio, giugno, luglio, agosto, settembre, ottobre, novembre, dicembre

IMPORTANT: In European dates, the DAY comes FIRST, then the month. 15/03/2025 means March 15, NOT October 3!

DATE TYPE CONTEXT:
- BOARDING PASS: Date = DEPARTURE date (when person flew)
- FLIGHT INVOICE/BOOKING: May have purchase date AND departure date - extract BOTH
- TRAIN/BUS TICKET: Date = TRAVEL date
- BANK TRANSACTION: Date = PURCHASE date (NOT travel date!) - set as purchaseDate, leave departureDate null

PRICE EXTRACTION:
- For flight itineraries, look for total price patterns like "Total price of your trip: 66.99 EUR"
- Use null for amount if no price is visible - do NOT use 0
- Only use 0 if the document explicitly shows a zero price

Extract ALL information you can find. Respond with ONLY a JSON object:
{
  "documentLanguage": "Croatian" | "English" | "Dutch" | "German" | "French" | "Polish" | "Spanish" | "Italian" | "other",
  "documentType": "FLIGHT_INVOICE" | "FLIGHT_BOARDING_PASS" | "TRAIN_TICKET" | "BUS_TICKET" | "BANK_TRANSACTION" | "FUEL_RECEIPT" | "GREEN_TRAVEL_DECLARATION" | "LUGGAGE_INVOICE" | "INTERRAIL_PASS" | "OTHER",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation: 1) What language is this document in? 2) How did you identify the document type? 3) Key information extracted",

  "passengerName": "Full name of passenger or null",
  "fromLocation": "Origin city/airport or null (null for bank transactions without explicit route)",
  "toLocation": "Destination city/airport or null (null for bank transactions without explicit route)",
  "departureDate": "YYYY-MM-DD or null (null for bank transactions - use purchaseDate instead)",
  "purchaseDate": "YYYY-MM-DD or null (use this for bank transaction dates)",
  "documentDate": "YYYY-MM-DD or null",
  "flightNumber": "e.g., KL1234 or null",
  "airline": "e.g., KLM or null",
  "bookingReference": "PNR/confirmation code or null",
  "seatNumber": "e.g., 14A or null",
  "trainNumber": "Train number or null",
  "busCompany": "Bus company name or null",
  "merchantName": "For bank transactions: the merchant/company name (e.g., 'PLESO PRIJEVOZ', 'WIZZAIR') or null",
  "amount": 123.45 (numeric, total price) or null (use null if unknown, NOT 0),
  "currency": "EUR/USD/GBP/PLN etc. or null",
  "isRoundTrip": true/false (true if this booking includes BOTH outbound AND return journey),
  "numberOfPassengers": 1 (count of passengers on this booking),
  "allPassengerNames": "Name1, Name2, Name3" or null,
  "outboundFlightNumber": "Flight number for outbound journey or null",
  "returnFlightNumber": "Flight number for return journey or null",
  "outboundDepartureDate": "YYYY-MM-DD for outbound flight or null",
  "returnDepartureDate": "YYYY-MM-DD for return flight or null",

  "additionalTickets": [
    {
      "fromLocation": "...",
      "toLocation": "...",
      "departureDate": "YYYY-MM-DD",
      "amount": 12.34 or null,
      "trainNumber": "..." or null
    }
  ] // ONLY if this document contains MULTIPLE separate tickets/segments (e.g., multi-leg train journey)
}

IMPORTANT - Round-trip detection:
- Look for keywords like "Return", "Round trip", "Hin- und Rückflug", "Retour", two different flight dates
- If you see TWO flights in the booking (outbound AND return), set isRoundTrip to true
- Extract BOTH outboundDepartureDate and returnDepartureDate if visible
- For round-trips, fromLocation/toLocation should be the OUTBOUND journey
- Set both outboundFlightNumber and returnFlightNumber if visible

Extract real values only - use null if not visible.
For station names like "Rotterdam C." or "Eindhoven C." use just the city name.
REMEMBER: European dates are DD/MM/YYYY - day first, then month!`;

    contentParts.push({ type: 'text', text: prompt });

    try {
      console.log(`[Extraction] Quick extraction for UI feedback using ${this.model}`);

      const response = await this.client.chat.completions.create({
        model: this.model,
        max_completion_tokens: 2000, // Light extraction - keep it fast
        messages: [
          {
            role: 'user',
            content: contentParts as OpenAI.Chat.Completions.ChatCompletionContentPart[],
          },
        ],
      });

      const responseText = response.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error('No response from OpenAI');
      }

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
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
          fromLocation: parsed.fromLocation ? this.toTitleCase(parsed.fromLocation) : null,
          toLocation: parsed.toLocation ? this.toTitleCase(parsed.toLocation) : null,
          departureDate: parsed.departureDate ? new Date(parsed.departureDate) : null,
          purchaseDate: parsed.purchaseDate ? new Date(parsed.purchaseDate) : null,
          documentDate: parsed.documentDate ? new Date(parsed.documentDate) : null,
          flightNumber: parsed.flightNumber || null,
          airline: parsed.airline || null,
          bookingReference: parsed.bookingReference || null,
          seatNumber: parsed.seatNumber || null,
          trainNumber: parsed.trainNumber || null,
          busCompany: parsed.busCompany || null,
          merchantName: parsed.merchantName || null,
          amount: parsed.amount || null,
          currency: parsed.currency || null,
          isRoundTrip: parsed.isRoundTrip || false,
          numberOfPassengers: parsed.numberOfPassengers || null,
          allPassengerNames: parsed.allPassengerNames || null,
          outboundFlightNumber: parsed.outboundFlightNumber || null,
          returnFlightNumber: parsed.returnFlightNumber || null,
          additionalTickets: parsed.additionalTickets ? JSON.stringify(parsed.additionalTickets) : null,
          extractionReasoning: parsed.reasoning || null,
          rawAiResponse: responseText,
        },
        update: {
          detectedDocumentType: this.mapDocumentType(parsed.documentType),
          confidence: parsed.confidence || 0.5,
          passengerName: parsed.passengerName || null,
          fromLocation: parsed.fromLocation ? this.toTitleCase(parsed.fromLocation) : null,
          toLocation: parsed.toLocation ? this.toTitleCase(parsed.toLocation) : null,
          departureDate: parsed.departureDate ? new Date(parsed.departureDate) : null,
          purchaseDate: parsed.purchaseDate ? new Date(parsed.purchaseDate) : null,
          documentDate: parsed.documentDate ? new Date(parsed.documentDate) : null,
          flightNumber: parsed.flightNumber || null,
          airline: parsed.airline || null,
          bookingReference: parsed.bookingReference || null,
          seatNumber: parsed.seatNumber || null,
          trainNumber: parsed.trainNumber || null,
          busCompany: parsed.busCompany || null,
          merchantName: parsed.merchantName || null,
          amount: parsed.amount || null,
          currency: parsed.currency || null,
          isRoundTrip: parsed.isRoundTrip || false,
          numberOfPassengers: parsed.numberOfPassengers || null,
          allPassengerNames: parsed.allPassengerNames || null,
          outboundFlightNumber: parsed.outboundFlightNumber || null,
          returnFlightNumber: parsed.returnFlightNumber || null,
          additionalTickets: parsed.additionalTickets ? JSON.stringify(parsed.additionalTickets) : null,
          extractionReasoning: parsed.reasoning || null,
          rawAiResponse: responseText,
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
      await this.storeFailedExtraction(documentId, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async storeFailedExtraction(documentId: string, errorMessage: string): Promise<void> {
    await prisma.documentExtraction.upsert({
      where: { documentId },
      create: {
        documentId,
        detectedDocumentType: 'OTHER',
        confidence: 0.1,
        rawAiResponse: errorMessage,
      },
      update: {
        detectedDocumentType: 'OTHER',
        confidence: 0.1,
        rawAiResponse: errorMessage,
      },
    });
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

    // Clean up orphaned documents: if there are 0 travel items but documents exist
    // that are not linked to any travel item, they're orphans from a previous delete cycle.
    // Keeping them would cause the AI to see duplicate data and create duplicate travel items.
    const existingTravelItems = participant.travelItems || [];
    if (existingTravelItems.length === 0 && participant.documents.length > 0) {
      // Check which documents are NOT linked to any travel item
      const linkedDocIds = new Set<string>();
      for (const item of existingTravelItems) {
        if ((item as any).documentId) linkedDocIds.add((item as any).documentId);
        if ((item as any).additionalDocumentIds) {
          try {
            const ids = JSON.parse((item as any).additionalDocumentIds) as string[];
            ids.forEach(id => linkedDocIds.add(id));
          } catch { /* ignore */ }
        }
      }

      const orphanedDocs = participant.documents.filter((doc: { id: string }) => !linkedDocIds.has(doc.id));
      if (orphanedDocs.length > 0) {
        // Check if there are also recently uploaded documents (within last 5 minutes)
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentDocs = participant.documents.filter((doc: any) => new Date(doc.createdAt) >= fiveMinAgo);
        const oldOrphans = orphanedDocs.filter((doc: any) => new Date(doc.createdAt) < fiveMinAgo);

        if (recentDocs.length > 0 && oldOrphans.length > 0) {
          // There are both recent uploads AND old orphans — clean up old orphans
          console.log(`[Consolidation] Cleaning up ${oldOrphans.length} orphaned documents from previous session`);
          const storage = getStorageService();
          for (const doc of oldOrphans) {
            try {
              await storage.delete((doc as any).storedFilePath);
            } catch (error) {
              console.error(`[Consolidation] Failed to delete orphaned file: ${(doc as any).storedFilePath}`, error);
            }
            await prisma.document.delete({ where: { id: doc.id } });
          }

          // Re-fetch participant with cleaned up documents
          const refreshed = await prisma.participant.findUnique({
            where: { id: participantId },
            include: {
              project: true,
              documents: { include: { extraction: true } },
              travelItems: true,
            },
          });
          if (refreshed) {
            // Update the participant reference with fresh data
            (participant as any).documents = (refreshed as any).documents;
            (participant as any).travelItems = (refreshed as any).travelItems;
          }
        }
      }
    }

    // Build extraction map for quick lookup by document ID
    const extractionMap = new Map<string, Record<string, unknown>>();
    for (const doc of participant.documents) {
      if ((doc as { extraction: unknown }).extraction) {
        extractionMap.set(doc.id, (doc as { extraction: unknown }).extraction as Record<string, unknown>);
      }
    }

    if (extractionMap.size === 0) {
      console.log('[Consolidation] No extractions found, nothing to consolidate');
      return {
        success: false,
        message: 'No document extractions available',
        travelItems: [],
        warnings: ['No documents have been analyzed yet'],
      };
    }

    // Build a summary for the AI to analyze - MUST match visual document order!
    // We iterate over ALL documents to keep numbering consistent with visual content
    const extractionSummary = participant.documents.map((doc: { id: string; extraction: unknown }, i: number) => {
      const extraction = extractionMap.get(doc.id);
      if (!extraction) {
        // Document has no extraction - include minimal info so AI knows it exists
        return {
          docIndex: i + 1,
          documentId: doc.id,
          type: 'UNKNOWN',
          note: 'No extraction available - analyze from visual content above',
        };
      }

      const ext = extraction as {
        detectedDocumentType: string;
        passengerName?: string;
        fromLocation?: string;
        toLocation?: string;
        departureDate?: Date;
        purchaseDate?: Date;
        flightNumber?: string;
        bookingReference?: string;
        amount?: number;
        currency?: string;
        isRoundTrip?: boolean;
        numberOfPassengers?: number;
        allPassengerNames?: string;
        outboundFlightNumber?: string;
        returnFlightNumber?: string;
        merchantName?: string;
        busCompany?: string;
        additionalTickets?: string;
        extractionReasoning?: string;
      };
      // Parse additional tickets if present
      let additionalTickets = null;
      if (ext.additionalTickets) {
        try {
          additionalTickets = JSON.parse(ext.additionalTickets);
        } catch {
          // Ignore parse errors
        }
      }
      return {
        docIndex: i + 1,
        documentId: doc.id,
        type: ext.detectedDocumentType,
        passenger: ext.passengerName,
        from: ext.fromLocation,
        to: ext.toLocation,
        departureDate: ext.departureDate ? new Date(ext.departureDate).toISOString().split('T')[0] : null,
        purchaseDate: ext.purchaseDate ? new Date(ext.purchaseDate).toISOString().split('T')[0] : null,
        flightNumber: ext.flightNumber,
        bookingRef: ext.bookingReference,
        amount: ext.amount,
        currency: ext.currency,
        isRoundTrip: ext.isRoundTrip || false,
        numberOfPassengers: ext.numberOfPassengers || 1,
        allPassengerNames: ext.allPassengerNames || null,
        outboundFlightNumber: ext.outboundFlightNumber || null,
        returnFlightNumber: ext.returnFlightNumber || null,
        merchantName: ext.merchantName || ext.busCompany || null,
        additionalTickets: additionalTickets,
        extractionReasoning: ext.extractionReasoning || null,
      };
    });

    const prompt = `You are an expert travel document analyst for Erasmus+ reimbursements.

=== DOCUMENT IDENTIFICATION - ABSOLUTELY CRITICAL ===
Documents are shown visually above, each labeled: [Document X - ID: <uuid>]
The DOCUMENT REFERENCE TABLE below maps each document to its UUID.

*** WHEN RETURNING linkedDocumentIds, COPY THE EXACT UUID STRING ***
Example: If the train ticket is Document 3 with documentId "a1b2c3d4-e5f6-...",
your linkedDocumentIds MUST be: ["a1b2c3d4-e5f6-..."]
WRONG: ["3"], ["Document 3"], ["doc-3"]
RIGHT: ["a1b2c3d4-e5f6-..."] (the actual UUID)

For each travel item, find the matching document(s) by content (route, date, mode),
then copy that document's UUID from the DOCUMENT REFERENCE TABLE into linkedDocumentIds.

THINK STEP BY STEP - Before generating output, reason through:
1. What is the participant's home country based on travel patterns?
2. Which documents are tickets vs. payment receipts vs. bank transactions?
3. For each ticket: what is the route, date, mode of transport, and price?
4. Do any bank transactions/receipts match tickets by merchant name/amount/date?
5. Are there round-trip bookings? If so, identify both legs.
6. Are there multi-ticket documents? Check for multiple legs in same PDF.
7. Which documents belong to which travel legs? Match by route, date, AND mode.
8. What is the complete journey timeline from home → project → home?

PARTICIPANT INFO:
- Name: ${participant.firstName} ${participant.lastName}
- Country (traveling from): ${participant.country}
- Project location: ${participant.project.country}${participant.project.venueAddress ? `\n- Project venue address: ${participant.project.venueAddress} (Note: participants may not have tickets directly to this exact address — final leg transport like bus pickup is common in Erasmus+ projects, so the journey doesn\'t need to end exactly there, but this helps understand the general destination)` : ''}
- Project start date: ${participant.project.startDate.toISOString().split('T')[0]}
- Project end date: ${participant.project.endDate.toISOString().split('T')[0]}

DOCUMENT REFERENCE TABLE (use documentId UUIDs in your response!):
${JSON.stringify(extractionSummary, null, 2)}

=== CRITICAL RULES - DO NOT VIOLATE ===

RULE 1: DO NOT INVENT ROUTES OR SEGMENTS
- Each travel_item MUST correspond to exactly ONE ticket, boarding pass, or explicitly documented journey segment
- NEVER create synthetic routes that don't appear on any document
- NEVER combine multiple tickets into a new imaginary route
- If a document contains multiple tickets (e.g., a train journey with 2 segments), create SEPARATE travel items for EACH segment

RULE 2: DO NOT INVENT PRICES
- Only use prices that are EXPLICITLY stated in uploaded documents
- If no price is found in ANY document for a travel item, set amount to null
- NEVER use 0 as a placeholder for unknown prices
- NEVER estimate or calculate prices that aren't documented
- Boarding passes typically have no price - rely on invoice/booking/bank statement for the amount

RULE 3: DOCUMENT MATCHING - ATTACH DOCUMENTS TO CORRECT LEGS
For every document, you MUST explicitly decide which travel item(s) it belongs to.

Match documents to legs using these criteria:
- Route (from/to): City names, station names, airport codes (ZAG, EIN, CRL, etc.)
- Date: Must match the travel date
- Mode of transport: Bus ticket → bus leg, train ticket → train leg, boarding pass → plane leg
- Amount and currency (if present)

CRITICAL MATCHING RULES - TRANSPORT MODE MUST MATCH:
*** A BUS TICKET CAN NEVER BE PART OF A FLIGHT ***
*** A TRAIN TICKET CAN NEVER BE PART OF A BUS JOURNEY ***

Before linking ANY document to a travel item, verify:
1. The document type matches the transport mode:
   - BUS_TICKET → only link to BUS travel items
   - TRAIN_TICKET → only link to TRAIN travel items
   - FLIGHT_INVOICE, FLIGHT_BOARDING_PASS → only link to PLANE travel items
2. Even if cities overlap, different transport modes = DIFFERENT trips

BUS COMPANY DOCUMENTS - ALWAYS CREATE BUS TRAVEL ITEMS:
- FlixBus, Flibco, Eurolines, BlaBlaBus, RegioJet, Student Agency → BUS
- Look for: "autobusni kolodvor" (bus station), "Ruta" (route), bus route numbers
- A FlixBus Zagreb→Split ticket is a BUS trip, even if there's also a FLIGHT from Zagreb

EXAMPLES OF WRONG MATCHING (DO NOT DO THIS):
❌ FlixBus Zagreb→Split linked to WizzAir Zagreb→Brussels flight
❌ NS train ticket Amsterdam→Rotterdam linked to bus Brussels→Charleroi
❌ Boarding pass for flight linked to a different flight's booking

EXAMPLES OF CORRECT MATCHING:
✓ FlixBus ticket + FlixBus bank payment → same BUS travel item
✓ Flight booking + boarding pass + bank payment for same flight → same PLANE travel item
✓ Two NS train tickets for different dates → TWO separate TRAIN travel items

Additional rules:
- If a receipt has same date, route, and amount as a ticket, attach BOTH to the same travel item
- Prefer UNDER-ATTACHMENT over WRONG ATTACHMENT: if genuinely unsure where a document belongs, leave it unassigned rather than linking it to the wrong trip

RULE 4: MULTIPLE DOCUMENTS FOR ONE LEG
Some legs have more than one document (e.g., a bus ticket PDF + a bank payment screenshot for same trip):
- Create ONE travel item for that leg
- Set the ticket/boarding pass as the primary document (linkedDocumentIds[0])
- Add receipts/bank statements as additional documents (linkedDocumentIds[1], [2], etc.)
- Do NOT leave supporting receipts floating unassigned if they clearly match a leg

RULE 5: SAME DOCUMENT CONTAINS MULTIPLE LEGS
If a single PDF contains multiple tickets/boarding passes (e.g., outbound AND return in one "Flights.pdf"):
- Create SEPARATE travel items for each leg
- Link the SAME document ID to BOTH travel items
- This is the ONLY case where one document appears in multiple travel items

RULE 6: ROUND-TRIP BOOKINGS - PRICE HANDLING
When a booking covers both outbound AND return (one booking reference, one total price):
- Create TWO travel items (one per flight/leg)
- Attach the booking document to BOTH items
- Put the FULL total amount on the OUTBOUND leg
- Set amount to 0 on the RETURN leg with "amountIncludedInRoundTrip": true
- Set "priceEditable": false on the return leg
- Do NOT try to guess or split the price per flight

RULE 7: BANK TRANSACTIONS ARE NOT TRAVEL ITEMS
- BANK_TRANSACTION documents provide price information only
- Match them to tickets by merchant name, amount, and date
- Add as additional document to the matching travel item
- NEVER create a travel item from a bank transaction alone
- If unmatched, add to unmatched_payments

RULE 8: UNASSIGNED DOCUMENTS
After matching, check which documents remain unassigned:
- If an unassigned file matches an existing leg (same date, route, amount), attach it
- Only keep a document unassigned if:
  * Its route, date, or mode do NOT match any existing travel item
  * It genuinely looks like a separate trip not yet added
- The "unassigned_documents" list should NOT include receipts you could confidently match

RULE 9: AMOUNT HANDLING
- null = price is unknown (could not find in any document)
- 0 = price is explicitly zero (free) OR included in round-trip (with amountIncludedInRoundTrip: true)
- NEVER use 0 as a substitute for null

RULE 10: CONFLICTING PRICES - USE HIGHEST
When multiple documents for the same travel leg show different prices:
- USE THE HIGHEST price as it likely includes booking fees, service charges, or taxes
- Example: If invoice shows €50 but bank statement shows €53.50, use €53.50
- Document your choice in the "priceSourceDocId" field

RULE 11: DETECT DUPLICATE DOCUMENTS FOR SAME TRIP
Multiple documents may describe the SAME trip - DO NOT create duplicate travel items.

*** BUT ONLY IF TRANSPORT MODE MATCHES! ***
A bus ticket and a flight ticket are NEVER duplicates, even if routes overlap!

Requirements for documents to be duplicates:
1. SAME transport mode (both bus, both train, or both plane)
2. SAME route (accounting for name variations)
3. SAME date

Location name variations (only relevant when transport mode matches):
- "Brussels Midi Station" = "Bruxelles-Midi" = "Brussels South" = "Gare du Midi"
- "Charleroi Airport" = "Brussels South Charleroi" = "CRL" = "Aéroport de Charleroi"
- "Zagreb Airport" = "Pleso" = "ZAG" = "Franjo Tuđman"

NOT DUPLICATES (different transport modes):
- FlixBus Zagreb→Split (BUS) and WizzAir Zagreb→Brussels (PLANE) = TWO separate travel items
- NS train Rotterdam→Amsterdam and FlixBus Rotterdam→Brussels = TWO separate travel items

Compare SEMANTIC meaning of locations, not just text match.
Check: Do these documents describe the same physical journey WITH THE SAME TRANSPORT MODE? If yes → ONE travel item

RULE 12: FLIGHT DOCUMENT SETS
A single flight typically has MULTIPLE related documents - link them ALL to ONE travel item:
- BOOKING CONFIRMATION: Has price, booking reference, flight details
- INVOICE/ITINERARY: May have detailed price breakdown
- BOARDING PASS: Has gate, seat, confirms the flight happened
- BANK TRANSACTION: Shows the payment for this booking

When you see these document types with matching flight number, date, and route:
→ Create ONE travel item
→ Link ALL related documents in linkedDocumentIds
→ Use the booking/invoice price (or bank transaction if higher)
→ Boarding pass confirms travel but usually has no price

RULE 13: JOURNEY COHERENCE - SELF-VALIDATE
Before finalizing, verify your journey makes logical sense:
- Each leg's departure city should match the previous leg's arrival city
- The journey should form a sensible path: Home → Project Location → Home
- Check for impossible sequences (e.g., Amsterdam → Zagreb then Split → Rotterdam makes no sense)
- If the journey doesn't connect logically, RE-EXAMINE the documents:
  * Maybe dates were misread
  * Maybe some legs are missing from documents
  * Maybe documents from different trips were uploaded
- In "journey_issues" array, list any problems found during validation

RULE 14: LUGGAGE INVOICES - MERGE INTO FLIGHT
When a LUGGAGE_INVOICE document is detected (separate luggage/baggage fee invoice):
- Do NOT create a separate travel item for luggage
- Match it to the corresponding flight by airline, date, passenger name, or booking reference
- Add the luggage amount to the flight travel item using "luggageAmount" and "luggageCurrency" fields
- Add the luggage document ID to the flight's linkedDocumentIds AND set "luggageDocumentId"
- The total flight amount should NOT include the luggage fee — keep them separate for transparency
- If you cannot match the luggage invoice to any flight, add it to unassigned_documents

RULE 15: INTERRAIL PASS - CREATE TWO TRAVEL ITEMS
When an INTERRAIL_PASS document is detected (Interrail or Eurail multi-day rail pass):
- Create TWO travel items from this single document: one for the outbound journey and one for the return journey
- Both travel items should have modeOfTransport: "TRAIN"
- Both items should have the SAME document linked (the Interrail pass document ID in linkedDocumentIds)
- Use the participant's home country and the project location to infer the outbound route (home → project) and return route (project → home)
- Put the FULL pass price on the OUTBOUND leg; set amount to 0 on the RETURN leg with "amountIncludedInRoundTrip": true
- Set "priceEditable": false on the return leg
- On BOTH travel items, set "validationWarnings": ["Interrail pass — Declaration on Honor required as proof of actual train travel"]
- If departure/return dates are not clear from the pass, use the project start and end dates as reasonable defaults

=== OUTPUT FORMAT ===

Respond with ONLY a JSON object:
{
  "journey_summary": "Brief description of the actual documented journey",
  "consolidation_summary": "Notes for the organisation's review AI. Include: key decisions you made (e.g. 'Matched bank payment of €53.50 to WizzAir flight by date and airline name'), ambiguities (e.g. 'Passenger name John Smith on ticket vs J. Smith on boarding pass'), unusual patterns (e.g. 'Participant appears to travel from Kyiv not Warsaw as stated'), and anything the reviewer should double-check. Be specific and concise.",
  "detected_home_country": "Country name where journey starts and ends",
  "home_country_confidence": 0.0-1.0,
  "home_country_reasoning": "Brief explanation based on document evidence",

  "bookings": [
    {
      "bookingReference": "ABC123",
      "isRoundTrip": true,
      "totalAmount": 66.99 or null,
      "currency": "EUR",
      "numberOfPassengers": 1,
      "hasPerLegPrices": false,
      "priceSource": "Document #3 (flight itinerary)",
      "linkedDocumentIds": ["<UUID from DOCUMENT REFERENCE TABLE>"]
    }
  ],

  "travel_items": [
    {
      "modeOfTransport": "PLANE" | "TRAIN" | "BUS" | "CAR" | "FERRY" | "OTHER",
      "fromLocation": "City name (exactly as documented)",
      "toLocation": "City name (exactly as documented)",
      "departureDate": "YYYY-MM-DD",
      "arrivalDate": "YYYY-MM-DD or null",
      "bookingReference": "Reference or null (links to bookings array)",
      "flightNumber": "Flight number or null",
      "amount": 123.45 or null or 0,
      "currency": "EUR",
      "amountIncludedInRoundTrip": false (true if this is return leg with price on outbound),
      "priceEditable": true or false,
      "priceMissing": true or false (true if no price found anywhere for this leg),
      "priceSourceDocId": "<UUID> or null",
      "purchaseDate": "YYYY-MM-DD or null",
      "linkedDocumentIds": ["<UUID of primary doc>", "<UUID of additional doc if any>"],
      "numberOfPassengers": 1,
      "luggageAmount": null or 25.00 (amount from separate luggage invoice, if matched),
      "luggageCurrency": null or "EUR" (currency of the luggage invoice),
      "luggageDocumentId": null or "<UUID of luggage invoice document>",
      "validationWarnings": ["Array of warning strings for this specific travel item, e.g. Interrail declaration required. null if none."],
      "consolidationNotes": "Brief note for the review AI explaining key decisions, e.g. why a price was chosen, how documents were matched, any ambiguities noticed. null if nothing noteworthy."
    }
  ],

  IMPORTANT: All document IDs (linkedDocumentIds, priceSourceDocId, etc.) MUST be
  actual UUID strings copied from the "documentId" field in DOCUMENT REFERENCE TABLE.
  Example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

  "document_links": [
    {
      "ticketDocId": "doc-id-for-ticket",
      "paymentDocId": "doc-id-for-payment",
      "matchReason": "Same date (2025-11-22), merchant 'PLESO PRIJEVOZ' matches bus company, amount 8.00 EUR"
    }
  ],

  "unassigned_documents": [
    {
      "docId": "doc-id",
      "documentType": "BUS_TICKET",
      "reason": "Route Amsterdam→Brussels does not match any travel item in the journey"
    }
  ],

  "unmatched_payments": [
    {
      "docId": "doc-id",
      "merchantName": "UNKNOWN MERCHANT",
      "amount": 50.00,
      "date": "2025-11-20",
      "reason": "Could not match to any ticket - unknown merchant"
    }
  ],

  "warnings": ["Only actionable issues - name mismatch, missing price, etc."],

  "missing_documents": [
    {
      "type": "FLIGHT_BOARDING_PASS",
      "description": "Missing boarding pass for return flight Zagreb→Charleroi on 2025-11-30"
    }
  ],

  "journey_issues": [
    "Leg 3 starts from Split but Leg 2 ended in Zagreb - these don't connect",
    "Journey doesn't return to starting country"
  ]
}

=== DOCUMENT MATCHING EXAMPLE ===
If documents include:
- Doc 1: Bus ticket "City A → Airport A, 22-11-2025, 8 EUR"
- Doc 2: Bank screenshot "Airport Shuttle, 22-11-2025, 8.00 EUR"

Correct: ONE travel item with linkedDocumentIds: ["doc-1-id", "doc-2-id"]
Wrong: Two separate items, or doc-2 left unassigned

=== DATE PARSING ===
- European format: DD/MM/YYYY or DD.MM.YYYY - day comes FIRST!
- Abbreviated months: Croatian: sij=Jan, velj=Feb, ozu=Mar, tra=Apr, svi=May, lip=Jun, srp=Jul, kol=Aug, ruj=Sep, lis=Oct, stu=Nov, pro=Dec
- Always output in YYYY-MM-DD format

=== WARNING RULES ===
Warnings are shown DIRECTLY to the participant (not the reviewer). Only include warnings that are:
- Actionable by the participant
- Written in friendly, non-technical language

INCLUDE in warnings:
- Name mismatch between ticket and participant
- Multi-passenger booking needs portion specified
- Price truly missing (priceMissing=true) — tell participant they need to fill in the amount
- Country mismatch between profile and travel pattern

Do NOT include in warnings (these are handled elsewhere):
- Travel dates before/after project (normal for travel to/from)
- Round-trip structure (UI handles this)
- Matched receipts (those are attached, not warnings)
- Conflicting prices between documents (put this in consolidationNotes for the reviewer)
- Anything addressed to "reviewer", "auditor", or "organisation"
- Internal document matching decisions (put in consolidationNotes instead)`;

    // Build a set of valid document IDs for this participant
    const validDocumentIds = new Set(participant.documents.map((d: { id: string }) => d.id));

    try {
      console.log(`[Consolidation] Loading ${participant.documents.length} original documents for comprehensive analysis`);

      // HYBRID APPROACH: Send ALL original documents to the AI for comprehensive analysis
      // This gives the AI full visibility into the actual documents, not just JSON summaries
      const storageService = getStorageService();

      type ContentPart =
        | { type: 'image_url'; image_url: { url: string; detail: 'high' | 'low' | 'auto' } }
        | { type: 'file'; file: { file_data: string; filename: string } }
        | { type: 'text'; text: string };

      const contentParts: ContentPart[] = [];

      // Load and add all document files
      for (let i = 0; i < participant.documents.length; i++) {
        const doc = participant.documents[i] as { id: string; storedFilePath: string; mimeType: string; originalFilename: string };
        try {
          const fileBuffer = await storageService.retrieve(doc.storedFilePath);
          const isPdf = doc.mimeType.includes('pdf');

          if (isPdf) {
            // Send PDF directly
            const base64Data = fileBuffer.toString('base64');
            console.log(`[Consolidation] Adding document ${i + 1}: PDF (${(fileBuffer.length / 1024).toFixed(1)}KB)`);
            contentParts.push({
              type: 'file',
              file: {
                file_data: `data:application/pdf;base64,${base64Data}`,
                filename: `document_${i + 1}.pdf`,
              },
            });
          } else {
            // Process image - resize if needed
            const processedBuffer = await this.resizeImageIfNeeded(fileBuffer, doc.mimeType);
            const base64Data = processedBuffer.toString('base64');
            let mediaType = 'image/jpeg';
            if (doc.mimeType.includes('png')) mediaType = 'image/png';
            else if (doc.mimeType.includes('gif')) mediaType = 'image/gif';
            else if (doc.mimeType.includes('webp')) mediaType = 'image/webp';

            console.log(`[Consolidation] Adding document ${i + 1}: ${mediaType} (${(processedBuffer.length / 1024).toFixed(1)}KB)`);
            contentParts.push({
              type: 'image_url',
              image_url: {
                url: `data:${mediaType};base64,${base64Data}`,
                detail: 'high',
              },
            });
          }

          // Add a text label for this document
          contentParts.push({
            type: 'text',
            text: `[Document ${i + 1} - ID: ${doc.id}]`,
          });
        } catch (docError) {
          console.error(`[Consolidation] Failed to load document ${doc.id}:`, docError);
          contentParts.push({
            type: 'text',
            text: `[Document ${i + 1} - ID: ${doc.id} - FAILED TO LOAD]`,
          });
        }
      }

      // Add the analysis prompt with extraction summaries as additional context
      contentParts.push({
        type: 'text',
        text: prompt + `\n\nPREVIOUS EXTRACTION SUMMARIES (for reference - verify against actual documents above):\n${JSON.stringify(extractionSummary, null, 2)}`,
      });

      console.log(`[Consolidation] Using OpenAI ${this.model} for journey consolidation with ${contentParts.length} content parts`);

      const response = await this.client.chat.completions.create({
        model: this.model,
        max_completion_tokens: 8000,
        messages: [
          {
            role: 'user',
            content: contentParts as OpenAI.Chat.Completions.ChatCompletionContentPart[],
          },
        ],
      });

      const responseText = response.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error('No response from OpenAI');
      }

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not parse consolidation response');
      }

      const result = JSON.parse(jsonMatch[0]);
      console.log(`[Consolidation] Journey: ${result.journey_summary}`);

      // Keep ALL existing travel items - don't delete any
      // Only add new items from AI that don't match existing items
      const existingItems = participant.travelItems || [];
      const existingSignatures = existingItems.map((item: { id: string; fromLocation: string; toLocation: string; departureDate: Date; documentId: string | null }) => ({
        id: item.id,
        signature: `${item.fromLocation.toLowerCase()}-${item.toLocation.toLowerCase()}-${item.departureDate.toISOString().split('T')[0]}`,
        item,
      }));

      console.log(`[Consolidation] Found ${existingItems.length} existing travel items to preserve`);

      // Helper to resolve document IDs
      // IMPORTANT: We prefer UUIDs but also handle index references as fallback
      const resolveDocumentId = (docRef: string): string | null => {
        // First, check if it's a valid UUID (direct match)
        if (validDocumentIds.has(docRef)) {
          return docRef;
        }

        // Fallback: try to parse as a document number/index
        // This handles cases where AI returns "1", "doc-1", "Document 1", etc.
        const match = docRef.match(/(\d+)/);
        if (match) {
          const index = parseInt(match[1], 10) - 1; // Convert 1-based to 0-based
          if (index >= 0 && index < participant.documents.length) {
            const resolvedId = participant.documents[index].id;
            console.log(`[Consolidation] WARNING: AI returned "${docRef}" instead of UUID. Resolved to index ${index} -> ${resolvedId}`);
            return resolvedId;
          }
        }

        console.log(`[Consolidation] WARNING: Could not resolve document reference "${docRef}"`);
        return null;
      };

      // Create TravelBooking objects for round-trip and multi-leg bookings
      const bookingIdMap = new Map<string, string>(); // bookingReference -> TravelBooking.id
      for (const booking of result.bookings || []) {
        if (!booking.bookingReference) continue;

        // Resolve linked document IDs
        const linkedDocIds = (booking.linkedDocumentIds || [])
          .map((ref: string) => resolveDocumentId(ref))
          .filter((id: string | null): id is string => id !== null);

        // Convert total amount to EUR if needed
        const currency = booking.currency || 'EUR';
        const totalAmount = booking.totalAmount ?? null;
        const totalAmountEur = totalAmount !== null && currency !== 'EUR'
          ? await convertToEurService(totalAmount, currency)
          : totalAmount;

        const travelBooking = await prisma.travelBooking.create({
          data: {
            participantId,
            bookingReference: booking.bookingReference,
            isRoundTrip: booking.isRoundTrip || false,
            totalAmount: totalAmount,
            currency: currency,
            totalAmountEur: totalAmountEur,
            numberOfPassengers: booking.numberOfPassengers || null,
            documentIds: linkedDocIds.length > 0 ? JSON.stringify(linkedDocIds) : null,
            hasPerLegPrices: booking.hasPerLegPrices || false,
            priceSource: booking.priceSource || null,
          },
        });

        bookingIdMap.set(booking.bookingReference, travelBooking.id);
        console.log(`[Consolidation] Created booking ${booking.bookingReference} (round-trip: ${booking.isRoundTrip}, total: ${totalAmount} ${currency})`);
      }

      // Create new travel items based on consolidation
      const createdItems = [];
      for (const item of result.travel_items || []) {
        // Find valid documents to link FIRST (needed for both new and existing items)
        const linkedDocs = (item.linkedDocumentIds || []) as string[];
        const validLinkedDocs: string[] = [];

        for (const docRef of linkedDocs) {
          const resolved = resolveDocumentId(docRef);
          if (resolved && !validLinkedDocs.includes(resolved)) {
            validLinkedDocs.push(resolved);
          }
        }

        const primaryDocId: string | null = validLinkedDocs.length > 0 ? validLinkedDocs[0] : null;
        const additionalDocIds = validLinkedDocs.slice(1);

        // Check if this matches ANY existing item (same route and date)
        const itemSignature = `${(item.fromLocation || 'unknown').toLowerCase()}-${(item.toLocation || 'unknown').toLowerCase()}-${item.departureDate || ''}`;
        const existingMatch = existingSignatures.find(
          (existing: { signature: string; item: { id: string; fromLocation: string; toLocation: string; documentId: string | null } }) => existing.signature === itemSignature ||
            (existing.item.fromLocation.toLowerCase().includes(item.fromLocation?.toLowerCase() || '') &&
             existing.item.toLocation.toLowerCase().includes(item.toLocation?.toLowerCase() || ''))
        );

        if (existingMatch) {
          // UPDATE existing item's document links if AI provides new ones
          if (primaryDocId) {
            const oldDocId = existingMatch.item.documentId;

            await prisma.travelItem.update({
              where: { id: existingMatch.item.id },
              data: {
                documentId: primaryDocId,
                additionalDocumentIds: additionalDocIds.length > 0 ? JSON.stringify(additionalDocIds) : null,
              },
            });

            if (oldDocId !== primaryDocId) {
              console.log(`[Consolidation] Updated document link for existing item ${itemSignature}: ${oldDocId} -> ${primaryDocId}`);
            } else {
              console.log(`[Consolidation] Preserved existing travel item with same document: ${itemSignature}`);
            }
          } else {
            console.log(`[Consolidation] Preserved existing travel item (no new document link): ${itemSignature}`);
          }
          createdItems.push(existingMatch.item);
          continue;
        }

        // Get currency from document extraction or item
        let currency: string | null = null;
        if (primaryDocId) {
          const docExtraction = await prisma.documentExtraction.findUnique({
            where: { documentId: primaryDocId },
          });
          if (docExtraction?.currency) {
            currency = docExtraction.currency;
            console.log(`[Consolidation] Using currency ${currency} from document extraction for ${item.fromLocation} -> ${item.toLocation}`);
          }
        }
        if (!currency) {
          currency = (item.currency as string) || 'EUR';
        }

        // CRITICAL: Handle amount - use null if not found, NEVER default to 0
        const baseAmount: number | null = item.amount ?? null;  // Use nullish coalescing to preserve null

        // Auto-fill purchase date from departure date for non-EUR currencies without purchase date
        let purchaseDateValue = item.purchaseDate ? new Date(item.purchaseDate) : null;
        let purchaseDateAutoFilled = false;
        if (!purchaseDateValue && currency !== 'EUR' && baseAmount !== null) {
          // For return legs of round-trip bookings, use the outbound flight date if available
          if (item.amountIncludedInRoundTrip === true && item.bookingReference) {
            // Find outbound leg in the same booking to get its date
            const outboundItem = (result.travel_items || []).find(
              (ti: any) => ti.bookingReference === item.bookingReference && ti.amountIncludedInRoundTrip !== true
            );
            if (outboundItem?.departureDate) {
              purchaseDateValue = new Date(outboundItem.departureDate);
              purchaseDateAutoFilled = true;
            }
          }
          // Fallback to this item's departure date
          if (!purchaseDateValue && item.departureDate) {
            purchaseDateValue = new Date(item.departureDate);
            purchaseDateAutoFilled = true;
          }
        }

        let amountEur: number | null = baseAmount;
        if (baseAmount !== null && currency !== 'EUR') {
          const purchaseDateForConversion = purchaseDateValue || new Date();
          amountEur = await convertToEurService(baseAmount, currency, purchaseDateForConversion);
        }

        // Resolve price source document ID
        const priceSourceDocId = item.priceSourceDocId ? resolveDocumentId(item.priceSourceDocId) : null;

        // Link to booking if bookingReference matches
        const bookingId = item.bookingReference ? bookingIdMap.get(item.bookingReference) || null : null;

        // Handle amountIncludedInRoundTrip - if true, this is return leg with price on outbound
        const amountIncludedInRoundTrip = item.amountIncludedInRoundTrip === true;

        // Derive companyName from document extraction (airline, busCompany, or merchantName)
        let companyName: string | null = null;
        if (primaryDocId) {
          const docExtractionForCompany = await prisma.documentExtraction.findUnique({
            where: { documentId: primaryDocId },
          });
          if (docExtractionForCompany) {
            companyName = docExtractionForCompany.airline
              || docExtractionForCompany.busCompany
              || docExtractionForCompany.merchantName
              || null;
          }
        }

        // Handle luggage fee merged into this flight
        const luggageAmount = item.luggageAmount ?? null;
        const luggageCurrency = item.luggageCurrency || currency;
        let luggageAmountEur: number | null = null;
        if (luggageAmount !== null) {
          if (luggageCurrency !== 'EUR') {
            const purchaseDateForLuggage = item.purchaseDate ? new Date(item.purchaseDate) : new Date();
            luggageAmountEur = await convertToEurService(luggageAmount, luggageCurrency, purchaseDateForLuggage);
          } else {
            luggageAmountEur = luggageAmount;
          }
        }
        const luggageDocumentId = item.luggageDocumentId ? resolveDocumentId(item.luggageDocumentId) : null;

        const travelItem = await prisma.travelItem.create({
          data: {
            participantId,
            documentId: primaryDocId,
            additionalDocumentIds: additionalDocIds.length > 0 ? JSON.stringify(additionalDocIds) : null,
            bookingId: bookingId,
            modeOfTransport: this.mapTransportMode(item.modeOfTransport),
            fromLocation: this.toTitleCase(item.fromLocation || 'Unknown'),
            toLocation: this.toTitleCase(item.toLocation || 'Unknown'),
            departureDate: item.departureDate ? new Date(item.departureDate) : new Date(),
            arrivalDate: item.arrivalDate ? new Date(item.arrivalDate) : null,
            bookingReference: item.bookingReference || null,
            flightNumber: item.flightNumber || null,
            amountOriginal: baseAmount,
            currencyOriginal: currency,
            purchaseDate: purchaseDateValue || (item.purchaseDate ? new Date(item.purchaseDate) : null),
            purchaseDateAutoFilled: purchaseDateAutoFilled,
            amountEur: amountEur,
            comment: item.notes || null,
            consolidationNotes: item.consolidationNotes || null,
            manuallyEdited: false,
            originalAmountFromAi: baseAmount,
            originalCurrencyFromAi: currency,
            companyName: companyName,
            validationWarnings: item.validationWarnings && Array.isArray(item.validationWarnings) && item.validationWarnings.length > 0
              ? JSON.stringify(item.validationWarnings)
              : null,
            priceEditable: item.priceEditable !== false, // Default to true
            priceMissing: item.priceMissing === true,
            priceSourceDocId: priceSourceDocId,
            amountIncludedInRoundTrip: amountIncludedInRoundTrip,
            luggageAmount: luggageAmount,
            luggageAmountEur: luggageAmountEur,
            luggageDocumentId: luggageDocumentId,
            isRoundTrip: false, // Individual legs are not round-trips; the booking is
            numberOfPassengers: item.numberOfPassengers || null,
          },
        });

        const amountInfo = amountIncludedInRoundTrip ? '0 (included in round-trip)' : `${baseAmount ?? 'null'} ${currency}`;
        console.log(`[Consolidation] Created travel item: ${item.fromLocation} -> ${item.toLocation}, amount: ${amountInfo}, priceMissing: ${item.priceMissing}`);
        createdItems.push(travelItem);
      }

      // Include any existing items that weren't matched by AI
      const createdItemIds = new Set(createdItems.map((item: { id: string }) => item.id));
      for (const existing of existingItems) {
        if (!createdItemIds.has(existing.id)) {
          createdItems.push(existing);
        }
      }

      // Mark extractions as consolidated
      await prisma.documentExtraction.updateMany({
        where: {
          documentId: { in: participant.documents.map((d: { id: string }) => d.id) },
        },
        data: {
          consolidated: true,
          consolidatedAt: new Date(),
        },
      });

      // Update participant consolidation timestamp, detected home country, and consolidation summary
      await prisma.participant.update({
        where: { id: participantId },
        data: {
          journeyConsolidatedAt: new Date(),
          detectedHomeCountry: result.detected_home_country || null,
          homeCountryConfidence: result.home_country_confidence || null,
          homeCountryReasoning: result.home_country_reasoning || null,
          consolidationSummary: result.consolidation_summary || null,
        },
      });

      const newlyCreatedCount = createdItems.length - existingItems.length;
      console.log(`[Consolidation] Total ${createdItems.length} travel items (${newlyCreatedCount} new, ${existingItems.length} preserved)`);
      if (result.detected_home_country) {
        console.log(`[Consolidation] Detected home country: ${result.detected_home_country} (confidence: ${result.home_country_confidence})`);
      }

      return {
        success: true,
        message: result.journey_summary,
        travelItems: createdItems,
        bookings: result.bookings || [],
        warnings: result.warnings || [],
        missingDocuments: result.missing_documents || [],
        documentLinks: result.document_links || [],
        unmatchedPayments: result.unmatched_payments || [],
        unassignedDocuments: result.unassigned_documents || [],
        detectedHomeCountry: result.detected_home_country || null,
        homeCountryConfidence: result.home_country_confidence || null,
        homeCountryReasoning: result.home_country_reasoning || null,
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
      BANK_TRANSACTION: 'BANK_TRANSACTION',
      LUGGAGE_INVOICE: 'LUGGAGE_INVOICE',
      INTERRAIL_PASS: 'INTERRAIL_PASS',
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

  /**
   * Normalize a location name to title case (e.g. "EINDHOVEN" → "Eindhoven", "new york" → "New York")
   */
  private toTitleCase(name: string): string {
    if (!name) return name;
    return name
      .toLowerCase()
      .replace(/(?:^|\s|-|')\S/g, (match) => match.toUpperCase());
  }

}

export interface ConsolidationResult {
  success: boolean;
  message: string;
  travelItems: unknown[];
  bookings?: unknown[];
  warnings: string[];
  missingDocuments?: { type: string; description: string }[];
  documentLinks?: { ticketDocId: string; paymentDocId: string; matchReason?: string; reason?: string }[];
  unmatchedPayments?: { docId: string; merchantName: string; amount: number; date?: string; reason: string }[];
  unassignedDocuments?: { docId: string; documentType: string; reason: string }[];
  detectedHomeCountry?: string | null;
  homeCountryConfidence?: number | null;
  homeCountryReasoning?: string | null;
}

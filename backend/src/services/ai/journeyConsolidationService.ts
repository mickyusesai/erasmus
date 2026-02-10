import OpenAI from 'openai';
import sharp from 'sharp';
import { fromPath } from 'pdf2pic';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import prisma from '../../utils/prisma.js';
import { DocumentType, TransportMode } from './types.js';

// Maximum image size for OpenAI API (20MB, but we'll keep it smaller for efficiency)
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
  private model: string = 'gpt-4o'; // Use GPT-4o for vision capabilities (change to gpt-5.2 when available)

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
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
   * Convert PDF to images for OpenAI vision API
   */
  private async convertPdfToImages(buffer: Buffer): Promise<Buffer[]> {
    const images: Buffer[] = [];
    const tempDir = join(tmpdir(), 'erasmus-pdf-' + Date.now());
    const tempPdfPath = join(tempDir, 'input.pdf');

    try {
      // Create temp directory
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }

      // Write PDF to temp file
      writeFileSync(tempPdfPath, buffer);

      // Convert PDF to images
      const converter = fromPath(tempPdfPath, {
        density: 150,
        saveFilename: 'page',
        savePath: tempDir,
        format: 'jpeg',
        width: 1600,
        height: 2000,
      });

      // Convert first 5 pages max (to avoid huge documents)
      const pageLimit = 5;
      for (let page = 1; page <= pageLimit; page++) {
        try {
          const result = await converter(page);
          if (result.path) {
            const imageBuffer = await sharp(result.path).jpeg({ quality: 80 }).toBuffer();
            images.push(imageBuffer);
            // Clean up the page image
            try {
              unlinkSync(result.path);
            } catch {
              // Ignore cleanup errors
            }
          }
        } catch {
          // No more pages or error - stop
          break;
        }
      }

      console.log(`[Consolidation] Converted PDF to ${images.length} images`);
    } catch (error) {
      console.error('[Consolidation] PDF conversion error:', error);
      // Return empty array - will fall back to text extraction or skip
    } finally {
      // Clean up temp files
      try {
        unlinkSync(tempPdfPath);
      } catch {
        // Ignore
      }
      try {
        if (existsSync(tempDir)) {
          const { rmSync } = await import('fs');
          rmSync(tempDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    }

    return images;
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
    console.log(`[Consolidation] Extracting data from document ${documentId} using OpenAI`);

    const isPdf = mimeType.includes('pdf');
    const imageContents: OpenAI.Chat.Completions.ChatCompletionContentPartImage[] = [];

    if (isPdf) {
      // Convert PDF to images
      const pdfImages = await this.convertPdfToImages(fileBuffer);
      if (pdfImages.length === 0) {
        console.log('[Consolidation] Could not convert PDF to images, storing as failed extraction');
        await this.storeFailedExtraction(documentId, 'Could not process PDF');
        return;
      }

      for (const imgBuffer of pdfImages) {
        const resized = await this.resizeImageIfNeeded(imgBuffer, 'image/jpeg');
        const base64Data = resized.toString('base64');
        imageContents.push({
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${base64Data}`,
            detail: 'high',
          },
        });
      }
    } else {
      // Process image directly
      const processedBuffer = await this.resizeImageIfNeeded(fileBuffer, mimeType);
      const base64Data = processedBuffer.toString('base64');
      let mediaType = 'image/jpeg';
      if (mimeType.includes('png')) mediaType = 'image/png';
      else if (mimeType.includes('gif')) mediaType = 'image/gif';
      else if (mimeType.includes('webp')) mediaType = 'image/webp';

      imageContents.push({
        type: 'image_url',
        image_url: {
          url: `data:${mediaType};base64,${base64Data}`,
          detail: 'high',
        },
      });
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
  "currency": "EUR/USD/GBP/PLN etc. or null",
  "isRoundTrip": true/false (true if this booking includes BOTH outbound AND return journey),
  "numberOfPassengers": 1 (count of passengers on this booking),
  "allPassengerNames": "Name1, Name2, Name3" or null (comma-separated if multiple passengers),
  "outboundFlightNumber": "Flight number for outbound journey or null",
  "returnFlightNumber": "Flight number for return journey or null"
}

IMPORTANT - Round-trip detection:
- Look for keywords like "Return", "Round trip", "Hin- und Rückflug", "Retour", two different flight dates
- If you see TWO flights in the booking (outbound AND return), set isRoundTrip to true
- For round-trips, fromLocation/toLocation should be the OUTBOUND journey
- Set both outboundFlightNumber and returnFlightNumber if visible

IMPORTANT - Multi-passenger detection:
- Count how many passengers are listed on the booking
- If more than 1 passenger, list all their names in allPassengerNames
- The amount should be the TOTAL price for ALL passengers

Extract real values only - use null if not visible.
For station names like "Rotterdam C." or "Eindhoven C." use just the city name (Rotterdam, Eindhoven).
For "Instaphalte: Airport" type entries, use the actual location (e.g., Eindhoven Airport).
REMEMBER: European dates are DD/MM/YYYY - day first, then month!`;

    try {
      console.log(`[Consolidation] Using OpenAI ${this.model} for document extraction`);

      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              ...imageContents,
              { type: 'text', text: prompt },
            ],
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
          // Round-trip and multi-passenger detection
          isRoundTrip: parsed.isRoundTrip || false,
          numberOfPassengers: parsed.numberOfPassengers || null,
          allPassengerNames: parsed.allPassengerNames || null,
          outboundFlightNumber: parsed.outboundFlightNumber || null,
          returnFlightNumber: parsed.returnFlightNumber || null,
          rawAiResponse: responseText,
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
          // Round-trip and multi-passenger detection
          isRoundTrip: parsed.isRoundTrip || false,
          numberOfPassengers: parsed.numberOfPassengers || null,
          allPassengerNames: parsed.allPassengerNames || null,
          outboundFlightNumber: parsed.outboundFlightNumber || null,
          returnFlightNumber: parsed.returnFlightNumber || null,
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

    const extractions = participant.documents
      .filter((d: { extraction: unknown }) => d.extraction)
      .map((d: { id: string; extraction: unknown }) => ({
        ...(d.extraction as Record<string, unknown>),
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
    const extractionSummary = extractions.map((e: Record<string, unknown>, i: number) => {
      const ext = e as {
        documentId: string;
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
      };
      return {
        docIndex: i + 1,
        documentId: ext.documentId,
        type: ext.detectedDocumentType,
        passenger: ext.passengerName,
        from: ext.fromLocation,
        to: ext.toLocation,
        departureDate: ext.departureDate?.toISOString().split('T')[0],
        purchaseDate: ext.purchaseDate?.toISOString().split('T')[0],
        flightNumber: ext.flightNumber,
        bookingRef: ext.bookingReference,
        amount: ext.amount,
        currency: ext.currency,
        // Round-trip and multi-passenger info
        isRoundTrip: ext.isRoundTrip || false,
        numberOfPassengers: ext.numberOfPassengers || 1,
        allPassengerNames: ext.allPassengerNames || null,
        outboundFlightNumber: ext.outboundFlightNumber || null,
        returnFlightNumber: ext.returnFlightNumber || null,
      };
    });

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
1. DETECT THE ACTUAL HOME COUNTRY: Analyze ALL travel documents to determine which country the participant actually traveled FROM. Look for:
   - Where does the return journey end? (This is likely their home country)
   - What is the first origin and final destination across all documents?
   - Multi-leg journeys: the TRUE home might not be the first city (e.g., someone might take a train from a small city to an airport in another city, then fly)
   - Round-trip flights: the origin is their home
   - Be smart about connecting flights or trains - the home country is where the COMPLETE journey starts and ends

2. Understand the complete journey: The participant traveled from their home country to the project location and back.
3. Link related documents: Match boarding passes to their flight invoices using booking references, flight numbers, or matching routes.
4. Create travel items: Each distinct travel segment (e.g., outbound flight, return flight) should be a separate travel item.
5. Identify issues: Flag any warnings (name mismatches, missing documents, conflicting data).

CRITICAL DATE PARSING:
- Documents may contain dates in EUROPEAN format (DD/MM/YYYY or DD.MM.YYYY) - day comes FIRST!
- Dates may include day names and abbreviated months (e.g., "petak, 21. stu 2025." = Friday, November 21, 2025)
- ABBREVIATED MONTHS (critical for tickets): Croatian: sij=Jan, velj=Feb, ozu=Mar, tra=Apr, svi=May, lip=Jun, srp=Jul, kol=Aug, ruj=Sep, lis=Oct, stu=Nov, pro=Dec
- Full Croatian months: siječanj, veljača, ožujak, travanj, svibanj, lipanj, srpanj, kolovoz, rujan, listopad, studeni, prosinac
- German months: Jan/Januar, Feb/Februar, Mär/März, Apr/April, Mai, Jun/Juni, Jul/Juli, Aug/August, Sep/September, Okt/Oktober, Nov/November, Dez/Dezember
- Always output dates in YYYY-MM-DD format

WARNING RULES - BE VERY SELECTIVE:
- Travel dates BEFORE project start and AFTER project end are COMPLETELY NORMAL - participants travel TO the event and BACK home
- Do NOT warn about travel being before/after the project period unless it's MORE THAN 30 DAYS outside
- Do NOT generate explanatory warnings like "appears to be returning home" - just process the data silently
- Do NOT warn about round-trip bookings needing boarding passes (the UI shows this already)
- ONLY generate warnings for ACTUAL PROBLEMS that need participant action:
  * Name on ticket doesn't match participant name
  * Multi-passenger booking needs portion specified
  * Amount is 0 or missing
  * Location couldn't be determined (shows as Unknown)
- Keep warnings SHORT and ACTIONABLE, not explanatory

IMPORTANT RULES:
- Boarding pass dates are ALWAYS departure dates (when the person flew)
- Invoice/booking dates might be purchase dates OR departure dates - use context to determine
- If multiple documents exist for the SAME trip (e.g., Omio receipt + FlixBus ticket, or booking confirmation + boarding pass), use the HIGHEST price - that's what they actually paid including booking fees
- If a boarding pass and invoice have the same route/flight, they are the SAME trip - combine into ONE travel item
- Verify passenger name matches participant name (flag if different)
- Each leg of the journey should be ONE travel item (don't duplicate for boarding pass + invoice)
- Train receipts and tickets for the same journey should be combined - use the receipt amount as it's what was paid

ROUND-TRIP HANDLING:
- If a document has isRoundTrip=true, it contains BOTH outbound AND return flights in ONE booking
- Create ONE travel item with the TOTAL price (do NOT split into two items)
- Set isRoundTrip to true on the travel item
- The fromLocation/toLocation should be the OUTBOUND journey (home country to project country)
- Do NOT add a warning for round-trips (the UI already shows this information on the travel item)
- Keep priceAllocation at 1.0 (full price)

MULTI-PASSENGER HANDLING:
- If numberOfPassengers > 1, this booking covers multiple people
- Set numberOfPassengers on the travel item
- The amount stays as the TOTAL (don't divide) - participant will specify their portion later
- Add a warning like "Multi-passenger booking (X passengers) - participant needs to specify their portion"

Respond with ONLY a JSON object:
{
  "journey_summary": "Brief description of the understood journey",
  "detected_home_country": "Country name (e.g., 'Hungary', 'Netherlands') - the country where the participant's journey truly starts and ends",
  "home_country_confidence": 0.0-1.0,
  "home_country_reasoning": "Brief explanation of how you determined the home country (e.g., 'Return flight ends in Budapest, Hungary' or 'Round-trip booking originates from Warsaw, Poland')",
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
      "notes": "Any relevant notes about this leg",
      "isRoundTrip": false,
      "numberOfPassengers": 1
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
    const validDocumentIds = new Set(participant.documents.map((d: { id: string }) => d.id));

    try {
      console.log(`[Consolidation] Using OpenAI ${this.model} for journey consolidation`);

      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
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
      const existingSignatures = existingItems.map((item: { id: string; fromLocation: string; toLocation: string; departureDate: Date }) => ({
        id: item.id,
        signature: `${item.fromLocation.toLowerCase()}-${item.toLocation.toLowerCase()}-${item.departureDate.toISOString().split('T')[0]}`,
        item,
      }));

      console.log(`[Consolidation] Found ${existingItems.length} existing travel items to preserve`);

      // Create new travel items based on consolidation
      const createdItems = [];
      for (const item of result.travel_items || []) {
        // Check if this matches ANY existing item (same route and date)
        const itemSignature = `${(item.fromLocation || 'unknown').toLowerCase()}-${(item.toLocation || 'unknown').toLowerCase()}-${item.departureDate || ''}`;
        const existingMatch = existingSignatures.find(
          (existing: { signature: string; item: { fromLocation: string; toLocation: string } }) => existing.signature === itemSignature ||
            // Fuzzy match: same locations but possibly different date format
            (existing.item.fromLocation.toLowerCase().includes(item.fromLocation?.toLowerCase() || '') &&
             existing.item.toLocation.toLowerCase().includes(item.toLocation?.toLowerCase() || ''))
        );

        if (existingMatch) {
          // Skip creating this item - we're preserving the existing version
          console.log(`[Consolidation] Preserving existing travel item: ${itemSignature}`);
          createdItems.push(existingMatch.item);
          continue;
        }
        // Find valid documents to link - only use IDs that actually exist
        const linkedDocs = (item.linkedDocumentIds || []) as string[];
        const validLinkedDocs: string[] = [];

        // Process all linked document references
        for (const docRef of linkedDocs) {
          if (validDocumentIds.has(docRef)) {
            // It's a valid UUID directly
            validLinkedDocs.push(docRef);
          } else {
            // Check if it's a numeric reference like "1" or "doc-1"
            const match = docRef.match(/(\d+)/);
            if (match) {
              const index = parseInt(match[1], 10) - 1; // AI uses 1-based indexing
              if (index >= 0 && index < participant.documents.length) {
                const resolvedId = participant.documents[index].id;
                if (!validLinkedDocs.includes(resolvedId)) {
                  validLinkedDocs.push(resolvedId);
                }
              }
            }
          }
        }

        // First valid doc is primary, rest are additional
        const primaryDocId: string | null = validLinkedDocs.length > 0 ? validLinkedDocs[0] : null;
        const additionalDocIds = validLinkedDocs.slice(1);

        // Get currency - ALWAYS prefer document extraction's currency as source of truth
        // The AI consolidation may incorrectly default to EUR
        let currency: string | null = null;
        if (primaryDocId) {
          // Look up the document's extraction to get the currency
          const docExtraction = await prisma.documentExtraction.findUnique({
            where: { documentId: primaryDocId },
          });
          if (docExtraction?.currency) {
            currency = docExtraction.currency;
            console.log(`[Consolidation] Using currency ${currency} from document extraction for ${item.fromLocation} -> ${item.toLocation}`);
          }
        }
        // Fall back to AI response currency, then EUR
        if (!currency) {
          currency = (item.currency as string) || 'EUR';
        }

        // Get the full amount (no price allocation splitting)
        const baseAmount = item.amount || 0;

        // Convert currency to EUR
        let amountEur = baseAmount;
        if (currency !== 'EUR') {
          amountEur = this.convertToEur(baseAmount, currency);
        }

        const travelItem = await prisma.travelItem.create({
          data: {
            participantId,
            documentId: primaryDocId, // Will be null if no valid document found
            additionalDocumentIds: additionalDocIds.length > 0 ? JSON.stringify(additionalDocIds) : null,
            modeOfTransport: this.mapTransportMode(item.modeOfTransport),
            fromLocation: item.fromLocation || 'Unknown',
            toLocation: item.toLocation || 'Unknown',
            departureDate: item.departureDate ? new Date(item.departureDate) : new Date(),
            arrivalDate: item.arrivalDate ? new Date(item.arrivalDate) : null,
            bookingReference: item.bookingReference || null,
            flightNumber: item.flightNumber || null,
            amountOriginal: baseAmount,
            currencyOriginal: currency, // Use currency from AI or document extraction
            purchaseDate: item.purchaseDate ? new Date(item.purchaseDate) : null,
            amountEur,
            comment: item.notes || null,
            manuallyEdited: false,
            originalAmountFromAi: baseAmount, // Store original AI-detected amount
            // Round-trip flag
            isRoundTrip: item.isRoundTrip || false,
            // Multi-passenger bookings
            numberOfPassengers: item.numberOfPassengers || null,
          },
        });

        createdItems.push(travelItem);
      }

      // Include any existing items that weren't matched by AI (they're still in DB)
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

      // Update participant consolidation timestamp and detected home country
      await prisma.participant.update({
        where: { id: participantId },
        data: {
          journeyConsolidatedAt: new Date(),
          detectedHomeCountry: result.detected_home_country || null,
          homeCountryConfidence: result.home_country_confidence || null,
          homeCountryReasoning: result.home_country_reasoning || null,
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
        warnings: result.warnings || [],
        missingDocuments: result.missing_documents || [],
        documentLinks: result.document_links || [],
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
  detectedHomeCountry?: string | null;
  homeCountryConfidence?: number | null;
  homeCountryReasoning?: string | null;
}

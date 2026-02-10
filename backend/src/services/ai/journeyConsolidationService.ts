import OpenAI from 'openai';
import sharp from 'sharp';
import prisma from '../../utils/prisma.js';
import { DocumentType, TransportMode } from './types.js';

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

    const prompt = `You are analyzing a travel document for Erasmus+ reimbursement.

IMAGE QUALITY NOTE:
This may be a PHOTO of a physical receipt or ticket (not a digital document). Photos can be blurry, tilted, low contrast, or show crumpled paper. TRY YOUR BEST to extract information even from poor quality images.

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

MONTH NAMES - Full AND ABBREVIATED forms:
  * Croatian: siječanj, veljača, ožujak, travanj, svibanj, lipanj, srpanj, kolovoz, rujan, listopad, studeni, prosinac
  * Croatian abbreviated: sij=Jan, velj=Feb, ozu=Mar, tra=Apr, svi=May, lip=Jun, srp=Jul, kol=Aug, ruj=Sep, lis=Oct, stu=Nov, pro=Dec
  * German: Januar, Februar, März, April, Mai, Juni, Juli, August, September, Oktober, November, Dezember
  * Dutch: januari, februari, maart, april, mei, juni, juli, augustus, september, oktober, november, december

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
  "documentType": "FLIGHT_INVOICE" | "FLIGHT_BOARDING_PASS" | "TRAIN_TICKET" | "BUS_TICKET" | "BANK_TRANSACTION" | "FUEL_RECEIPT" | "GREEN_TRAVEL_DECLARATION" | "OTHER",
  "confidence": 0.0-1.0,
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
  "returnDepartureDate": "YYYY-MM-DD for return flight or null"
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
      console.log(`[Consolidation] Using OpenAI ${this.model} for document extraction`);

      const response = await this.client.chat.completions.create({
        model: this.model,
        max_completion_tokens: 1500,
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
          merchantName: parsed.merchantName || null,
          amount: parsed.amount || null,
          currency: parsed.currency || null,
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
          merchantName: parsed.merchantName || null,
          amount: parsed.amount || null,
          currency: parsed.currency || null,
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
        documentId: d.id,
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
        merchantName?: string;
        busCompany?: string;
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
        isRoundTrip: ext.isRoundTrip || false,
        numberOfPassengers: ext.numberOfPassengers || 1,
        allPassengerNames: ext.allPassengerNames || null,
        outboundFlightNumber: ext.outboundFlightNumber || null,
        returnFlightNumber: ext.returnFlightNumber || null,
        merchantName: ext.merchantName || ext.busCompany || null,
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

=== CRITICAL RULES - DO NOT VIOLATE ===

RULE 1: DO NOT INVENT ROUTES OR SEGMENTS
- Each travel_item MUST correspond to exactly ONE ticket, boarding pass, or explicitly documented journey segment
- NEVER create synthetic routes that don't appear on any document
- NEVER combine multiple tickets into a new imaginary route
- If a document contains multiple tickets (e.g., a train journey with 2 segments), create SEPARATE travel items for EACH segment

RULE 2: DO NOT INVENT PRICES
- Only use prices that are EXPLICITLY stated in uploaded documents
- If no price is found in ANY document for a travel item, set amount to null
- NEVER use 0 as a placeholder for unknown prices (0 means actually free)
- NEVER estimate or calculate prices that aren't documented
- If summing prices, the sum must equal the exact total of documented individual prices

RULE 3: ROUND-TRIP BOOKINGS - SEPARATE LEGS
When a booking is marked isRoundTrip=true:
- Create TWO separate travel_items: one for outbound, one for return
- Link both to the same booking object via bookingReference
- For PRICE handling on round-trips:
  * If only a TOTAL booking price is known (no per-leg prices): set amount=null on EACH leg, and create a booking entry
  * If per-leg prices are explicitly documented: use those prices on each leg
- Set priceEditable=false on legs if only total booking price exists

RULE 4: PRICE RESOLUTION ACROSS DOCUMENTS
For each travel item, search ALL documents for a matching price:
- Match by: booking reference, flight number, or route+date
- If a flight leg has no price but an itinerary/invoice has the total booking price, note this in the booking
- If a ticket has a price on a separate bank transaction, link them and use that price
- Record priceSourceDocId to show which document provided the price

RULE 5: BANK TRANSACTIONS ARE NOT TRAVEL ITEMS
- BANK_TRANSACTION documents should ONLY provide price information
- Link them to the corresponding ticket via document_links
- NEVER create a travel item from a bank transaction alone
- If a bank transaction cannot be matched to any ticket, note it in unmatched_payments

RULE 6: MULTI-TICKET DOCUMENTS
If one document (e.g., train booking) contains multiple ticket segments:
- Create a SEPARATE travel_item for EACH segment
- Each segment has its own from, to, date, and amount
- If the document shows a total price and individual segment prices, use the individual prices
- If only a total is shown, split proportionally OR set individual amounts to null and note the total

RULE 7: AMOUNT HANDLING
- null = price is unknown (could not find in any document)
- 0 = price is explicitly zero (free travel, promo, etc.)
- NEVER use 0 as a substitute for null

=== OUTPUT FORMAT ===

Respond with ONLY a JSON object:
{
  "journey_summary": "Brief description of the actual documented journey",
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
      "linkedDocumentIds": ["doc-id-1", "doc-id-3"]
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
      "amount": 123.45 or null (ONLY if explicitly documented, otherwise null),
      "currency": "EUR",
      "priceEditable": true or false (false if part of round-trip with only total price),
      "priceMissing": true or false (true if no price found anywhere),
      "priceSourceDocId": "doc-id that provided the price, or null",
      "purchaseDate": "YYYY-MM-DD or null",
      "linkedDocumentIds": ["doc-id-1"],
      "numberOfPassengers": 1
    }
  ],

  "document_links": [
    {
      "ticketDocId": "doc-id-for-ticket",
      "paymentDocId": "doc-id-for-payment",
      "reason": "Matching merchant name and date"
    }
  ],

  "unmatched_payments": [
    {
      "docId": "doc-id",
      "merchantName": "UNKNOWN MERCHANT",
      "amount": 50.00,
      "reason": "Could not match to any ticket"
    }
  ],

  "warnings": ["Only actionable issues - missing boarding pass, name mismatch, etc."],

  "missing_documents": [
    {
      "type": "FLIGHT_BOARDING_PASS",
      "description": "Missing boarding pass for return flight Zagreb→Charleroi on 2025-11-30"
    }
  ]
}

=== DATE PARSING ===
- European format: DD/MM/YYYY or DD.MM.YYYY - day comes FIRST!
- Abbreviated months: Croatian: sij=Jan, velj=Feb, ozu=Mar, tra=Apr, svi=May, lip=Jun, srp=Jul, kol=Aug, ruj=Sep, lis=Oct, stu=Nov, pro=Dec
- Always output in YYYY-MM-DD format

=== WARNING RULES ===
Only warn about ACTIONABLE problems:
- Name mismatch between ticket and participant
- Multi-passenger booking needs portion specified
- Missing boarding pass for a documented flight
- Price truly missing (priceMissing=true)

Do NOT warn about:
- Travel dates before/after project (normal for travel to/from)
- Round-trip structure (UI handles this)
- Explanatory messages`;

    // Build a set of valid document IDs for this participant
    const validDocumentIds = new Set(participant.documents.map((d: { id: string }) => d.id));

    try {
      console.log(`[Consolidation] Using OpenAI ${this.model} for journey consolidation`);

      const response = await this.client.chat.completions.create({
        model: this.model,
        max_completion_tokens: 3000,
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

      // Helper to resolve document IDs (handles both actual IDs and index references like "doc-1")
      const resolveDocumentId = (docRef: string): string | null => {
        if (validDocumentIds.has(docRef)) {
          return docRef;
        }
        const match = docRef.match(/(\d+)/);
        if (match) {
          const index = parseInt(match[1], 10) - 1;
          if (index >= 0 && index < participant.documents.length) {
            return participant.documents[index].id;
          }
        }
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
          ? this.convertToEur(totalAmount, currency)
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
        // Check if this matches ANY existing item (same route and date)
        const itemSignature = `${(item.fromLocation || 'unknown').toLowerCase()}-${(item.toLocation || 'unknown').toLowerCase()}-${item.departureDate || ''}`;
        const existingMatch = existingSignatures.find(
          (existing: { signature: string; item: { fromLocation: string; toLocation: string } }) => existing.signature === itemSignature ||
            (existing.item.fromLocation.toLowerCase().includes(item.fromLocation?.toLowerCase() || '') &&
             existing.item.toLocation.toLowerCase().includes(item.toLocation?.toLowerCase() || ''))
        );

        if (existingMatch) {
          console.log(`[Consolidation] Preserving existing travel item: ${itemSignature}`);
          createdItems.push(existingMatch.item);
          continue;
        }

        // Find valid documents to link
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
        let amountEur: number | null = baseAmount;
        if (baseAmount !== null && currency !== 'EUR') {
          amountEur = this.convertToEur(baseAmount, currency);
        }

        // Resolve price source document ID
        const priceSourceDocId = item.priceSourceDocId ? resolveDocumentId(item.priceSourceDocId) : null;

        // Link to booking if bookingReference matches
        const bookingId = item.bookingReference ? bookingIdMap.get(item.bookingReference) || null : null;

        const travelItem = await prisma.travelItem.create({
          data: {
            participantId,
            documentId: primaryDocId,
            additionalDocumentIds: additionalDocIds.length > 0 ? JSON.stringify(additionalDocIds) : null,
            bookingId: bookingId,
            modeOfTransport: this.mapTransportMode(item.modeOfTransport),
            fromLocation: item.fromLocation || 'Unknown',
            toLocation: item.toLocation || 'Unknown',
            departureDate: item.departureDate ? new Date(item.departureDate) : new Date(),
            arrivalDate: item.arrivalDate ? new Date(item.arrivalDate) : null,
            bookingReference: item.bookingReference || null,
            flightNumber: item.flightNumber || null,
            amountOriginal: baseAmount,
            currencyOriginal: currency,
            purchaseDate: item.purchaseDate ? new Date(item.purchaseDate) : null,
            amountEur: amountEur,
            comment: item.notes || null,
            manuallyEdited: false,
            originalAmountFromAi: baseAmount,
            priceEditable: item.priceEditable !== false, // Default to true
            priceMissing: item.priceMissing === true,
            priceSourceDocId: priceSourceDocId,
            isRoundTrip: false, // Individual legs are not round-trips; the booking is
            numberOfPassengers: item.numberOfPassengers || null,
          },
        });

        console.log(`[Consolidation] Created travel item: ${item.fromLocation} -> ${item.toLocation}, amount: ${baseAmount ?? 'null'} ${currency}, priceMissing: ${item.priceMissing}`);
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
        bookings: result.bookings || [],
        warnings: result.warnings || [],
        missingDocuments: result.missing_documents || [],
        documentLinks: result.document_links || [],
        unmatchedPayments: result.unmatched_payments || [],
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
  bookings?: unknown[];
  warnings: string[];
  missingDocuments?: { type: string; description: string }[];
  documentLinks?: { ticketDocId: string; paymentDocId: string; reason: string }[];
  unmatchedPayments?: { docId: string; merchantName: string; amount: number; reason: string }[];
  detectedHomeCountry?: string | null;
  homeCountryConfidence?: number | null;
  homeCountryReasoning?: string | null;
}

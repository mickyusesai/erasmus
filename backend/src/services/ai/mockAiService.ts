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

/**
 * Mock AI Service for development
 * Uses simple pattern matching and deterministic logic
 * Replace with real OCR/AI provider in production
 *
 * Integration points for real implementation:
 * 1. analyzeDocument: Call OCR service (Google Vision, AWS Textract, Azure Form Recognizer)
 * 2. Extract text and use LLM (GPT-4, Claude) to parse travel information
 * 3. convertToEur: Call exchange rate API (ECB, exchangerate-api.com)
 */
export class MockAiService implements TravelDocumentAiService {
  // Mock exchange rates (EUR base)
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

  async analyzeDocument(
    _fileBuffer: Buffer,
    mimeType: string,
    originalFilename: string
  ): Promise<DocumentAnalysisResult> {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    const filename = originalFilename.toLowerCase();
    let documentType = DocumentType.OTHER;
    let confidence = 0.6;
    const extractedItems: ExtractedTravelItem[] = [];
    const warnings: string[] = [];

    // Simple pattern matching for document type detection
    if (filename.includes('boarding') || filename.includes('pass')) {
      documentType = DocumentType.FLIGHT_BOARDING_PASS;
      confidence = 0.85;
    } else if (filename.includes('flight') || filename.includes('plane') || filename.includes('airline')) {
      documentType = DocumentType.FLIGHT_INVOICE;
      confidence = 0.8;
    } else if (filename.includes('train') || filename.includes('rail')) {
      documentType = DocumentType.TRAIN_TICKET;
      confidence = 0.8;
    } else if (filename.includes('bus') || filename.includes('coach')) {
      documentType = DocumentType.BUS_TICKET;
      confidence = 0.75;
    } else if (filename.includes('fuel') || filename.includes('gas') || filename.includes('petrol')) {
      documentType = DocumentType.FUEL_RECEIPT;
      confidence = 0.8;
    } else if (filename.includes('green') || filename.includes('declaration')) {
      documentType = DocumentType.GREEN_TRAVEL_DECLARATION;
      confidence = 0.7;
    }

    // Generate mock OCR text
    const ocrText = this.generateMockOcrText(documentType, originalFilename);

    // Extract mock travel item based on document type
    if (documentType !== DocumentType.OTHER && documentType !== DocumentType.GREEN_TRAVEL_DECLARATION) {
      const mockItem = this.createMockTravelItem(documentType);
      extractedItems.push(mockItem);
    }

    // Generate suggested filename
    const suggestedFilename = this.generateFilename(
      documentType,
      extractedItems[0] || {},
      originalFilename
    );

    // Add warnings for common issues
    if (!mimeType.includes('pdf') && !mimeType.includes('image')) {
      warnings.push('File format may not be ideal for document processing');
    }

    return {
      documentType,
      confidence,
      ocrText,
      suggestedFilename,
      extractedTravelItems: extractedItems,
      warnings,
    };
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
          (doc) => doc.documentType === DocumentType.FLIGHT_BOARDING_PASS
        );
        const hasDeclaration = participant.declarationsOnHonor.some(
          (dec) => dec.missingDocumentType === DocumentType.FLIGHT_BOARDING_PASS
        );

        if (!hasBoardingPass && !hasDeclaration) {
          missingItems.push({
            type: 'document',
            description: 'Boarding pass or declaration on honor required for flight',
            documentType: DocumentType.FLIGHT_BOARDING_PASS,
          });
        }
      }

      // Check for invoice/ticket
      if (item.modeOfTransport === TransportMode.PLANE) {
        const hasInvoice = participant.documents.some(
          (doc) => doc.documentType === DocumentType.FLIGHT_INVOICE
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

    // Calculate total EUR
    let totalEur = 0;
    for (const item of participant.travelItems) {
      totalEur += item.amountEur;
    }

    // Get max reimbursement for participant's country
    const countryLimit = participant.project.countryLimits.find(
      (limit) => limit.country === participant.country
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
    _purchaseDate?: Date
  ): Promise<number> {
    // TODO: Replace with real exchange rate API
    // For production, use ECB rates or a service like exchangerate-api.com
    // The purchase date would be used to get the historical rate

    const rate = this.exchangeRates[currency.toUpperCase()];
    if (!rate) {
      console.warn(`Unknown currency: ${currency}, using 1:1 rate`);
      return amount;
    }

    return Math.round(amount * rate * 100) / 100;
  }

  private generateMockOcrText(documentType: DocumentType, filename: string): string {
    // Generate realistic-looking mock OCR text based on document type
    const baseText = `Document: ${filename}\nProcessed: ${new Date().toISOString()}\n\n`;

    switch (documentType) {
      case DocumentType.FLIGHT_INVOICE:
        return (
          baseText +
          `FLIGHT BOOKING CONFIRMATION\n` +
          `Booking Reference: ABC123\n` +
          `Passenger: John Doe\n` +
          `Route: Amsterdam (AMS) → Barcelona (BCN)\n` +
          `Date: 15 Sep 2026\n` +
          `Flight: KL1234\n` +
          `Total: EUR 175.50`
        );

      case DocumentType.FLIGHT_BOARDING_PASS:
        return (
          baseText +
          `BOARDING PASS\n` +
          `Name: DOE/JOHN\n` +
          `Flight: KL1234\n` +
          `From: AMS\n` +
          `To: BCN\n` +
          `Date: 15SEP\n` +
          `Seat: 14A\n` +
          `Gate: D42`
        );

      case DocumentType.TRAIN_TICKET:
        return (
          baseText +
          `TRAIN TICKET\n` +
          `Passenger: John Doe\n` +
          `Route: Warsaw → Berlin\n` +
          `Date: 12 Sep 2026\n` +
          `Train: IC123\n` +
          `Price: PLN 180.00`
        );

      case DocumentType.BUS_TICKET:
        return (
          baseText +
          `BUS TICKET\n` +
          `Passenger: John Doe\n` +
          `Route: Prague → Vienna\n` +
          `Date: 10 Sep 2026\n` +
          `Price: EUR 25.00`
        );

      case DocumentType.FUEL_RECEIPT:
        return (
          baseText +
          `FUEL RECEIPT\n` +
          `Station: Shell Praha\n` +
          `Date: 11 Sep 2026\n` +
          `Fuel: Diesel 45L\n` +
          `Total: CZK 2150.00`
        );

      default:
        return baseText + `[Document content would be extracted here by OCR]`;
    }
  }

  private createMockTravelItem(documentType: DocumentType): ExtractedTravelItem {
    const now = new Date();
    const departureDate = new Date(now.setDate(now.getDate() + 30));

    switch (documentType) {
      case DocumentType.FLIGHT_INVOICE:
      case DocumentType.FLIGHT_BOARDING_PASS:
        return {
          modeOfTransport: TransportMode.PLANE,
          fromLocation: 'Amsterdam',
          toLocation: 'Barcelona',
          departureDate,
          arrivalDate: new Date(departureDate.getTime() + 2 * 60 * 60 * 1000),
          bookingReference: 'ABC123',
          flightNumber: 'KL1234',
          amountOriginal: 175.5,
          currencyOriginal: 'EUR',
        };

      case DocumentType.TRAIN_TICKET:
        return {
          modeOfTransport: TransportMode.TRAIN,
          fromLocation: 'Warsaw',
          toLocation: 'Berlin',
          departureDate,
          arrivalDate: new Date(departureDate.getTime() + 5 * 60 * 60 * 1000),
          amountOriginal: 180,
          currencyOriginal: 'PLN',
          purchaseDate: new Date(),
        };

      case DocumentType.BUS_TICKET:
        return {
          modeOfTransport: TransportMode.BUS,
          fromLocation: 'Prague',
          toLocation: 'Vienna',
          departureDate,
          arrivalDate: new Date(departureDate.getTime() + 4 * 60 * 60 * 1000),
          amountOriginal: 25,
          currencyOriginal: 'EUR',
        };

      case DocumentType.FUEL_RECEIPT:
        return {
          modeOfTransport: TransportMode.CAR,
          fromLocation: 'Prague',
          toLocation: 'Barcelona',
          departureDate,
          amountOriginal: 2150,
          currencyOriginal: 'CZK',
          purchaseDate: new Date(),
        };

      default:
        return {
          modeOfTransport: TransportMode.OTHER,
          fromLocation: 'Unknown',
          toLocation: 'Unknown',
          departureDate,
          amountOriginal: 0,
          currencyOriginal: 'EUR',
        };
    }
  }
}

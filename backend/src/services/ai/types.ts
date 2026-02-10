/**
 * AI Document Processing Service Interface
 * Abstraction layer for OCR and AI-based document analysis
 * Can be implemented with different providers (Google Vision, AWS Textract, OpenAI, etc.)
 */

// Define enums locally to avoid Prisma generation issues during build
export const DocumentType = {
  FLIGHT_INVOICE: 'FLIGHT_INVOICE',
  FLIGHT_BOARDING_PASS: 'FLIGHT_BOARDING_PASS',
  TRAIN_TICKET: 'TRAIN_TICKET',
  BUS_TICKET: 'BUS_TICKET',
  FUEL_RECEIPT: 'FUEL_RECEIPT',
  GREEN_TRAVEL_DECLARATION: 'GREEN_TRAVEL_DECLARATION',
  HOTEL_INVOICE: 'HOTEL_INVOICE',
  BANK_TRANSACTION: 'BANK_TRANSACTION',
  OTHER: 'OTHER',
} as const;
export type DocumentType = typeof DocumentType[keyof typeof DocumentType];

export const TransportMode = {
  PLANE: 'PLANE',
  TRAIN: 'TRAIN',
  BUS: 'BUS',
  CAR: 'CAR',
  FERRY: 'FERRY',
  OTHER: 'OTHER',
} as const;
export type TransportMode = typeof TransportMode[keyof typeof TransportMode];

export interface ExtractedTravelItem {
  modeOfTransport: TransportMode;
  fromLocation: string;
  toLocation: string;
  departureDate: Date;
  arrivalDate?: Date;
  bookingReference?: string;
  flightNumber?: string;
  amountOriginal: number;
  currencyOriginal: string;
  purchaseDate?: Date;
}

export interface DocumentAnalysisResult {
  documentType: DocumentType;
  confidence: number;
  ocrText: string;
  suggestedFilename: string;
  extractedTravelItems: ExtractedTravelItem[];
  warnings: string[];
  // Round-trip and multi-passenger detection
  isRoundTrip?: boolean;
  numberOfPassengers?: number;
  allPassengerNames?: string;
  outboundFlightNumber?: string;
  returnFlightNumber?: string;
}

export interface ReimbursementValidation {
  isComplete: boolean;
  missingItems: MissingItem[];
  warnings: string[];
  aiCheckPassed: boolean;
}

export interface MissingItem {
  type: 'document' | 'field' | 'data';
  description: string;
  travelItemId?: string;
  documentType?: DocumentType;
}

export interface TravelDocumentAiService {
  /**
   * Analyze an uploaded document and extract travel information
   * This is where OCR and AI processing would happen
   */
  analyzeDocument(
    fileBuffer: Buffer,
    mimeType: string,
    originalFilename: string
  ): Promise<DocumentAnalysisResult>;

  /**
   * Generate a human-readable filename based on document content
   */
  generateFilename(
    documentType: DocumentType,
    extractedData: Partial<ExtractedTravelItem>,
    originalFilename: string
  ): string;

  /**
   * Validate that all required documents and data are present
   */
  validateReimbursement(participantId: string): Promise<ReimbursementValidation>;

  /**
   * Recalculate and update the reimbursement summary for a participant
   */
  recalculateParticipantSummary(participantId: string): Promise<void>;

  /**
   * Convert amount to EUR using exchange rate
   * TODO: Integrate with real exchange rate API
   */
  convertToEur(
    amount: number,
    currency: string,
    purchaseDate?: Date
  ): Promise<number>;
}

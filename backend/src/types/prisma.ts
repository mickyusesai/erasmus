// Local type definitions for Prisma models
// These should match the definitions in prisma/schema.prisma

export enum ParticipantStatus {
  DRAFT = 'DRAFT',
  PARTICIPANT_COMPLETE = 'PARTICIPANT_COMPLETE',
  ADMIN_APPROVED = 'ADMIN_APPROVED',
  PAID = 'PAID',
}

export enum TransportMode {
  PLANE = 'PLANE',
  TRAIN = 'TRAIN',
  BUS = 'BUS',
  CAR = 'CAR',
  FERRY = 'FERRY',
  OTHER = 'OTHER',
}

export enum DocumentType {
  FLIGHT_INVOICE = 'FLIGHT_INVOICE',
  FLIGHT_BOARDING_PASS = 'FLIGHT_BOARDING_PASS',
  TRAIN_TICKET = 'TRAIN_TICKET',
  BUS_TICKET = 'BUS_TICKET',
  FUEL_RECEIPT = 'FUEL_RECEIPT',
  GREEN_TRAVEL_DECLARATION = 'GREEN_TRAVEL_DECLARATION',
  HOTEL_INVOICE = 'HOTEL_INVOICE',
  OTHER = 'OTHER',
}

export interface Participant {
  id: string;
  projectId: string;
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  status: ParticipantStatus;
  magicLinkToken: string;
  lastMagicLinkSentAt?: Date | null;
  bankAccountIban?: string | null;
  bankAccountHolderName?: string | null;
  bankAccountBic?: string | null;
  notesInternal?: string | null;
  participantNote?: string | null;
  maxReimbursementForCountry?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

-- AlterEnum: Add LUGGAGE_INVOICE to DocumentType
ALTER TYPE "DocumentType" ADD VALUE 'LUGGAGE_INVOICE';

-- AlterTable: Add luggage fields to TravelItem
ALTER TABLE "TravelItem" ADD COLUMN "luggageAmount" DOUBLE PRECISION;
ALTER TABLE "TravelItem" ADD COLUMN "luggageAmountEur" DOUBLE PRECISION;
ALTER TABLE "TravelItem" ADD COLUMN "luggageDocumentId" TEXT;

-- AlterTable: Add consolidation notes to TravelItem
ALTER TABLE "TravelItem" ADD COLUMN "consolidationNotes" TEXT;

-- AlterTable: Add consolidation summary to Participant
ALTER TABLE "Participant" ADD COLUMN "consolidationSummary" TEXT;

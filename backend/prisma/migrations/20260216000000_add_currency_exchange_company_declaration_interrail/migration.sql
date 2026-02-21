-- AlterEnum: Add INTERRAIL_PASS to DocumentType
ALTER TYPE "DocumentType" ADD VALUE 'INTERRAIL_PASS';

-- AlterTable: Add new fields to TravelItem
ALTER TABLE "TravelItem" ADD COLUMN "originalCurrencyFromAi" TEXT;
ALTER TABLE "TravelItem" ADD COLUMN "exchangeRateOverride" DOUBLE PRECISION;
ALTER TABLE "TravelItem" ADD COLUMN "companyName" TEXT;

-- AlterTable: Add new fields to DeclarationOfTravel
ALTER TABLE "DeclarationOfTravel" ADD COLUMN "isCarTravel" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DeclarationOfTravel" ADD COLUMN "licensePlate" TEXT;
ALTER TABLE "DeclarationOfTravel" ADD COLUMN "driverName" TEXT;
ALTER TABLE "DeclarationOfTravel" ADD COLUMN "reason" TEXT;

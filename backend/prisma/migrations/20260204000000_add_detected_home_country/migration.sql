-- AlterTable
ALTER TABLE "Participant" ADD COLUMN "detectedHomeCountry" TEXT;
ALTER TABLE "Participant" ADD COLUMN "homeCountryConfidence" DOUBLE PRECISION;
ALTER TABLE "Participant" ADD COLUMN "homeCountryReasoning" TEXT;

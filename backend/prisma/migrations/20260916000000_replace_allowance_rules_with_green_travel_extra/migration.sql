-- Remove the allowance-rules feature
DROP TABLE IF EXISTS "ParticipantAllowanceReceipt";
DROP TABLE IF EXISTS "ParticipantAllowance";
DROP TABLE IF EXISTS "ProjectAllowanceRule";
DROP TYPE IF EXISTS "AllowanceMode";
DROP TYPE IF EXISTS "AllowanceAudience";

-- Organiser-decided green travel extra
ALTER TABLE "ReimbursementSummary" RENAME COLUMN "allowancesEur" TO "greenTravelExtraEur";
ALTER TABLE "Participant"
  ADD COLUMN "greenTravelFoodEur" DOUBLE PRECISION,
  ADD COLUMN "greenTravelAccommodationEur" DOUBLE PRECISION,
  ADD COLUMN "greenTravelExtraNote" TEXT,
  ADD COLUMN "greenTravelExtraUpdatedAt" TIMESTAMP(3);

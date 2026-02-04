-- Add excludedFromReimbursement field to TravelItem
-- Allows users to mark items that should not be included in reimbursement calculations
ALTER TABLE "TravelItem" ADD COLUMN "excludedFromReimbursement" BOOLEAN NOT NULL DEFAULT false;

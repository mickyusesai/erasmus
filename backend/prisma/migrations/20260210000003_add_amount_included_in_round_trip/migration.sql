-- Add amountIncludedInRoundTrip field to TravelItem
-- This field indicates if this is a return leg where the price is included in the outbound leg

ALTER TABLE "TravelItem" ADD COLUMN "amountIncludedInRoundTrip" BOOLEAN NOT NULL DEFAULT false;

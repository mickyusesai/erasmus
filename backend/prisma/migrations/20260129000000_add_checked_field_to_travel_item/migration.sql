-- Add checked field to TravelItem for user confirmation
ALTER TABLE "TravelItem" ADD COLUMN "checked" BOOLEAN NOT NULL DEFAULT false;

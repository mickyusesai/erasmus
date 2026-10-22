-- Per project: how the green travel extra is worked out (MANUAL | RECEIPTS | FIXED) and its limits
ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "greenTravelExtraMode" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "greenTravelFoodPerDayEur" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "greenTravelAccommodationPerNightEur" DOUBLE PRECISION;

-- SHA-256 of each uploaded file, so the same file uploaded twice is kept once
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;
CREATE INDEX IF NOT EXISTS "Document_participantId_contentHash_idx" ON "Document"("participantId", "contentHash");

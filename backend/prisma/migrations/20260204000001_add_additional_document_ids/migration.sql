-- Add additionalDocumentIds field to TravelItem
-- Allows linking multiple documents (invoices, booking confirmations) to the same travel item
ALTER TABLE "TravelItem" ADD COLUMN "additionalDocumentIds" TEXT;

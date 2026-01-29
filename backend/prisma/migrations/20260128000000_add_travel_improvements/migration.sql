-- Add car rate per km to Project
ALTER TABLE "Project" ADD COLUMN "carRatePerKm" DOUBLE PRECISION NOT NULL DEFAULT 0.22;

-- Add round-trip and multi-passenger fields to DocumentExtraction
ALTER TABLE "DocumentExtraction" ADD COLUMN "isRoundTrip" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DocumentExtraction" ADD COLUMN "numberOfPassengers" INTEGER;
ALTER TABLE "DocumentExtraction" ADD COLUMN "allPassengerNames" TEXT;
ALTER TABLE "DocumentExtraction" ADD COLUMN "outboundFlightNumber" TEXT;
ALTER TABLE "DocumentExtraction" ADD COLUMN "returnFlightNumber" TEXT;

-- Add round-trip and price allocation fields to TravelItem
ALTER TABLE "TravelItem" ADD COLUMN "isRoundTrip" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TravelItem" ADD COLUMN "tripGroupId" TEXT;
ALTER TABLE "TravelItem" ADD COLUMN "priceAllocation" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
ALTER TABLE "TravelItem" ADD COLUMN "totalGroupPrice" DOUBLE PRECISION;

-- Add multi-passenger booking fields to TravelItem
ALTER TABLE "TravelItem" ADD COLUMN "numberOfPassengers" INTEGER;
ALTER TABLE "TravelItem" ADD COLUMN "participantPortion" DOUBLE PRECISION;

-- Add car travel specific fields to TravelItem
ALTER TABLE "TravelItem" ADD COLUMN "distanceKm" DOUBLE PRECISION;
ALTER TABLE "TravelItem" ADD COLUMN "isDriverCarpool" BOOLEAN NOT NULL DEFAULT false;

-- Add validation flags to TravelItem
ALTER TABLE "TravelItem" ADD COLUMN "routeMatchesCountry" BOOLEAN;
ALTER TABLE "TravelItem" ADD COLUMN "validationWarnings" TEXT;

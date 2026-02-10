-- CreateTable
CREATE TABLE "TravelBooking" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "bookingReference" TEXT,
    "isRoundTrip" BOOLEAN NOT NULL DEFAULT false,
    "totalAmount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "totalAmountEur" DOUBLE PRECISION,
    "numberOfPassengers" INTEGER,
    "documentIds" TEXT,
    "hasPerLegPrices" BOOLEAN NOT NULL DEFAULT false,
    "priceSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelBooking_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Make amountOriginal and amountEur nullable, add new columns
ALTER TABLE "TravelItem" ALTER COLUMN "amountOriginal" DROP NOT NULL;
ALTER TABLE "TravelItem" ALTER COLUMN "amountEur" DROP NOT NULL;
ALTER TABLE "TravelItem" ADD COLUMN "bookingId" TEXT;
ALTER TABLE "TravelItem" ADD COLUMN "priceEditable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TravelItem" ADD COLUMN "priceMissing" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TravelItem" ADD COLUMN "priceSourceDocId" TEXT;

-- AddForeignKey
ALTER TABLE "TravelBooking" ADD CONSTRAINT "TravelBooking_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelItem" ADD CONSTRAINT "TravelItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "TravelBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Participant" ADD COLUMN "journeyConsolidatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DocumentExtraction" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "detectedDocumentType" "DocumentType" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "passengerName" TEXT,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "departureDate" TIMESTAMP(3),
    "purchaseDate" TIMESTAMP(3),
    "documentDate" TIMESTAMP(3),
    "flightNumber" TEXT,
    "airline" TEXT,
    "bookingReference" TEXT,
    "seatNumber" TEXT,
    "trainNumber" TEXT,
    "busCompany" TEXT,
    "amount" DOUBLE PRECISION,
    "currency" TEXT,
    "rawAiResponse" TEXT,
    "consolidated" BOOLEAN NOT NULL DEFAULT false,
    "consolidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentExtraction_documentId_key" ON "DocumentExtraction"("documentId");

-- AddForeignKey
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

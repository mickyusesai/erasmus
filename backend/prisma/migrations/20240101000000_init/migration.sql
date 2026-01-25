-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('DRAFT', 'PARTICIPANT_COMPLETE', 'ADMIN_APPROVED', 'PAID');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('FLIGHT_INVOICE', 'FLIGHT_BOARDING_PASS', 'TRAIN_TICKET', 'BUS_TICKET', 'FUEL_RECEIPT', 'GREEN_TRAVEL_DECLARATION', 'OTHER');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('PLANE', 'TRAIN', 'BUS', 'CAR', 'FERRY', 'OTHER');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('PARTICIPANT', 'ADMIN');

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "country" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCountryLimit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "maxReimbursementAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',

    CONSTRAINT "ProjectCountryLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "magicLinkToken" TEXT NOT NULL,
    "magicLinkActive" BOOLEAN NOT NULL DEFAULT true,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'DRAFT',
    "bankAccountIban" TEXT,
    "bankAccountHolderName" TEXT,
    "bankAccountBic" TEXT,
    "notesInternal" TEXT,
    "lastMagicLinkSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "storedFilePath" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "renamedFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentType" "DocumentType" NOT NULL DEFAULT 'OTHER',
    "ocrText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelItem" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "documentId" TEXT,
    "modeOfTransport" "TransportMode" NOT NULL,
    "fromLocation" TEXT NOT NULL,
    "toLocation" TEXT NOT NULL,
    "departureDate" TIMESTAMP(3) NOT NULL,
    "arrivalDate" TIMESTAMP(3),
    "bookingReference" TEXT,
    "flightNumber" TEXT,
    "amountOriginal" DOUBLE PRECISION NOT NULL,
    "currencyOriginal" TEXT NOT NULL DEFAULT 'EUR',
    "purchaseDate" TIMESTAMP(3),
    "amountEur" DOUBLE PRECISION NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReimbursementSummary" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "totalOriginalCurrency" DOUBLE PRECISION,
    "totalEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxReimbursementAllowed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountToReimburse" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adminNotes" TEXT,
    "aiCheckOk" BOOLEAN NOT NULL DEFAULT false,
    "adminApproved" BOOLEAN NOT NULL DEFAULT false,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReimbursementSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeLogEntry" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "userType" "UserType" NOT NULL,
    "fieldName" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeclarationOnHonor" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "missingDocumentType" "DocumentType" NOT NULL,
    "description" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "place" TEXT NOT NULL,
    "declarationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeclarationOnHonor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCountryLimit_projectId_country_key" ON "ProjectCountryLimit"("projectId", "country");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_magicLinkToken_key" ON "Participant"("magicLinkToken");

-- CreateIndex
CREATE UNIQUE INDEX "ReimbursementSummary_participantId_key" ON "ReimbursementSummary"("participantId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCountryLimit" ADD CONSTRAINT "ProjectCountryLimit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelItem" ADD CONSTRAINT "TravelItem_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelItem" ADD CONSTRAINT "TravelItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReimbursementSummary" ADD CONSTRAINT "ReimbursementSummary_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeLogEntry" ADD CONSTRAINT "ChangeLogEntry_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclarationOnHonor" ADD CONSTRAINT "DeclarationOnHonor_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

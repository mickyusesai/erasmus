-- Enums
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'MEAL_RECEIPT';
CREATE TYPE "AllowanceMode" AS ENUM ('PER_TRAVEL_DAY', 'PER_RECEIPT');
CREATE TYPE "AllowanceAudience" AS ENUM ('ALL', 'GREEN_TRAVEL');

-- Project / summary columns
ALTER TABLE "Project" ADD COLUMN "requireGreenTravelDeclaration" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReimbursementSummary" ADD COLUMN "allowancesEur" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Rules
CREATE TABLE "ProjectAllowanceRule" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mode" "AllowanceMode" NOT NULL,
  "audience" "AllowanceAudience" NOT NULL DEFAULT 'GREEN_TRAVEL',
  "amountPerDay" DOUBLE PRECISION,
  "maxDays" INTEGER DEFAULT 4,
  "capPerDay" DOUBLE PRECISION,
  "capTotal" DOUBLE PRECISION,
  "countsTowardMax" BOOLEAN NOT NULL DEFAULT false,
  "receiptsRequired" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectAllowanceRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectAllowanceRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Participant lines
CREATE TABLE "ParticipantAllowance" (
  "id" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "days" INTEGER,
  "amountEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ParticipantAllowance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ParticipantAllowance_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ParticipantAllowance_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ProjectAllowanceRule"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ParticipantAllowance_participantId_ruleId_key" ON "ParticipantAllowance"("participantId", "ruleId");

-- Receipts
CREATE TABLE "ParticipantAllowanceReceipt" (
  "id" TEXT NOT NULL,
  "allowanceId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "amountOriginal" DOUBLE PRECISION,
  "currencyOriginal" TEXT NOT NULL DEFAULT 'EUR',
  "amountEur" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParticipantAllowanceReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ParticipantAllowanceReceipt_allowanceId_fkey" FOREIGN KEY ("allowanceId") REFERENCES "ParticipantAllowance"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ParticipantAllowanceReceipt_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ParticipantAllowanceReceipt_documentId_key" ON "ParticipantAllowanceReceipt"("documentId");

-- Green travel declaration
CREATE TABLE "GreenTravelDeclaration" (
  "id" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "signatureDataUrl" TEXT NOT NULL,
  "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generatedPdfPath" TEXT,
  "documentId" TEXT,
  "travelDaysClaimed" INTEGER,
  "summaryJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GreenTravelDeclaration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GreenTravelDeclaration_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GreenTravelDeclaration_participantId_key" ON "GreenTravelDeclaration"("participantId");

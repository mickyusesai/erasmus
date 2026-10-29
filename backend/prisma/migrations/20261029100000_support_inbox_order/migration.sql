-- Trip order: departure time from the ticket, and the organiser's order within a day
ALTER TABLE "TravelItem"
  ADD COLUMN IF NOT EXISTS "departureTime" TEXT,
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER;

-- AI review findings: which documents a finding is about
ALTER TABLE "AiReviewFinding" ADD COLUMN IF NOT EXISTS "documentIds" TEXT;

-- Receipts corrected by the organiser keep their values when read again
ALTER TABLE "DocumentExtraction" ADD COLUMN IF NOT EXISTS "correctedByOrganisation" BOOLEAN NOT NULL DEFAULT false;

-- Email replies from participants (inbound address reply+<code>@...)
ALTER TABLE "Participant" ADD COLUMN IF NOT EXISTS "replyCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Participant_replyCode_key" ON "Participant"("replyCode");

CREATE TABLE IF NOT EXISTS "ParticipantMessage" (
  "id" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "fromEmail" TEXT NOT NULL,
  "fromName" TEXT,
  "subject" TEXT,
  "textBody" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aiSummary" TEXT,
  "aiSuggestions" TEXT,
  "attachments" TEXT,
  "forwardedTo" TEXT,
  "forwardedAt" TIMESTAMP(3),
  CONSTRAINT "ParticipantMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ParticipantMessage_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ParticipantMessage_participantId_receivedAt_idx" ON "ParticipantMessage"("participantId", "receivedAt");

-- Read-only support keys (24 hours)
CREATE TABLE IF NOT EXISTS "SupportKey" (
  "id" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "useCount" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SupportKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupportKey_keyHash_key" ON "SupportKey"("keyHash");

-- Changes made by EasyReimburse support in an organisation's dashboard
ALTER TYPE "UserType" ADD VALUE IF NOT EXISTS 'SUPPORT';

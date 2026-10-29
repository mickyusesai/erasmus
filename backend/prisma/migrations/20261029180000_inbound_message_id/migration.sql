-- Postmark's MessageID on stored replies: a webhook that Postmark sends again is not stored twice
ALTER TABLE "ParticipantMessage" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ParticipantMessage_externalId_key" ON "ParticipantMessage"("externalId");

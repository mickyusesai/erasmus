-- Token usage per Claude API response, to measure the cost of each AI job
CREATE TABLE IF NOT EXISTS "AiUsage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "job" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "participantId" TEXT,
    "projectId" TEXT,
    "documentCount" INTEGER,
    "inputTokens" INTEGER NOT NULL,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL,
    "thinkingTokens" INTEGER,
    "stopReason" TEXT,
    "durationMs" INTEGER,
    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");
CREATE INDEX IF NOT EXISTS "AiUsage_job_createdAt_idx" ON "AiUsage"("job", "createdAt");

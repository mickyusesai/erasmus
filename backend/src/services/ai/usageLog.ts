/**
 * Token usage per Claude API response, stored per AI job so the bill can be split into
 * reading files, building trips and the AI review (and a cost per participant).
 */
import type Anthropic from '@anthropic-ai/sdk';
import prisma from '../../utils/prisma.js';

export type AiJob = 'EXTRACTION' | 'CONSOLIDATION' | 'REVIEW';

export const AI_JOB_LABELS: Record<AiJob, string> = {
  EXTRACTION: 'Reading uploaded files',
  CONSOLIDATION: 'Building trips',
  REVIEW: 'AI review',
};

export interface AiUsageContext {
  participantId?: string | null;
  projectId?: string | null;
  /** Used to find the participant when the caller only knows the document */
  documentId?: string | null;
  /** Number of files sent in the request */
  documentCount?: number | null;
  /** Date.now() just before the request */
  startedAt?: number;
}

/**
 * List prices in USD per million tokens (Anthropic pricing page, October 2026) for the
 * models this app calls. Used only to estimate cost in the super-admin overview; the
 * Anthropic Console stays the source of truth for the bill.
 */
export const ESTIMATED_PRICES: Record<string, { input: number; cacheWrite: number; cacheRead: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, cacheWrite: 3.75, cacheRead: 0.3, output: 15 },
};

export function estimateCostUsd(
  model: string,
  tokens: { inputTokens: number; cacheWriteTokens: number; cacheReadTokens: number; outputTokens: number }
): number | null {
  const p = ESTIMATED_PRICES[model];
  if (!p) return null;
  return (
    (tokens.inputTokens * p.input +
      tokens.cacheWriteTokens * p.cacheWrite +
      tokens.cacheReadTokens * p.cacheRead +
      tokens.outputTokens * p.output) /
    1_000_000
  );
}

/**
 * Records one response's token usage. Never throws and never blocks the caller's result:
 * a logging problem must not break reading files, building trips or the review.
 */
export async function recordAiUsage(
  job: AiJob,
  response: Pick<Anthropic.Message, 'model' | 'usage' | 'stop_reason'>,
  context: AiUsageContext = {}
): Promise<void> {
  try {
    const usage = response.usage;
    // Not in the SDK's types; read it only if the API sends it
    const thinkingTokens =
      (usage as unknown as { output_tokens_details?: { thinking_tokens?: number } }).output_tokens_details?.thinking_tokens ?? null;

    let participantId = context.participantId ?? null;
    let projectId = context.projectId ?? null;
    if (!participantId && context.documentId) {
      const doc = await prisma.document.findUnique({
        where: { id: context.documentId },
        select: { participantId: true, participant: { select: { projectId: true } } },
      });
      participantId = doc?.participantId ?? null;
      projectId = projectId ?? doc?.participant?.projectId ?? null;
    }
    if (participantId && !projectId) {
      const p = await prisma.participant.findUnique({ where: { id: participantId }, select: { projectId: true } });
      projectId = p?.projectId ?? null;
    }

    const row = {
      job,
      model: response.model,
      participantId,
      projectId,
      documentCount: context.documentCount ?? null,
      inputTokens: usage.input_tokens,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      outputTokens: usage.output_tokens,
      thinkingTokens,
      stopReason: response.stop_reason ?? null,
      durationMs: context.startedAt ? Date.now() - context.startedAt : null,
    };
    const cost = estimateCostUsd(row.model, row);
    console.log(
      `[AI usage] ${job} ${row.model} in=${row.inputTokens} cache_write=${row.cacheWriteTokens} cache_read=${row.cacheReadTokens} ` +
        `out=${row.outputTokens}${row.documentCount != null ? ` docs=${row.documentCount}` : ''}` +
        `${row.durationMs != null ? ` ${row.durationMs}ms` : ''}${cost != null ? ` ~$${cost.toFixed(4)}` : ''}` +
        `${participantId ? ` participant=${participantId}` : ''}`
    );
    await prisma.aiUsage.create({ data: row });
  } catch (err) {
    console.warn('[AI usage] Could not record usage:', err instanceof Error ? err.message : err);
  }
}

/**
 * Small Claude calls that answer with JSON (email summaries, message drafts).
 * Same model as the other AI jobs; usage is recorded per job like the others.
 */
import Anthropic from '@anthropic-ai/sdk';
import { recordAiUsage, type AiJob, type AiUsageContext } from './usageLog.js';

export const CLAUDE_MODEL = 'claude-sonnet-4-6';

export class AiUnavailableError extends Error {
  constructor() {
    super('AI is not configured (no API key)');
  }
}

/** Sends one prompt and returns the first JSON object in the answer */
export async function askClaudeJson<T>(
  job: AiJob,
  prompt: string,
  options: { maxTokens?: number; context?: AiUsageContext } = {}
): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiUnavailableError();
  const client = new Anthropic({ apiKey, maxRetries: 4 });
  const startedAt = Date.now();
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: options.maxTokens ?? 1200,
    messages: [{ role: 'user', content: prompt }],
  });
  void recordAiUsage(job, response, { ...options.context, startedAt });
  const text = response.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map((c) => c.text)
    .join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('The AI did not answer with JSON');
  return JSON.parse(match[0]) as T;
}

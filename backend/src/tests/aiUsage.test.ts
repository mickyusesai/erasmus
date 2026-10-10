import { describe, it, expect } from 'vitest';
import { estimateCostUsd } from '../services/ai/usageLog.js';

describe('AI usage cost estimate', () => {
  it('prices Sonnet 4.6 tokens at list price', () => {
    // 1M input + 1M output = $3 + $15
    expect(estimateCostUsd('claude-sonnet-4-6', { inputTokens: 1_000_000, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 1_000_000 })).toBeCloseTo(18);
    // A typical trip build: ~30k in, ~9k out
    expect(estimateCostUsd('claude-sonnet-4-6', { inputTokens: 29_840, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 9_210 })).toBeCloseTo(0.22767, 5);
    // Cache writes and reads use their own rates
    expect(estimateCostUsd('claude-sonnet-4-6', { inputTokens: 0, cacheWriteTokens: 1_000_000, cacheReadTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(4.05);
  });

  it('returns null for a model without a known price instead of guessing', () => {
    expect(estimateCostUsd('some-future-model', { inputTokens: 1000, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 1000 })).toBeNull();
  });
});

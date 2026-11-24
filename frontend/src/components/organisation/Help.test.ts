import { describe, expect, it } from 'vitest';
import { HELP_ANSWERS } from './Help';

describe('the short answers in Help', () => {
  it('each have a question and an answer that fits in a few lines', () => {
    expect(HELP_ANSWERS.length).toBeGreaterThanOrEqual(6);
    for (const item of HELP_ANSWERS) {
      expect(item.question.endsWith('?') || item.question.endsWith('…'), item.question).toBe(true);
      expect(item.answer.length, item.question).toBeGreaterThan(40);
      expect(item.answer.length, item.question).toBeLessThan(420);
    }
  });

  it('do not promise prices that can change: those are on the Billing page', () => {
    for (const item of HELP_ANSWERS) expect(item.answer).not.toMatch(/€\s?\d/);
  });
});

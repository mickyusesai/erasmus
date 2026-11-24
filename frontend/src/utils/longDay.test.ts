import { describe, expect, it } from 'vitest';
import { longDay } from './longDay';

describe('a day written out', () => {
  it('names the weekday, the day, the month and the year', () => {
    expect(longDay('2027-04-12T07:00:00.000Z')).toBe('Monday 12 April 2027');
    expect(longDay(new Date('2026-11-24T23:30:00.000Z'))).toBe('Tuesday 24 November 2026');
  });

  it('is empty for something that is not a day', () => {
    expect(longDay('soon')).toBe('');
  });
});

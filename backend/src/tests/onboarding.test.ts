import { describe, it, expect } from 'vitest';
import {
  FREE_FIRST_PROJECT_SINCE,
  freeProjectAvailable,
  gettingStarted,
  isUntouchedPlaceholder,
  readOnboarding,
  type ProjectProgress,
} from '../services/organisation/onboarding.js';

const after = new Date(FREE_FIRST_PROJECT_SINCE.getTime() + 24 * 60 * 60 * 1000);
const before = new Date(FREE_FIRST_PROJECT_SINCE.getTime() - 24 * 60 * 60 * 1000);

describe('the free first project', () => {
  it('is there for a new organisation', () => {
    expect(freeProjectAvailable({ freeProjectUsedAt: null, createdAt: after }, false)).toBe(true);
  });

  it('is there once: not after it was created, also when it was deleted or upgraded since', () => {
    expect(freeProjectAvailable({ freeProjectUsedAt: new Date(), createdAt: after }, false)).toBe(false);
  });

  it('is not given next to a free project the organisation already has', () => {
    expect(freeProjectAvailable({ freeProjectUsedAt: null, createdAt: after }, true)).toBe(false);
  });

  it('is not given to organisations from before the rule: they got a free Test Project at sign-up', () => {
    expect(freeProjectAvailable({ freeProjectUsedAt: null, createdAt: before }, false)).toBe(false);
  });
});

describe('the automatic Test Project of older sign-ups', () => {
  const placeholder = { name: 'Test Project', country: 'Test', isTestProject: true, participantCount: 0 };
  it('counts as untouched while it still has its placeholder name and country and nobody in it', () => {
    expect(isUntouchedPlaceholder(placeholder)).toBe(true);
  });
  it('is a real project once it was renamed, moved or filled', () => {
    expect(isUntouchedPlaceholder({ ...placeholder, name: 'Youth exchange Porto' })).toBe(false);
    expect(isUntouchedPlaceholder({ ...placeholder, country: 'Portugal' })).toBe(false);
    expect(isUntouchedPlaceholder({ ...placeholder, participantCount: 1 })).toBe(false);
    expect(isUntouchedPlaceholder({ ...placeholder, isTestProject: false })).toBe(false);
  });
});

describe('what the organisation has seen', () => {
  it('reads what was stored', () => {
    expect(readOnboarding({ welcomeSeenAt: '2026-11-23T10:00:00.000Z' })).toEqual({ welcomeSeenAt: '2026-11-23T10:00:00.000Z' });
  });
  it('treats nothing, old or broken values as "nothing seen yet"', () => {
    expect(readOnboarding(null)).toEqual({});
    expect(readOnboarding(undefined)).toEqual({});
    expect(readOnboarding('done')).toEqual({});
    expect(readOnboarding([1, 2])).toEqual({});
    expect(readOnboarding({ welcomeSeenAt: 'yesterday-ish' })).toEqual({});
    expect(readOnboarding({ somethingElse: true })).toEqual({});
  });
});

describe('the next step on the dashboard', () => {
  const project = (over: Partial<ProjectProgress> = {}): ProjectProgress => ({
    id: 'p1',
    name: 'Youth exchange Porto',
    country: 'Portugal',
    isTestProject: true,
    createdAt: new Date('2026-11-24T10:00:00Z'),
    participants: [],
    limits: [],
    ...over,
  });
  const doneSteps = (g: ReturnType<typeof gettingStarted>) => g.steps.filter((s) => s.done).map((s) => s.id);

  it('starts with creating a project', () => {
    const g = gettingStarted([]);
    expect(g).toMatchObject({ complete: false, next: 'PROJECT', projectId: null, projectIsPlaceholder: false });
    expect(doneSteps(g)).toEqual([]);
  });

  it('an untouched Test Project still has to be set up, and is the project to open', () => {
    const g = gettingStarted([project({ id: 'old', name: 'Test Project', country: 'Test' })]);
    expect(g).toMatchObject({ next: 'PROJECT', projectId: 'old', projectIsPlaceholder: true });
  });

  it('then asks for participants', () => {
    const g = gettingStarted([project()]);
    expect(g).toMatchObject({ next: 'PARTICIPANTS', projectId: 'p1' });
    expect(doneSteps(g)).toEqual(['PROJECT']);
  });

  it('then asks for the amounts, naming the countries that have none', () => {
    const g = gettingStarted([
      project({
        participants: [{ country: 'Poland', invited: false }, { country: 'Italy', invited: false }, { country: 'Poland', invited: false }],
        limits: [{ country: 'Poland', max: 0 }, { country: 'Italy', max: 309 }],
      }),
    ]);
    expect(g).toMatchObject({ next: 'AMOUNTS', countriesWithoutAmount: ['Poland'] });
    expect(doneSteps(g)).toEqual(['PROJECT', 'PARTICIPANTS']);
  });

  it('a country without any amount row counts as not set', () => {
    const g = gettingStarted([project({ participants: [{ country: 'Spain', invited: false }], limits: [] })]);
    expect(g).toMatchObject({ next: 'AMOUNTS', countriesWithoutAmount: ['Spain'] });
  });

  it('then asks to send the invitations', () => {
    const g = gettingStarted([project({ participants: [{ country: 'Italy', invited: false }], limits: [{ country: 'Italy', max: 309 }] })]);
    expect(g).toMatchObject({ next: 'INVITATIONS', countriesWithoutAmount: [] });
    expect(doneSteps(g)).toEqual(['PROJECT', 'PARTICIPANTS', 'AMOUNTS']);
  });

  it('is finished once anyone was invited, in any project', () => {
    const g = gettingStarted([
      project({ id: 'new', createdAt: new Date('2026-12-01T10:00:00Z') }),
      project({ id: 'older', participants: [{ country: 'Italy', invited: true }], limits: [{ country: 'Italy', max: 0 }] }),
    ]);
    expect(g).toMatchObject({ complete: true, next: null });
    expect(doneSteps(g)).toEqual(['PROJECT', 'PARTICIPANTS', 'AMOUNTS', 'INVITATIONS']);
  });

  it('follows the newest project that was set up, not the leftover placeholder', () => {
    const g = gettingStarted([
      project({ id: 'placeholder', name: 'Test Project', country: 'Test', createdAt: new Date('2026-11-25T10:00:00Z') }),
      project({ id: 'real', createdAt: new Date('2026-11-24T10:00:00Z') }),
    ]);
    expect(g).toMatchObject({ next: 'PARTICIPANTS', projectId: 'real', projectIsPlaceholder: false });
  });
});

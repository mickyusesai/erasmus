import { describe, it, expect } from 'vitest';
import { invitationMoment, whyNotPlannable } from '../services/organisation/invitations.js';
import { gettingStarted, type ProjectProgress } from '../services/organisation/onboarding.js';

describe('invitations planned for a day', () => {
  it('go out at the start of the working day in Europe', () => {
    expect(invitationMoment('2027-03-01')!.toISOString()).toBe('2027-03-01T07:00:00.000Z');
  });

  it('need a real day', () => {
    expect(invitationMoment('next week')).toBeNull();
    expect(invitationMoment('2027-13-45')).toBeNull();
    expect(invitationMoment('01-03-2027')).toBeNull();
  });

  it('can be planned for tomorrow, and for today as long as the moment is still to come', () => {
    expect(whyNotPlannable('2026-11-25', new Date('2026-11-24T15:00:00Z'))).toBeNull();
    expect(whyNotPlannable('2026-11-24', new Date('2026-11-24T05:30:00Z'))).toBeNull();
  });

  it('not for a moment that has passed: then they are sent now', () => {
    expect(whyNotPlannable('2026-11-24', new Date('2026-11-24T15:00:00Z'))).toMatch(/send the invitations now/);
    expect(whyNotPlannable('2026-11-01', new Date('2026-11-24T15:00:00Z'))).toMatch(/passed/);
  });

  it('not further away than a year, and not without a day', () => {
    expect(whyNotPlannable('2029-01-01', new Date('2026-11-24T15:00:00Z'))).toMatch(/within a year/);
    expect(whyNotPlannable('', new Date('2026-11-24T15:00:00Z'))).toBe('Please choose a day.');
  });
});

describe('the set-up of a project with planned invitations', () => {
  const project = (over: Partial<ProjectProgress> = {}): ProjectProgress => ({
    id: 'p1',
    name: 'Youth exchange Porto',
    country: 'Portugal',
    isTestProject: true,
    createdAt: new Date('2026-11-24T10:00:00Z'),
    participants: [{ country: 'Italy', invited: false }],
    limits: [{ country: 'Italy', max: 275 }],
    ...over,
  });

  it('is done once the invitations are planned: they go out by themselves', () => {
    expect(gettingStarted([project()])).toMatchObject({ complete: false, next: 'INVITATIONS' });
    expect(gettingStarted([project({ invitationsPlanned: true })])).toMatchObject({ complete: true, next: null });
  });

  it('a plan without anybody to invite is not a finished set-up', () => {
    expect(gettingStarted([project({ invitationsPlanned: true, participants: [] })])).toMatchObject({ complete: false, next: 'PARTICIPANTS' });
  });
});

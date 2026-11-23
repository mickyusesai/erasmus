import { describe, expect, it } from 'vitest';
import type { GettingStarted, GettingStartedStep, OrgDashboardData } from '../services/api';
import { nextStep, shouldWelcome } from './gettingStarted';

const ALL: GettingStartedStep[] = ['PROJECT', 'PARTICIPANTS', 'AMOUNTS', 'INVITATIONS'];
const progress = (next: GettingStartedStep | null, over: Partial<GettingStarted> = {}): GettingStarted => ({
  complete: next === null,
  steps: ALL.map((id) => ({ id, done: next === null || ALL.indexOf(id) < ALL.indexOf(next) })),
  next,
  projectId: next && next !== 'PROJECT' ? 'p1' : null,
  projectIsPlaceholder: false,
  countriesWithoutAmount: [],
  ...over,
});

const dashboard = (over: Partial<OrgDashboardData> = {}): OrgDashboardData => ({
  organisation: { id: 'o1', name: 'Youth Bridge', email: 'hello@example.test' },
  credits: { available: 0, canCreateProject: false },
  freeProject: { available: true, maxParticipants: 10 },
  onboarding: {},
  gettingStarted: progress('PROJECT'),
  supportSession: false,
  stats: { projectCount: 0, totalParticipants: 0 },
  projects: [],
  recentPurchases: [],
  ...over,
});

describe('the next step', () => {
  it('a new organisation sets up its free first project', () => {
    expect(nextStep(dashboard())).toMatchObject({ step: 'PROJECT', number: 1, total: 4, title: 'Set up your first project', to: '/org/projects/new' });
    expect(nextStep(dashboard())!.text).toContain('free for up to 10 participants');
  });

  it('an older sign-up is sent to the settings of its untouched test project', () => {
    const step = nextStep(dashboard({ freeProject: { available: false, maxParticipants: 10 }, gettingStarted: progress('PROJECT', { projectId: 'old', projectIsPlaceholder: true }) }));
    expect(step).toMatchObject({ title: 'Set up your free project', to: '/org/projects/old?tab=settings' });
  });

  it('without a free project it uses a credit, or shows where to get one', () => {
    const noFree = { freeProject: { available: false, maxParticipants: 10 } };
    expect(nextStep(dashboard({ ...noFree, credits: { available: 2, canCreateProject: true } }))).toMatchObject({ to: '/org/projects/new', text: expect.stringContaining('2 project credits') });
    expect(nextStep(dashboard(noFree))).toMatchObject({ button: 'See the prices', to: '/org/billing' });
  });

  it('then participants, amounts and invitations, each opening its place in the project', () => {
    expect(nextStep(dashboard({ gettingStarted: progress('PARTICIPANTS') }))).toMatchObject({ number: 2, to: '/org/projects/p1?do=add' });
    const amounts = nextStep(dashboard({ gettingStarted: progress('AMOUNTS', { countriesWithoutAmount: ['Italy', 'Poland', 'Spain'] }) }));
    expect(amounts).toMatchObject({ number: 3, to: '/org/projects/p1?do=amounts' });
    expect(amounts!.text).toContain('Still open: Italy, Poland and Spain.');
    expect(nextStep(dashboard({ gettingStarted: progress('INVITATIONS') }))).toMatchObject({ number: 4, to: '/org/projects/p1?do=invite' });
  });

  it('there is none once the first invitations are out, or when the server does not say', () => {
    expect(nextStep(dashboard({ gettingStarted: progress(null) }))).toBeNull();
    expect(nextStep(dashboard({ gettingStarted: undefined }))).toBeNull();
  });
});

describe('the welcome', () => {
  it('greets an organisation that has not seen it and has not started', () => {
    expect(shouldWelcome(dashboard(), false)).toBe(true);
  });

  it('is not shown again once seen, on any device', () => {
    expect(shouldWelcome(dashboard({ onboarding: { welcomeSeenAt: '2026-11-23T10:00:00.000Z' } }), false)).toBe(false);
  });

  it('is not shown to someone who closed the old intro in this browser', () => {
    expect(shouldWelcome(dashboard(), true)).toBe(false);
  });

  it('is never shown to support looking along', () => {
    expect(shouldWelcome(dashboard({ supportSession: true }), false)).toBe(false);
  });

  it('is not shown to an organisation that is under way', () => {
    expect(shouldWelcome(dashboard({ gettingStarted: progress(null) }), false)).toBe(false);
    expect(shouldWelcome(dashboard({ stats: { projectCount: 1, totalParticipants: 3 } }), false)).toBe(false);
  });

  it('is not shown when an older server answer has no onboarding information', () => {
    expect(shouldWelcome(dashboard({ onboarding: undefined }), false)).toBe(false);
  });
});

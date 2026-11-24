/**
 * A new organisation's first steps:
 *  - its first project is free for up to 10 participants,
 *  - what it has seen of the welcome is remembered on the server (not in the browser),
 *  - the dashboard points at the one next step until the first invitations are out.
 *
 * Everything here is worked out from data, so it can be tested without a database.
 */
import type { Prisma } from '@prisma/client';
import { REMEMBERED_PRACTICE_STEPS, type PracticeMemory, type RememberedPracticeStep } from './practice/guide.js';

export const FREE_PROJECT_MAX_PARTICIPANTS = 10;
/** What one project credit covers */
export const FULL_PROJECT_MAX_PARTICIPANTS = 60;

/**
 * Organisations that signed up before this day were given a free "Test Project" at sign-up.
 * That project is their free one, so they don't get a second.
 */
export const FREE_FIRST_PROJECT_SINCE = new Date('2026-11-23T00:00:00Z');

/** The values of that automatic project, as long as nobody has changed them */
export const PLACEHOLDER_PROJECT = { name: 'Test Project', country: 'Test' } as const;

export function isUntouchedPlaceholder(project: { name: string; country: string; isTestProject: boolean; participantCount: number }): boolean {
  return (
    project.isTestProject &&
    project.participantCount === 0 &&
    project.name === PLACEHOLDER_PROJECT.name &&
    project.country === PLACEHOLDER_PROJECT.country
  );
}

/**
 * Can this organisation still create its free first project? Once only: not after it was
 * created (also when it was deleted or upgraded since), and not next to a free project it
 * already has.
 */
export function freeProjectAvailable(org: { freeProjectUsedAt: Date | null; createdAt: Date }, hasFreeProject: boolean): boolean {
  return org.freeProjectUsedAt === null && org.createdAt >= FREE_FIRST_PROJECT_SINCE && !hasFreeProject;
}

// ---------------------------------------------------------------------------------------------
// What the organisation has seen
// ---------------------------------------------------------------------------------------------

export interface OnboardingState {
  /** When the welcome screen was closed or one of its ways in was chosen (ISO date) */
  welcomeSeenAt?: string;
  /** The guide through the practice project: what it can't read from the practice project itself */
  practice?: PracticeMemory;
}

const isIsoDate = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** The stored state, whatever is in the column (older or broken values count as "nothing yet") */
export function readOnboarding(value: Prisma.JsonValue | null | undefined): OnboardingState {
  if (!isObject(value)) return {};
  const state: OnboardingState = {};
  if (isIsoDate(value.welcomeSeenAt)) state.welcomeSeenAt = value.welcomeSeenAt;
  if (isObject(value.practice)) {
    const practice: PracticeMemory = {};
    if (Array.isArray(value.practice.seen)) {
      const seen = REMEMBERED_PRACTICE_STEPS.filter((step) => (value.practice as { seen: unknown[] }).seen.includes(step));
      if (seen.length) practice.seen = seen;
    }
    if (isIsoDate(value.practice.closedAt)) practice.closedAt = value.practice.closedAt;
    if (practice.seen || practice.closedAt) state.practice = practice;
  }
  return state;
}

/** The state after the organisation did one of the practice steps that leave no trace */
export function withPracticeStepSeen(state: OnboardingState, step: RememberedPracticeStep): OnboardingState {
  const seen = new Set(state.practice?.seen ?? []);
  seen.add(step);
  return { ...state, practice: { ...state.practice, seen: REMEMBERED_PRACTICE_STEPS.filter((s) => seen.has(s)) } };
}

/** The state after the organisation put the practice guide away, or took it out again */
export function withPracticeGuideClosed(state: OnboardingState, closed: boolean, now: Date = new Date()): OnboardingState {
  const practice: PracticeMemory = { ...state.practice };
  if (closed) practice.closedAt = practice.closedAt ?? now.toISOString();
  else delete practice.closedAt;
  return { ...state, practice };
}

/** The state after the practice was started again: the guide starts again too */
export function withPracticeRestarted(state: OnboardingState): OnboardingState {
  const { practice: _practice, ...rest } = state;
  return rest;
}

// ---------------------------------------------------------------------------------------------
// The next step
// ---------------------------------------------------------------------------------------------

export const GETTING_STARTED_STEPS = ['PROJECT', 'PARTICIPANTS', 'AMOUNTS', 'INVITATIONS'] as const;
export type GettingStartedStep = (typeof GETTING_STARTED_STEPS)[number];

export interface ProjectProgress {
  id: string;
  name: string;
  country: string;
  isTestProject: boolean;
  createdAt: Date;
  participants: { country: string; invited: boolean }[];
  /** Maximum amount per sending country (0 = not set yet) */
  limits: { country: string; max: number }[];
}

export interface GettingStarted {
  /** True once any participant was invited: the organisation knows the way from here */
  complete: boolean;
  steps: { id: GettingStartedStep; done: boolean }[];
  next: GettingStartedStep | null;
  /** The project the next step is about; null when it still has to be created */
  projectId: string | null;
  /** That project is the automatic "Test Project" of an older sign-up, still as it was created */
  projectIsPlaceholder: boolean;
  /** For the AMOUNTS step: sending countries of the participants that have no maximum yet */
  countriesWithoutAmount: string[];
}

export function gettingStarted(projects: ProjectProgress[]): GettingStarted {
  const done = (ids: GettingStartedStep[]) => GETTING_STARTED_STEPS.map((id) => ({ id, done: ids.includes(id) }));

  if (projects.some((p) => p.participants.some((x) => x.invited))) {
    return { complete: true, steps: done([...GETTING_STARTED_STEPS]), next: null, projectId: null, projectIsPlaceholder: false, countriesWithoutAmount: [] };
  }

  const newestFirst = [...projects].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const placeholder = (p: ProjectProgress) => isUntouchedPlaceholder({ ...p, participantCount: p.participants.length });
  const focus = newestFirst.find((p) => !placeholder(p));

  if (!focus) {
    const untouched = newestFirst[0] ?? null;
    return { complete: false, steps: done([]), next: 'PROJECT', projectId: untouched?.id ?? null, projectIsPlaceholder: !!untouched, countriesWithoutAmount: [] };
  }

  const base = { complete: false, projectId: focus.id, projectIsPlaceholder: false };
  if (focus.participants.length === 0) {
    return { ...base, steps: done(['PROJECT']), next: 'PARTICIPANTS', countriesWithoutAmount: [] };
  }

  const withAmount = new Set(focus.limits.filter((l) => l.max > 0).map((l) => l.country));
  const countriesWithoutAmount = [...new Set(focus.participants.map((p) => p.country))].filter((c) => !withAmount.has(c)).sort();
  if (countriesWithoutAmount.length > 0) {
    return { ...base, steps: done(['PROJECT', 'PARTICIPANTS']), next: 'AMOUNTS', countriesWithoutAmount };
  }

  return { ...base, steps: done(['PROJECT', 'PARTICIPANTS', 'AMOUNTS']), next: 'INVITATIONS', countriesWithoutAmount: [] };
}

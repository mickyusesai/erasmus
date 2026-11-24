import { describe, expect, it } from 'vitest';
import type { PracticeGuide, PracticeStep } from '../services/api';
import {
  PRACTICE_STEP_ORDER,
  PRACTICE_STEP_TEXT,
  PRACTICE_TARGET,
  atPracticePlace,
  practicePlace,
  practiceProgress,
  practiceStepBlocked,
} from './practiceGuide';

const guide = (done: PracticeStep[] = [], over: Partial<PracticeGuide> = {}): PracticeGuide => {
  const participantOf: Record<PracticeStep, string | null> = { MEET: null, APPROVE: 'jonas', QUESTION: 'elena', PARTICIPANT: 'sam', AUDIT: 'jonas' };
  const steps = PRACTICE_STEP_ORDER.map((id) => ({ id, done: done.includes(id), participantId: participantOf[id], possible: true }));
  return {
    projectId: 'practice',
    steps,
    next: steps.find((s) => !s.done)?.id ?? null,
    complete: steps.every((s) => s.done),
    closed: false,
    you: { participantId: 'sam', firstName: 'Sam', token: 'sam-token' },
    ...over,
  };
};

describe('the practice guide', () => {
  it('has words for every step', () => {
    for (const id of PRACTICE_STEP_ORDER) {
      const text = PRACTICE_STEP_TEXT[id];
      expect(text.label && text.title && text.text && text.here && text.go, id).toBeTruthy();
    }
  });

  it('counts what is done', () => {
    expect(practiceProgress(guide())).toEqual({ done: 0, total: 5 });
    expect(practiceProgress(guide(['MEET', 'APPROVE']))).toEqual({ done: 2, total: 5 });
  });

  it('knows where each step is done', () => {
    const g = guide();
    expect(practicePlace(g, 'MEET')).toEqual({ kind: 'app', path: '/org/projects/practice' });
    expect(practicePlace(g, 'APPROVE')).toEqual({ kind: 'app', path: '/org/participants/jonas' });
    expect(practicePlace(g, 'QUESTION')).toEqual({ kind: 'app', path: '/org/participants/elena' });
    expect(practicePlace(g, 'AUDIT')).toEqual({ kind: 'app', path: '/org/participants/jonas' });
    // Being a participant happens on the participant's own page, in a new tab
    expect(practicePlace(g, 'PARTICIPANT')).toEqual({ kind: 'participant-page', path: '/reimbursement?token=sam-token' });
  });

  it('has nowhere to send you when the participant of a step is gone', () => {
    const g = guide([], { you: null });
    g.steps.find((s) => s.id === 'APPROVE')!.participantId = null;
    expect(practicePlace(g, 'PARTICIPANT')).toBeNull();
    expect(practicePlace(g, 'APPROVE')).toBeNull();
  });

  it('knows when you are at the place of a step', () => {
    const g = guide();
    expect(atPracticePlace(g, 'MEET', { kind: 'project', projectId: 'practice' })).toBe(true);
    expect(atPracticePlace(g, 'MEET', { kind: 'project', projectId: 'another' })).toBe(false);
    expect(atPracticePlace(g, 'MEET', { kind: 'dashboard' })).toBe(false);
    expect(atPracticePlace(g, 'APPROVE', { kind: 'participant', participantId: 'jonas' })).toBe(true);
    expect(atPracticePlace(g, 'APPROVE', { kind: 'participant', participantId: 'elena' })).toBe(false);
    expect(atPracticePlace(g, 'QUESTION', { kind: 'participant', participantId: 'elena' })).toBe(true);
    // Never "here" in the organiser's app: it is done in the other tab
    expect(atPracticePlace(g, 'PARTICIPANT', { kind: 'participant', participantId: 'sam' })).toBe(false);
  });

  it('points at a real button for every step that is done in the organiser\'s app', () => {
    expect(Object.keys(PRACTICE_TARGET).sort()).toEqual(['APPROVE', 'AUDIT', 'MEET', 'QUESTION']);
  });

  it('holds the audit file back until somebody is approved', () => {
    expect(practiceStepBlocked(guide(['MEET']), 'AUDIT')).toMatch(/approve Jonas first/);
    expect(practiceStepBlocked(guide(['MEET', 'APPROVE']), 'AUDIT')).toBeNull();
    expect(practiceStepBlocked(guide(['MEET']), 'QUESTION')).toBeNull();
  });

  it('says so when the participant of a step was deleted', () => {
    const g = guide(['MEET']);
    g.steps.find((s) => s.id === 'QUESTION')!.possible = false;
    expect(practiceStepBlocked(g, 'QUESTION')).toMatch(/Start the practice again/);
  });
});

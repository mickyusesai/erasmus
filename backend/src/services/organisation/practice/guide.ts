/**
 * The guide through the practice project: five things to try, in the order an organiser meets
 * them with a real project. Whether a step is done is read from the practice project itself
 * where it leaves a trace (Jonas approved, Elena asked a question, the participant the organiser
 * plays handed in); the two that leave none (looking around, downloading the audit file) are
 * remembered with the organisation.
 *
 * Worked out from data, so it can be tested without a database.
 */
import { practiceRoleOf, type PracticeRole } from './content.js';

export const PRACTICE_STEPS = ['MEET', 'APPROVE', 'QUESTION', 'PARTICIPANT', 'AUDIT'] as const;
export type PracticeStep = (typeof PRACTICE_STEPS)[number];

/** The steps that leave no trace in the practice project and are remembered with the organisation */
export const REMEMBERED_PRACTICE_STEPS = ['MEET', 'AUDIT'] as const;
export type RememberedPracticeStep = (typeof REMEMBERED_PRACTICE_STEPS)[number];

export interface PracticeMemory {
  seen?: RememberedPracticeStep[];
  /** When the organisation put the guide away (ISO date) */
  closedAt?: string;
}

export interface PracticeParticipant {
  id: string;
  email: string;
  firstName: string;
  status: string;
  reopenedAt: Date | null;
  magicLinkToken: string;
}

export interface PracticeGuide {
  projectId: string;
  steps: {
    id: PracticeStep;
    done: boolean;
    /** The made-up participant the step is about (null: about the project, or the participant was deleted) */
    participantId: string | null;
    /** False when the participant the step needs was deleted: start the practice again to get them back */
    possible: boolean;
  }[];
  next: PracticeStep | null;
  complete: boolean;
  closed: boolean;
  /** The participant the organiser plays, with the link to their page */
  you: { participantId: string; firstName: string; token: string } | null;
}

export function practiceGuide(projectId: string, participants: PracticeParticipant[], memory: PracticeMemory | undefined): PracticeGuide {
  const byRole = new Map<PracticeRole, PracticeParticipant>();
  for (const p of participants) {
    const role = practiceRoleOf(p.email);
    if (role && !byRole.has(role)) byRole.set(role, p);
  }
  const seen = new Set<string>(memory?.seen ?? []);
  const jonas = byRole.get('APPROVE');
  const elena = byRole.get('QUESTION');
  const you = byRole.get('YOU');
  const approved = (p: PracticeParticipant | undefined) => !!p && (p.status === 'ADMIN_APPROVED' || p.status === 'PAID');
  const anyApproved = participants.find((p) => approved(p));

  const steps: PracticeGuide['steps'] = [
    { id: 'MEET', done: seen.has('MEET'), participantId: null, possible: true },
    { id: 'APPROVE', done: approved(jonas), participantId: jonas?.id ?? null, possible: !!jonas },
    { id: 'QUESTION', done: !!elena?.reopenedAt, participantId: elena?.id ?? null, possible: !!elena },
    { id: 'PARTICIPANT', done: !!you && you.status !== 'DRAFT', participantId: you?.id ?? null, possible: !!you },
    // The audit file exists once someone is approved: Jonas after step 2, or anyone else approved since
    { id: 'AUDIT', done: seen.has('AUDIT'), participantId: (approved(jonas) ? jonas : anyApproved)?.id ?? jonas?.id ?? null, possible: !!(jonas || anyApproved) },
  ];
  const next = steps.find((s) => !s.done && s.possible)?.id ?? null;

  return {
    projectId,
    steps,
    next,
    complete: steps.every((s) => s.done),
    closed: !!memory?.closedAt,
    you: you ? { participantId: you.id, firstName: you.firstName, token: you.magicLinkToken } : null,
  };
}

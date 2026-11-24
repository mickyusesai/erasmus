import type { PracticeGuide, PracticeStep } from '../services/api';

/**
 * The guide through the practice project: what each of its five steps says, where in the
 * app it is done, and which button it points at there.
 */
export interface PracticeStepText {
  /** Short name, for the list of steps */
  label: string;
  title: string;
  /** What the step is about, read before going to the place where it is done */
  text: string;
  /** What to do, read at that place, next to the highlighted button */
  here: string;
  /** The button that takes you to that place */
  go: string;
}

export const PRACTICE_STEP_ORDER: PracticeStep[] = ['MEET', 'APPROVE', 'QUESTION', 'PARTICIPANT', 'AUDIT'];

export const PRACTICE_STEP_TEXT: Record<PracticeStep, PracticeStepText> = {
  MEET: {
    label: 'Look around',
    title: 'Meet the practice project',
    text: 'Common Ground is a made-up youth exchange in Porto, with five made-up participants. Each of them is at a different point, so you can try every step. No email ever leaves this project.',
    here: 'These are your five made-up participants. Three handed in their tickets, one was invited and has not started, and one is for you to play. Nothing here is real, so try anything.',
    go: 'Open the practice project',
  },
  APPROVE: {
    label: 'Approve Jonas',
    title: 'Approve Jonas',
    text: 'Jonas handed in two flights, with tickets and boarding passes, and the AI check found nothing. Look at his trips and approve.',
    here: 'His trips, tickets and bank details are on this page, and the AI check is all clear. Click "Approve Reimbursement": you will see the email Jonas would get.',
    go: 'Open Jonas',
  },
  QUESTION: {
    label: 'Ask Elena a question',
    title: 'Ask Elena a question',
    text: 'The AI check found one thing: Elena changed an amount by hand. Send her reimbursement back with a short question, so she can fix it and hand in again.',
    here: 'Read what the AI found. Then click "Reopen Reimbursement" and write Elena what you need: you will see the email she would get.',
    go: 'Open Elena',
  },
  PARTICIPANT: {
    label: 'Be a participant',
    title: 'Be a participant yourself',
    text: 'See what your participants see. You play Sam: add the sample tickets, let the AI build the trips, fill in the bank details and hand in. It takes about two minutes.',
    here: 'See what your participants see. You play Sam: add the sample tickets, let the AI build the trips, fill in the bank details and hand in. It takes about two minutes.',
    go: "Open Sam's page",
  },
  AUDIT: {
    label: 'Download the audit file',
    title: 'Download the audit file',
    text: 'For every approved participant there is one PDF with the trips, the amounts and all the tickets: what your National Agency can ask for.',
    here: 'Click "Download Audit PDF": one file with the trips, the amounts and all the tickets of this participant.',
    go: 'Open the approved participant',
  },
};

/** The page of the app the organiser is on, as far as the guide cares */
export type PracticePage = { kind: 'dashboard' } | { kind: 'project'; projectId: string } | { kind: 'participant'; participantId: string };

/** Where a step is done: a page of the organiser's app, or the participant's own page */
export type PracticePlace = { kind: 'app'; path: string } | { kind: 'participant-page'; path: string };

const stepOf = (guide: PracticeGuide, id: PracticeStep) => guide.steps.find((s) => s.id === id);

/** A step that can't be done yet, with what has to happen first (null: it can) */
export function practiceStepBlocked(guide: PracticeGuide, id: PracticeStep): string | null {
  const step = stepOf(guide, id);
  if (!step) return null;
  if (!step.possible) return 'The participant this step is about was deleted. Start the practice again to get everybody back.';
  if (id === 'AUDIT' && !guide.steps.some((s) => s.id === 'APPROVE' && s.done) && !step.done) {
    return 'The audit file is made for approved participants: approve Jonas first.';
  }
  return null;
}

export function practicePlace(guide: PracticeGuide, id: PracticeStep): PracticePlace | null {
  const step = stepOf(guide, id);
  if (!step) return null;
  if (id === 'MEET') return { kind: 'app', path: `/org/projects/${guide.projectId}` };
  if (id === 'PARTICIPANT') return guide.you ? { kind: 'participant-page', path: `/reimbursement?token=${guide.you.token}` } : null;
  return step.participantId ? { kind: 'app', path: `/org/participants/${step.participantId}` } : null;
}

/** Whether the organiser is on the page where the step is done */
export function atPracticePlace(guide: PracticeGuide, id: PracticeStep, page: PracticePage): boolean {
  const step = stepOf(guide, id);
  if (!step) return false;
  if (id === 'MEET') return page.kind === 'project' && page.projectId === guide.projectId;
  if (id === 'PARTICIPANT') return false; // done on the participant's own page, in another tab
  return page.kind === 'participant' && !!step.participantId && page.participantId === step.participantId;
}

/** The element on the page a step points at (marked with data-tour in the pages) */
export const PRACTICE_TARGET: Partial<Record<PracticeStep, string>> = {
  MEET: '[data-tour="participants"]',
  APPROVE: '[data-tour="approve"]',
  QUESTION: '[data-tour="reopen"]',
  AUDIT: '[data-tour="audit-pdf"]',
};

export function practiceProgress(guide: PracticeGuide): { done: number; total: number } {
  return { done: guide.steps.filter((s) => s.done).length, total: guide.steps.length };
}

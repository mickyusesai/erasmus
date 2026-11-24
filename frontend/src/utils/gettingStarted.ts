/**
 * What a new organisation is pointed at: the one next step until its first invitations are out.
 * The server works out which step it is (dashboard.gettingStarted); this turns it into words
 * and into the place to go, for the welcome screen and the next-step card alike.
 */
import type { GettingStartedStep, OrgDashboardData } from '../services/api';

export const STEP_LABELS: Record<GettingStartedStep, string> = {
  PROJECT: 'Project',
  PARTICIPANTS: 'Participants',
  AMOUNTS: 'Amounts',
  INVITATIONS: 'Invitations',
};

export interface NextStep {
  step: GettingStartedStep;
  /** 1-based position among the steps */
  number: number;
  total: number;
  title: string;
  text: string;
  button: string;
  /** Where the button goes */
  to: string;
}

const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

export function nextStep(dashboard: Pick<OrgDashboardData, 'gettingStarted' | 'freeProject' | 'credits'>): NextStep | null {
  const progress = dashboard.gettingStarted;
  if (!progress || progress.complete || !progress.next) return null;

  const position = { number: progress.steps.findIndex((s) => s.id === progress.next) + 1, total: progress.steps.length };
  const project = progress.projectId ? `/org/projects/${progress.projectId}` : null;
  const free = dashboard.freeProject;
  const credits = dashboard.credits.available;

  switch (progress.next) {
    case 'PROJECT':
      if (progress.projectIsPlaceholder && project) {
        return {
          step: 'PROJECT', ...position,
          title: 'Set up your free project',
          text: `Your test project is free for up to ${free?.maxParticipants ?? 10} participants. Give it its real name, place and dates.`,
          button: 'Open its settings',
          to: `${project}?tab=settings`,
        };
      }
      if (free?.available) {
        return {
          step: 'PROJECT', ...position,
          title: 'Set up your first project',
          text: `It's free for up to ${free.maxParticipants} participants. Its name, place and dates are enough to start.`,
          button: 'Set up my project',
          to: '/org/projects/new',
        };
      }
      if (credits > 0) {
        return {
          step: 'PROJECT', ...position,
          title: 'Create your first project',
          text: `You have ${credits} project credit${credits === 1 ? '' : 's'}. One credit covers a project with up to 60 participants.`,
          button: 'Create my project',
          to: '/org/projects/new',
        };
      }
      return {
        step: 'PROJECT', ...position,
        title: 'Create your first project',
        text: 'A project needs a project credit. One credit covers a project with up to 60 participants.',
        button: 'See the prices',
        to: '/org/billing',
      };
    case 'PARTICIPANTS':
      return {
        step: 'PARTICIPANTS', ...position,
        title: 'Add your participants',
        text: 'Paste your list, or type them in. Nobody gets an email yet.',
        button: 'Add participants',
        to: `${project}/setup?step=2`,
      };
    case 'AMOUNTS':
      return {
        step: 'AMOUNTS', ...position,
        title: 'Set the maximum amounts',
        text: `One maximum per sending country, from the travel budget in your grant agreement. Still open: ${list(progress.countriesWithoutAmount)}.`,
        button: 'Set the amounts',
        to: `${project}/setup?step=3`,
      };
    case 'INVITATIONS':
      return {
        step: 'INVITATIONS', ...position,
        title: 'Send the invitations',
        text: 'Each participant gets an email with a personal link to upload their tickets. Send them now, or plan them for a day.',
        button: 'Choose when they go out',
        to: `${project}/setup?step=4`,
      };
  }
}

/**
 * Show the welcome? Only to an organisation that has not seen it and has not started yet,
 * never to support looking along. `seenInThisBrowser` is the mark the old five-slide intro
 * left in the browser: whoever closed that one is not welcomed again.
 */
export function shouldWelcome(dashboard: OrgDashboardData, seenInThisBrowser: boolean): boolean {
  if (dashboard.supportSession) return false;
  if (!dashboard.onboarding || !dashboard.gettingStarted) return false; // an older server answer
  if (dashboard.onboarding.welcomeSeenAt || seenInThisBrowser) return false;
  return !dashboard.gettingStarted.complete && dashboard.stats.totalParticipants === 0;
}

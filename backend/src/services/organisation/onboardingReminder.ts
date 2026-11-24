/**
 * One reminder for an organisation that signed up and has not got going: three days later,
 * once, from Micky, saying where they are and offering help. Never a second one.
 *
 * Whether it is due and what it says are worked out from data, so they can be tested
 * without a database.
 */
import prisma from '../../utils/prisma.js';
import { getEmailService } from '../email/index.js';
import { gettingStarted, type GettingStarted } from './onboarding.js';

const DAY = 24 * 60 * 60 * 1000;

/** Days after signing up that the reminder goes out */
export const REMINDER_AFTER_DAYS = 3;
/** After this many days it is too late to be a reminder: it is not sent any more */
export const REMINDER_UNTIL_DAYS = 14;
/** Organisations from before the reminder existed never get one */
export const REMINDER_SINCE = new Date('2026-11-24T00:00:00Z');

export interface ReminderCandidate {
  createdAt: Date;
  onboardingReminderSentAt: Date | null;
  isTestAccount: boolean;
  isActive: boolean;
}

/** Old enough, not too old, never reminded, a real and active organisation */
export function reminderAge(org: ReminderCandidate, now: Date = new Date()): boolean {
  if (org.onboardingReminderSentAt || org.isTestAccount || !org.isActive) return false;
  if (org.createdAt < REMINDER_SINCE) return false;
  const age = now.getTime() - org.createdAt.getTime();
  return age >= REMINDER_AFTER_DAYS * DAY && age < REMINDER_UNTIL_DAYS * DAY;
}

/** What the reminder says about where the organisation is, and what its button says */
export function reminderWords(progress: GettingStarted, projectName: string | null): { where: string; button: string } | null {
  const project = projectName ? `"${projectName}"` : 'your project';
  switch (progress.next) {
    case 'PROJECT':
      return {
        where:
          'You have not set up a project yet. If you would like to see first what it does: the practice project takes two minutes, with made-up participants and sample tickets. Your first real project is free for up to 10 participants.',
        button: 'Open EasyReimburse',
      };
    case 'PARTICIPANTS':
      return {
        where: `Your project ${project} is waiting for its participants. You can paste your list straight from your sheet.`,
        button: 'Add the participants',
      };
    case 'AMOUNTS':
      return {
        where: `Your project ${project} has its participants. One thing is missing before they can be invited: the maximum amount per sending country.`,
        button: 'Set the amounts',
      };
    case 'INVITATIONS':
      return {
        where: `Your project ${project} is ready. The only thing left is the invitations: send them now, or plan them for a day.`,
        button: 'Send the invitations',
      };
    default:
      // Under way already: no reminder needed
      return null;
  }
}

/** Sends the reminders that are due. Called every hour. Answers how many went out. */
export async function sendOnboardingReminders(now: Date = new Date()): Promise<number> {
  const candidates = await prisma.organisation.findMany({
    where: {
      onboardingReminderSentAt: null,
      isTestAccount: false,
      isActive: true,
      createdAt: {
        gte: new Date(Math.max(REMINDER_SINCE.getTime(), now.getTime() - REMINDER_UNTIL_DAYS * DAY)),
        lte: new Date(now.getTime() - REMINDER_AFTER_DAYS * DAY),
      },
    },
    include: {
      projects: {
        where: { isPracticeProject: false },
        include: {
          participants: { select: { country: true, lastMagicLinkSentAt: true } },
          countryLimits: { select: { country: true, maxReimbursementAmount: true } },
        },
      },
    },
  });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  let sent = 0;
  for (const org of candidates) {
    if (!reminderAge(org, now)) continue;
    const progress = gettingStarted(
      org.projects.map((p) => ({
        id: p.id,
        name: p.name,
        country: p.country,
        isTestProject: p.isTestProject,
        createdAt: p.createdAt,
        participants: p.participants.map((x) => ({ country: x.country, invited: x.lastMagicLinkSentAt !== null })),
        invitationsPlanned: p.inviteAt !== null,
        limits: p.countryLimits.map((l) => ({ country: l.country, max: l.maxReimbursementAmount })),
      }))
    );
    const words = reminderWords(progress, org.projects.find((p) => p.id === progress.projectId && !progress.projectIsPlaceholder)?.name ?? null);
    if (!words) continue; // got going by itself

    // Marked first: whatever happens while sending, there is never a second reminder
    const { count } = await prisma.organisation.updateMany({ where: { id: org.id, onboardingReminderSentAt: null }, data: { onboardingReminderSentAt: now } });
    if (count === 0) continue;

    const result = await getEmailService()
      .sendOnboardingReminder(org.email, { organisationName: org.name, firstName: org.contactFirstName, loginUrl: `${frontendUrl}/org/dashboard`, ...words })
      .catch((err) => ({ success: false, error: err instanceof Error ? err.message : String(err) }));
    if (result.success) sent++;
    else console.error(`[Onboarding] The reminder to ${org.email} could not be sent:`, result.error);
  }
  if (sent > 0) console.log(`[Onboarding] ${sent} reminder(s) sent`);
  return sent;
}

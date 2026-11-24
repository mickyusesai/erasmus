/**
 * Inviting participants: sending each their own link, now or on a planned day.
 *
 * An organiser can plan the invitations of a project for a day (`Project.inviteAt`). When that
 * moment has come, everybody in the project who has no link yet gets theirs, once.
 */
import type { Participant, Project } from '@prisma/client';
import prisma from '../../utils/prisma.js';
import { projectEmailContext } from '../email/context.js';
import { mailerFor, type Mailer } from '../email/previewEmail.js';

const DAY = 24 * 60 * 60 * 1000;

/** The email service could not send the invitation (the participant is not marked as invited) */
export class InvitationNotSent extends Error {
  constructor(public email: string, reason?: string) {
    super(`The invitation to ${email} could not be sent${reason ? `: ${reason}` : '.'}`);
    this.name = 'InvitationNotSent';
  }
}

function participantLink(participant: { magicLinkToken: string }): string {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${frontendUrl}/reimbursement?token=${participant.magicLinkToken}`;
}

/**
 * Sends one participant their link and remembers when. The link then works until 180 days
 * after the project ends (or from now, when it has ended). In the practice project the email
 * is written to be shown, never sent (see mailerFor).
 */
export async function sendInvitation(participant: Participant & { project: Project }, mail: Mailer = mailerFor(participant.project)): Promise<void> {
  const result = await mail.service.sendMagicLink(
    participant.email,
    participant.firstName,
    participant.project.name,
    participantLink(participant),
    await projectEmailContext(participant.project, participant.id)
  );
  if (!result.success) throw new InvitationNotSent(participant.email, result.error);

  const sentAt = new Date();
  await prisma.participant.update({
    where: { id: participant.id },
    data: {
      lastMagicLinkSentAt: sentAt,
      tokenExpiresAt: new Date(Math.max(participant.project.endDate.getTime(), sentAt.getTime()) + 180 * DAY),
    },
  });
}

/**
 * The moment invitations planned for a day go out: 07:00 UTC, the start of the working day
 * in most of Europe. Null when the text is not a day.
 */
export function invitationMoment(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const moment = new Date(`${day}T07:00:00.000Z`);
  return Number.isNaN(moment.getTime()) ? null : moment;
}

/** Why invitations can't be planned for this day, or null when they can */
export function whyNotPlannable(day: string, now: Date = new Date()): string | null {
  const moment = invitationMoment(day);
  if (!moment) return 'Please choose a day.';
  if (moment.getTime() <= now.getTime()) return 'That moment has passed. Choose a later day, or send the invitations now.';
  if (moment.getTime() > now.getTime() + 366 * DAY) return 'Please choose a day within a year from now.';
  return null;
}

/** Everybody in the project who has no link yet */
export function participantsWithoutLink(projectId: string) {
  return prisma.participant.findMany({
    where: { projectId, lastMagicLinkSentAt: null, magicLinkActive: true },
    include: { project: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Sends the planned invitations whose moment has come. Called every few minutes.
 * The plan is cleared before the first email leaves, so whatever happens half-way,
 * a round can never go out twice.
 */
export async function sendDueInvitations(now: Date = new Date()): Promise<number> {
  const due = await prisma.project.findMany({
    where: { inviteAt: { lte: now }, isPracticeProject: false },
    select: { id: true, name: true, inviteAt: true },
  });

  let sent = 0;
  for (const project of due) {
    const { count } = await prisma.project.updateMany({ where: { id: project.id, inviteAt: project.inviteAt }, data: { inviteAt: null } });
    if (count === 0) continue; // changed or taken by another run in the meantime

    const participants = await participantsWithoutLink(project.id);
    let failed = 0;
    for (const participant of participants) {
      try {
        await sendInvitation(participant);
        sent++;
      } catch (err) {
        failed++;
        console.error(`[Invitations] Could not invite ${participant.email} for "${project.name}":`, err instanceof Error ? err.message : err);
      }
    }
    console.log(`[Invitations] "${project.name}": ${participants.length - failed} planned invitation(s) sent${failed ? `, ${failed} failed` : ''}`);
  }
  return sent;
}

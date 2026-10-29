import { randomBytes } from 'crypto';
import prisma from '../../utils/prisma.js';

/**
 * Project-specific context for participant-facing emails: who is sending
 * (organisation name → sender display name + Reply-To) and the optional
 * notes the organisation configured (instructions, deadline, contact).
 */
export interface ProjectEmailContext {
  organisationName: string;
  /**
   * Where participants' replies go: the participant's own inbound address when the
   * inbox is configured (replies are then forwarded to the organisation with an AI
   * summary), otherwise the project's contact email, otherwise the organisation's login email
   */
  replyTo?: string;
  instructions?: string | null;
  deadline?: Date | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

interface ProjectLike {
  organisationId: string;
  participantInstructions?: string | null;
  documentDeadline?: Date | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

/** The domain replies are received on (Postmark inbound), e.g. reply.easyreimburse.ai */
export function inboundEmailDomain(): string | null {
  const domain = process.env.INBOUND_EMAIL_DOMAIN?.trim().toLowerCase();
  return domain ? domain : null;
}

/** reply+<code>@<inbound domain> for one participant (the code is created on first use) */
export async function participantReplyAddress(participantId: string): Promise<string | null> {
  const domain = inboundEmailDomain();
  if (!domain) return null;
  const existing = await prisma.participant.findUnique({ where: { id: participantId }, select: { replyCode: true } });
  if (!existing) return null;
  let code = existing.replyCode;
  if (!code) {
    code = randomBytes(10).toString('hex');
    await prisma.participant.update({ where: { id: participantId }, data: { replyCode: code } });
  }
  return `reply+${code}@${domain}`;
}

/** The organisation's own address for participants: project contact email, else the login email */
export async function organisationReplyAddress(project: ProjectLike): Promise<{ name: string; email: string | null }> {
  const org = await prisma.organisation.findUnique({
    where: { id: project.organisationId },
    select: { name: true, email: true },
  });
  return { name: org?.name || 'The project team', email: project.contactEmail?.trim() || org?.email || null };
}

/**
 * Build the email context for a project row (loads the organisation). Pass the participant
 * so their replies come back through the inbox when it is configured.
 */
export async function projectEmailContext(project: ProjectLike, participantId?: string): Promise<ProjectEmailContext> {
  const org = await organisationReplyAddress(project);
  const inbound = participantId ? await participantReplyAddress(participantId) : null;
  return {
    organisationName: org.name,
    replyTo: inbound || org.email || undefined,
    instructions: project.participantInstructions ?? null,
    deadline: project.documentDeadline ?? null,
    contactEmail: project.contactEmail ?? null,
    contactPhone: project.contactPhone ?? null,
  };
}

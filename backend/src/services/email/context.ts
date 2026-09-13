import prisma from '../../utils/prisma.js';

/**
 * Project-specific context for participant-facing emails: who is sending
 * (organisation name → sender display name + Reply-To) and the optional
 * notes the organisation configured (instructions, deadline, contact).
 */
export interface ProjectEmailContext {
  organisationName: string;
  /** Organisation login email — participants' replies go here */
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

/** Build the email context for a project row (loads the organisation). */
export async function projectEmailContext(project: ProjectLike): Promise<ProjectEmailContext> {
  const org = await prisma.organisation.findUnique({
    where: { id: project.organisationId },
    select: { name: true, email: true },
  });
  return {
    organisationName: org?.name || 'The project team',
    replyTo: org?.email || undefined,
    instructions: project.participantInstructions ?? null,
    deadline: project.documentDeadline ?? null,
    contactEmail: project.contactEmail ?? null,
    contactPhone: project.contactPhone ?? null,
  };
}

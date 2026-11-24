/**
 * How far each organisation has come since signing up, for super-admin: tried the practice
 * project, set up a project of its own, added participants, invited them, received a first
 * hand-in, bought a credit. Counted for all organisations in a few queries.
 */
import { Prisma } from '@prisma/client';
import prisma from '../../utils/prisma.js';
import { readOnboarding } from './onboarding.js';
import { practiceGuide, type PracticeParticipant } from './practice/guide.js';

export interface OrganisationProgress {
  /** Steps of the practice guide done (0 to 5); null when there is no practice project */
  practiceSteps: number | null;
  /** Its own projects (the practice project is none) */
  projects: number;
  participants: number;
  invited: number;
  /** Participants who handed in */
  submitted: number;
  /** Completed purchases */
  purchases: number;
  /** When the three-day reminder went out, if it did */
  reminderSentAt: Date | null;
}

export const PROGRESS_STAGES = ['SIGNED_UP', 'PROJECT', 'PARTICIPANTS', 'INVITED', 'SUBMISSION'] as const;
export type ProgressStage = (typeof PROGRESS_STAGES)[number];

/** The furthest point an organisation has reached with its own projects */
export function progressStage(progress: Pick<OrganisationProgress, 'projects' | 'participants' | 'invited' | 'submitted'>): ProgressStage {
  if (progress.submitted > 0) return 'SUBMISSION';
  if (progress.invited > 0) return 'INVITED';
  if (progress.participants > 0) return 'PARTICIPANTS';
  if (progress.projects > 0) return 'PROJECT';
  return 'SIGNED_UP';
}

interface ParticipantCounts {
  organisationId: string;
  participants: bigint;
  invited: bigint;
  submitted: bigint;
}

export async function progressOfOrganisations(
  organisations: { id: string; onboarding: Prisma.JsonValue | null; onboardingReminderSentAt: Date | null }[]
): Promise<Map<string, OrganisationProgress>> {
  const [projects, counts, purchases, practicePeople] = await Promise.all([
    prisma.project.groupBy({ by: ['organisationId'], where: { isPracticeProject: false }, _count: { _all: true } }),
    prisma.$queryRaw<ParticipantCounts[]>(Prisma.sql`
      select p."organisationId",
             count(*) as participants,
             count(*) filter (where x."lastMagicLinkSentAt" is not null) as invited,
             count(*) filter (where x.status <> 'DRAFT') as submitted
      from "Participant" x join "Project" p on p.id = x."projectId"
      where not p."isPracticeProject"
      group by p."organisationId"`),
    prisma.purchase.groupBy({ by: ['organisationId'], where: { status: 'COMPLETED' }, _count: { _all: true } }),
    prisma.participant.findMany({
      where: { project: { isPracticeProject: true } },
      select: { id: true, email: true, firstName: true, status: true, reopenedAt: true, magicLinkToken: true, project: { select: { id: true, organisationId: true } } },
    }),
  ]);

  const projectCount = new Map(projects.map((p) => [p.organisationId, p._count._all]));
  const participantCount = new Map(counts.map((c) => [c.organisationId, c]));
  const purchaseCount = new Map(purchases.map((p) => [p.organisationId, p._count._all]));
  const practice = new Map<string, { projectId: string; people: PracticeParticipant[] }>();
  for (const person of practicePeople) {
    const entry = practice.get(person.project.organisationId) ?? { projectId: person.project.id, people: [] };
    if (entry.projectId === person.project.id) entry.people.push(person);
    practice.set(person.project.organisationId, entry);
  }

  const result = new Map<string, OrganisationProgress>();
  for (const org of organisations) {
    const own = participantCount.get(org.id);
    const tried = practice.get(org.id);
    result.set(org.id, {
      practiceSteps: tried ? practiceGuide(tried.projectId, tried.people, readOnboarding(org.onboarding).practice).steps.filter((s) => s.done).length : null,
      projects: projectCount.get(org.id) ?? 0,
      participants: Number(own?.participants ?? 0),
      invited: Number(own?.invited ?? 0),
      submitted: Number(own?.submitted ?? 0),
      purchases: purchaseCount.get(org.id) ?? 0,
      reminderSentAt: org.onboardingReminderSentAt,
    });
  }
  return result;
}

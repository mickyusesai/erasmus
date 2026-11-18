/**
 * What every new organisation starts with: the account itself and a free test project.
 * Sign-up and the onboarding test account (super-admin) both use this, so the test account
 * always begins exactly like a real new organisation.
 */
import type { Organisation, Prisma } from '@prisma/client';

export const TEST_PROJECT_MAX_PARTICIPANTS = 10;

export interface NewOrganisation {
  name: string;
  email: string;
  passwordHash: string;
  oid?: string | null;
  isTestAccount?: boolean;
  projectCredits?: number;
}

/** Run inside a transaction: the organisation and its test project are created together */
export async function createOrganisationWithTestProject(tx: Prisma.TransactionClient, data: NewOrganisation): Promise<Organisation> {
  const org = await tx.organisation.create({
    data: {
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      oid: data.oid || null,
      ...(data.isTestAccount && { isTestAccount: true }),
      ...(data.projectCredits && { projectCredits: data.projectCredits }),
    },
  });

  const startDate = new Date();
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 1); // 1 year from now

  await tx.project.create({
    data: {
      organisationId: org.id,
      name: 'Test Project',
      description: 'A free test project to try out the platform. Limited to 10 participants.',
      country: 'Test',
      startDate,
      endDate,
      isTestProject: true,
      requireGreenTravelDeclaration: true,
      maxParticipants: TEST_PROJECT_MAX_PARTICIPANTS,
      creditSource: null, // No credit consumed for test projects
    },
  });

  return org;
}

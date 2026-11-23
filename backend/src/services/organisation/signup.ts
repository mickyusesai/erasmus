/**
 * What every new organisation starts with. Sign-up and the onboarding test account
 * (super-admin) both use this, so the test account always begins exactly like a real new
 * organisation.
 *
 * There is no automatic "Test Project" any more: the first project an organisation creates
 * itself is free for up to 10 participants (services/organisation/onboarding.ts).
 */
import type { Organisation, Prisma } from '@prisma/client';

export interface NewOrganisation {
  name: string;
  email: string;
  passwordHash: string;
  oid?: string | null;
  isTestAccount?: boolean;
  projectCredits?: number;
}

/** Run inside a transaction, so whatever a new organisation starts with is created together */
export async function createNewOrganisation(tx: Prisma.TransactionClient, data: NewOrganisation): Promise<Organisation> {
  return tx.organisation.create({
    data: {
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      oid: data.oid || null,
      ...(data.isTestAccount && { isTestAccount: true }),
      ...(data.projectCredits && { projectCredits: data.projectCredits }),
    },
  });
}

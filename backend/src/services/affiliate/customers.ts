/**
 * An affiliate's customers, and linking customers to an affiliate by hand: for organisations an
 * affiliate brought in without using their code.
 *
 * A link only matters from the next purchase on. Commissions are created by the Stripe webhook
 * at the moment a purchase is completed and never afterwards, so whatever the organisation bought
 * before it was linked earns the affiliate nothing.
 */
import { Prisma } from '@prisma/client';
import prisma from '../../utils/prisma.js';
import { ConflictError, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';

export const MAX_CUSTOMERS_PER_REQUEST = 100;

export interface LinkCandidate {
  id: string;
  name: string;
  isTestAccount: boolean;
  /** The affiliate this organisation is already a customer of */
  customerLink: { affiliate: { name: string } } | null;
}

/** Why an organisation can't become a customer of this affiliate, or null when it can */
export function whyNotLinkable(affiliateId: string, org: LinkCandidate): string | null {
  if (org.id === affiliateId) return `${org.name} is the affiliate itself`;
  if (org.isTestAccount) return `${org.name} is the onboarding test account`;
  // One affiliate per customer, for good
  if (org.customerLink) return `${org.name} is already a customer of ${org.customerLink.affiliate.name}`;
  return null;
}

/** A link made by hand can be undone while it has earned nothing; anything else stays */
export function canUnlink(link: { addedBy: string | null; commissionCount: number }): boolean {
  return link.addedBy !== null && link.commissionCount === 0;
}

async function findAffiliate(affiliateId: string) {
  const affiliate = await prisma.organisation.findUnique({
    where: { id: affiliateId },
    select: { id: true, name: true, isAffiliate: true, affiliateActive: true, affiliateCode: true, commissionRate: true },
  });
  if (!affiliate || !affiliate.isAffiliate) throw new NotFoundError('Affiliate not found');
  return affiliate;
}

/** The affiliate's customers, plus the organisations that could still be added */
export async function listAffiliateCustomers(affiliateId: string) {
  const affiliate = await findAffiliate(affiliateId);

  const links = await prisma.affiliateLink.findMany({
    where: { affiliateId },
    orderBy: { createdAt: 'desc' },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          purchases: { where: { status: 'COMPLETED' }, select: { completedAt: true, createdAt: true } },
        },
      },
      commissions: { select: { amountCents: true, status: true } },
    },
  });

  const customers = links.map((link) => {
    const counted = link.commissions.filter((c) => c.status !== 'REVERSED');
    return {
      linkId: link.id,
      organisationId: link.customer.id,
      name: link.customer.name,
      email: link.customer.email,
      linkedAt: link.createdAt,
      addedBy: link.addedBy,
      // Bought before the link: shown so it is clear these earn nothing
      purchasesBeforeLink: link.customer.purchases.filter((p) => (p.completedAt ?? p.createdAt) < link.createdAt).length,
      commissionCount: counted.length,
      commissionCents: counted.reduce((sum, c) => sum + c.amountCents, 0),
      removable: canUnlink({ addedBy: link.addedBy, commissionCount: link.commissions.length }),
    };
  });

  const [free, linkedElsewhere] = await Promise.all([
    prisma.organisation.findMany({
      where: { id: { not: affiliateId }, isTestAccount: false, customerLink: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        _count: { select: { purchases: { where: { status: 'COMPLETED' } } } },
      },
    }),
    prisma.affiliateLink.count({ where: { affiliateId: { not: affiliateId } } }),
  ]);

  return {
    affiliate: {
      id: affiliate.id,
      name: affiliate.name,
      affiliateCode: affiliate.affiliateCode,
      affiliateActive: affiliate.affiliateActive,
      commissionRate: affiliate.commissionRate,
    },
    customers,
    available: free.map((o) => ({ id: o.id, name: o.name, email: o.email, createdAt: o.createdAt, completedPurchases: o._count.purchases })),
    linkedToOtherAffiliates: linkedElsewhere,
  };
}

/**
 * Link organisations to an affiliate by hand. All or nothing: when one of them can't be linked,
 * none is, and the message says which and why.
 */
export async function linkCustomersByHand(affiliateId: string, organisationIds: string[], addedBy: string) {
  const affiliate = await findAffiliate(affiliateId);
  if (!affiliate.affiliateActive) {
    throw new ValidationError(`${affiliate.name} is deactivated as an affiliate. Activate it first to add customers.`);
  }

  const ids = [...new Set(organisationIds)];
  if (ids.length === 0) throw new ValidationError('Choose at least one organisation');
  if (ids.length > MAX_CUSTOMERS_PER_REQUEST) throw new ValidationError(`Add at most ${MAX_CUSTOMERS_PER_REQUEST} organisations at a time`);

  const organisations = await prisma.organisation.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, isTestAccount: true, customerLink: { select: { affiliate: { select: { name: true } } } } },
  });
  if (organisations.length !== ids.length) throw new NotFoundError('One of the organisations no longer exists. Reload and try again.');

  const problems = organisations.map((org) => whyNotLinkable(affiliateId, org)).filter((p): p is string => p !== null);
  if (problems.length > 0) throw new ValidationError(`Nothing was added: ${problems.join('; ')}.`);

  try {
    await prisma.affiliateLink.createMany({
      data: organisations.map((org) => ({ affiliateId, customerId: org.id, addedBy })),
    });
  } catch (err) {
    // Someone (or a checkout with an affiliate code) linked one of them in the meantime
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('Nothing was added: one of these organisations was linked to an affiliate a moment ago. Reload and try again.');
    }
    throw err;
  }

  console.log(`[Affiliate] ${addedBy} linked ${organisations.length} organisation(s) to affiliate ${affiliate.name} by hand: ${organisations.map((o) => o.name).join(', ')}`);
  return { affiliate, added: organisations.map((o) => ({ id: o.id, name: o.name })) };
}

/** Undo a link that was made by hand, as long as it has not earned anything */
export async function unlinkCustomerAddedByHand(affiliateId: string, linkId: string, removedBy: string) {
  const link = await prisma.affiliateLink.findFirst({
    where: { id: linkId, affiliateId },
    include: { customer: { select: { name: true } }, _count: { select: { commissions: true } } },
  });
  if (!link) throw new NotFoundError('This customer is not linked to the affiliate (any more)');
  if (link.addedBy === null) {
    throw new ValidationError(`${link.customer.name} was linked by using the affiliate's code and stays linked.`);
  }
  if (link._count.commissions > 0) {
    throw new ValidationError(`${link.customer.name} already earned the affiliate commission, so this link stays.`);
  }

  // Only when still without commission at this very moment (a purchase may be completing right now)
  const { count } = await prisma.affiliateLink.deleteMany({ where: { id: linkId, affiliateId, commissions: { none: {} } } });
  if (count === 0) throw new ConflictError(`${link.customer.name} just earned the affiliate commission, so this link stays.`);

  console.log(`[Affiliate] ${removedBy} removed the hand-made link of ${link.customer.name} to affiliate ${affiliateId}`);
  return { name: link.customer.name };
}

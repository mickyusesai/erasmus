import prisma from '../../utils/prisma.js';

/**
 * Allowance rules are organisation-defined extras (e.g. green-travel per diems
 * or hotel receipts) that live next to the transport travel items. This module
 * computes each participant's allowance lines from their claims and the
 * project's rules, persists the computed amounts, and returns the split the
 * summary calculator needs (inside the cap vs on top of it).
 */

export interface AllowanceRuleLike {
  mode: 'PER_TRAVEL_DAY' | 'PER_RECEIPT';
  audience: 'ALL' | 'GREEN_TRAVEL';
  active: boolean;
  amountPerDay: number | null;
  maxDays: number | null;
  capPerDay: number | null;
  capTotal: number | null;
  countsTowardMax: boolean;
}

export interface AllowanceTotals {
  insideCap: number;
  onTop: number;
  total: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Does this rule apply to a participant with the given effective green-travel status? */
export function ruleAppliesTo(rule: Pick<AllowanceRuleLike, 'active' | 'audience'>, greenTravel: boolean): boolean {
  return rule.active && (rule.audience === 'ALL' || greenTravel);
}

/** Clamp claimed days to the rule's maximum */
export function clampDays(rule: Pick<AllowanceRuleLike, 'maxDays'>, days: number | null | undefined): number {
  const d = Math.max(0, Math.floor(days ?? 0));
  return rule.maxDays != null ? Math.min(d, rule.maxDays) : d;
}

/** Pure per-line amount: days × rate, or receipts total after the rule's caps */
export function computeAllowanceLineAmount(
  rule: AllowanceRuleLike,
  days: number | null | undefined,
  receiptsEur: number
): number {
  if (rule.mode === 'PER_TRAVEL_DAY') {
    return round2(clampDays(rule, days) * (rule.amountPerDay ?? 0));
  }
  let amount = Math.max(0, receiptsEur);
  if (rule.capPerDay != null && days != null && days > 0) amount = Math.min(amount, rule.capPerDay * days);
  if (rule.capTotal != null) amount = Math.min(amount, rule.capTotal);
  return round2(amount);
}

/**
 * Recompute and persist every allowance line of a participant. Lines whose rule
 * is inactive or does not apply to the participant compute to 0 (data is kept).
 */
export async function refreshParticipantAllowances(
  participantId: string,
  greenTravel: boolean
): Promise<AllowanceTotals> {
  const lines = await prisma.participantAllowance.findMany({
    where: { participantId },
    include: { rule: true, receipts: { select: { amountEur: true } } },
  });

  let insideCap = 0;
  let onTop = 0;
  for (const line of lines) {
    const receiptsEur = line.receipts.reduce((s, r) => s + (r.amountEur ?? 0), 0);
    const amount = ruleAppliesTo(line.rule, greenTravel)
      ? computeAllowanceLineAmount(line.rule, line.days, receiptsEur)
      : 0;
    if (amount !== line.amountEur) {
      await prisma.participantAllowance.update({ where: { id: line.id }, data: { amountEur: amount } });
    }
    if (line.rule.countsTowardMax) insideCap += amount;
    else onTop += amount;
  }

  return { insideCap: round2(insideCap), onTop: round2(onTop), total: round2(insideCap + onTop) };
}

/**
 * Suggested number of extra travel days from the participant's tickets: days
 * between the first departure and the project start, plus days between the
 * project end and the last travel date. Purely a pre-fill; the participant
 * (or organisation) decides the final number.
 */
export function suggestTravelDays(
  travelItems: { departureDate: Date | null; arrivalDate: Date | null; excludedFromReimbursement: boolean }[],
  projectStart: Date,
  projectEnd: Date
): number {
  const dates = travelItems
    .filter((t) => !t.excludedFromReimbursement)
    .flatMap((t) => [t.departureDate, t.arrivalDate])
    .filter((d): d is Date => !!d)
    .map((d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (dates.length === 0) return 0;
  const dayMs = 24 * 60 * 60 * 1000;
  const start = Date.UTC(projectStart.getUTCFullYear(), projectStart.getUTCMonth(), projectStart.getUTCDate());
  const end = Date.UTC(projectEnd.getUTCFullYear(), projectEnd.getUTCMonth(), projectEnd.getUTCDate());
  const first = Math.min(...dates);
  const last = Math.max(...dates);
  const before = Math.max(0, Math.round((start - first) / dayMs));
  const after = Math.max(0, Math.round((last - end) / dayMs));
  return before + after;
}

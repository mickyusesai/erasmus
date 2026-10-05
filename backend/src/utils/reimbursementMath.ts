/**
 * The single reimbursement formula. Keep frontend/src/utils/reimbursementMath.ts
 * byte-identical (separate package, no shared build).
 *
 * - Travel costs plus allowances that "count toward the maximum" are capped at
 *   the participant's maximum (unless no maximum is configured, or a
 *   multi-person booking disables the per-person cap).
 * - Allowances paid "on top" are added after the cap.
 * - With no allowances this is exactly the historical formula.
 */
export interface PayableInput {
  travelEur: number;
  allowanceInsideCap: number;
  allowanceOnTop: number;
  maxReimbursement: number; // 0 = not configured / uncapped
  hasMultiPersonBooking: boolean;
}

export interface PayableResult {
  /** Amount after the cap, before on-top allowances */
  base: number;
  /** Final payable amount */
  total: number;
  /** True when the cap actually reduced the base amount */
  capped: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computePayable(input: PayableInput): PayableResult {
  const claimed = round2(input.travelEur + input.allowanceInsideCap);
  const capApplies = input.maxReimbursement > 0 && !input.hasMultiPersonBooking;
  const base = capApplies ? Math.min(claimed, input.maxReimbursement) : claimed;
  return {
    base: round2(base),
    total: round2(base + input.allowanceOnTop),
    capped: capApplies && claimed > input.maxReimbursement,
  };
}

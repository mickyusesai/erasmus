/**
 * Resolves the reimbursement limit that actually applies to a participant.
 *
 * Limits are configured per sending country (ProjectCountryLimit), but an
 * organisation can give an individual participant their own maximum and/or
 * green-travel status. A null override means "use the country default".
 */

export interface CountryLimitLike {
  country: string;
  maxReimbursementAmount: number;
  greenTravel: boolean;
}

export interface ParticipantLimitFields {
  country: string;
  maxReimbursementOverride: number | null;
  greenTravelOverride: boolean | null;
}

export interface EffectiveLimit {
  /** Applicable maximum in EUR (0 = not configured / uncapped) */
  maxReimbursement: number;
  greenTravel: boolean;
  isIndividualMax: boolean;
  isIndividualGreen: boolean;
  /** The country defaults, for display next to an individual value */
  countryMax: number;
  countryGreen: boolean;
}

export function getEffectiveLimit(
  participant: ParticipantLimitFields,
  countryLimits: CountryLimitLike[] | CountryLimitLike | null | undefined
): EffectiveLimit {
  const countryLimit = Array.isArray(countryLimits)
    ? countryLimits.find((l) => l.country === participant.country)
    : countryLimits;

  const countryMax = countryLimit?.maxReimbursementAmount || 0;
  const countryGreen = countryLimit?.greenTravel || false;
  const isIndividualMax = participant.maxReimbursementOverride != null;
  const isIndividualGreen = participant.greenTravelOverride != null;

  return {
    maxReimbursement: isIndividualMax ? (participant.maxReimbursementOverride as number) : countryMax,
    greenTravel: isIndividualGreen ? (participant.greenTravelOverride as boolean) : countryGreen,
    isIndividualMax,
    isIndividualGreen,
    countryMax,
    countryGreen,
  };
}

/**
 * AI Review Rules Configuration
 *
 * Each rule defines a check the AI performs during participant review.
 * To adjust: edit the `prompt` text, toggle `enabled`, or change `severity`.
 * Rules are assembled into the AI prompt dynamically.
 */

export interface ReviewRule {
  id: string;
  severity: 'critical' | 'important' | 'info';
  label: string;           // Short category label for UI (2-3 words)
  description: string;     // Human-readable description of what this rule checks
  prompt: string;          // The instruction text given to the AI (uses {{placeholders}} for dynamic values)
  enabled: boolean;
}

export const REVIEW_RULES: ReviewRule[] = [
  // ─── CRITICAL (organisation must take action) ───

  {
    id: 'declaration-of-travel',
    severity: 'critical',
    label: 'Declaration Check',
    description: 'Flag declarations of travel that need manual verification',
    prompt: 'If a Declaration of Travel exists → tell org to verify the declaration PDF (check that route, date, and flight number are correct). This is NOT a "missing document" — it\'s a replacement that needs verification.',
    enabled: true,
  },
  {
    id: 'declaration-on-honor',
    severity: 'critical',
    label: 'Declaration Check',
    description: 'Flag declarations on honor that need review',
    prompt: 'If a Declaration on Honor exists → tell org to verify the sworn statement and decide if it\'s acceptable.',
    enabled: true,
  },
  {
    id: 'amount-manually-changed',
    severity: 'critical',
    label: 'Amount Changed',
    description: 'Participant changed an amount from what the AI detected',
    prompt: 'If a participant MANUALLY CHANGED AN AMOUNT from what the AI detected → flag the specific item with both amounts. This could be legitimate (AI was wrong) or suspicious.',
    enabled: true,
  },
  {
    id: 'price-missing',
    severity: 'critical',
    label: 'Missing Price',
    description: 'Travel item has no price — cannot reimburse',
    prompt: 'If a travel item has PRICE MISSING → flag it, can\'t reimburse without amount.',
    enabled: true,
  },
  {
    id: 'no-document-linked',
    severity: 'critical',
    label: 'No Document',
    description: 'Travel item has no supporting document',
    prompt: 'If a travel item has NO DOCUMENT LINKED → flag it, no proof of travel.',
    enabled: true,
  },

  // ─── IMPORTANT (organisation should review) ───

  {
    id: 'route-mismatch',
    severity: 'important',
    label: 'Route Mismatch',
    description: 'Route does not match expected home ↔ project travel pattern',
    prompt: 'If a route doesn\'t seem to match the expected home ({{participantCountry}}) ↔ project ({{projectCountry}}) travel pattern. IMPORTANT: Match cities to countries generously — for example Chisinau=Moldova, Skopje=North Macedonia, Brussels=Belgium, Amsterdam/Eindhoven=Netherlands, etc. A travel item from Chisinau to Amsterdam is a VALID route for a Moldovan participant traveling to The Netherlands. Only flag truly unrelated routes (e.g., a side trip to a country unrelated to both home and project).',
    enabled: true,
  },
  {
    id: 'home-country-mismatch',
    severity: 'important',
    label: 'Country Mismatch',
    description: 'AI-detected home country differs from stated country',
    prompt: 'If AI-detected home country differs from the participant\'s stated home country ({{participantCountry}}) — compare ONLY these two, do NOT confuse with the project country.',
    enabled: true,
  },
  {
    id: 'low-extraction-confidence',
    severity: 'important',
    label: 'Low Confidence',
    description: 'Document extraction confidence below 70%',
    prompt: 'If any document extraction has confidence below 70% → the extracted data might be wrong. IMPORTANT: Be precise with numbers — 72% is NOT below 70%. Only flag if the confidence is ACTUALLY below 70%.',
    enabled: true,
  },
  {
    id: 'shared-booking',
    severity: 'important',
    label: 'Shared Booking',
    description: 'Booking covers multiple passengers',
    prompt: 'If a booking has multiple passengers (numberOfPassengers > 1) → verify the claimed portion is fair. IMPORTANT: If numberOfPassengers is 1, it\'s a single person. A single person buying an outbound + inbound ticket is NOT "multiple passengers" — that\'s just a round-trip. Only flag when numberOfPassengers is explicitly > 1.',
    enabled: true,
  },
  {
    id: 'exceeds-limit',
    severity: 'important',
    label: 'Over Limit',
    description: 'Total claimed exceeds country reimbursement limit',
    prompt: 'If total claimed exceeds the country reimbursement limit.',
    enabled: true,
  },
  {
    id: 'changelog-edits',
    severity: 'important',
    label: 'Manual Edit',
    description: 'Participant changed important fields in changelog',
    prompt: 'If the changelog shows the participant changed important fields like amounts, routes, or dates (NOT just filling in empty fields — only flag actual changes from one value to another). Use the correct category: "Flight Edit" for flight numbers, "Route Edit" for locations, "Amount Edit" for prices. IMPORTANT: Do NOT flag changes to bank details fields (IBAN, BIC, account holder name, bank name, personal address fields) — participants always fill these in themselves, so any "change" is just them entering their data.',
    enabled: true,
  },
  {
    id: 'missing-flight-number',
    severity: 'important',
    label: 'Missing Flight #',
    description: 'Plane travel item without flight number',
    prompt: 'If a plane travel item is missing its flight number.',
    enabled: true,
  },

  // ─── INFORMATIONAL (good to know) ───

  {
    id: 'non-eur-no-purchase-date',
    severity: 'info',
    label: 'Exchange Rate',
    description: 'Non-EUR currency without purchase date for exchange rate',
    prompt: 'Non-EUR currency without purchase date (exchange rate may be approximate). IMPORTANT: Do NOT flag this if the travel item already has a purchaseDate value — only flag when purchaseDate is actually null/missing. Do NOT flag this for return legs of round-trip bookings (amountIncludedInRoundTrip=true) — those don\'t need a purchase date since the price is on the outbound leg. Also, if the participant manually filled in the purchase date (manuallyEdited=true), mention that the purchase date was entered by the participant.',
    enabled: true,
  },
  {
    id: 'dates-outside-project',
    severity: 'info',
    label: 'Date Range',
    description: 'Travel dates more than 4 days outside project window',
    prompt: 'Travel dates more than 4 days outside project window. IMPORTANT: 1-4 days before/after project dates is perfectly normal for travel — only flag when it\'s MORE than 4 days outside the window.',
    enabled: true,
  },
  {
    id: 'bank-details-incomplete',
    severity: 'info',
    label: 'Bank Details',
    description: 'Bank details are incomplete',
    prompt: 'Bank details incomplete (missing IBAN, holder name, or BIC).',
    enabled: true,
  },
  {
    id: 'unlinked-documents',
    severity: 'info',
    label: 'Unlinked Docs',
    description: 'Uploaded documents not linked to any travel item',
    prompt: 'Uploaded documents not linked to any travel item.',
    enabled: true,
  },
  {
    id: 'participant-note',
    severity: 'info',
    label: 'Participant Note',
    description: 'Participant left a note that should be surfaced',
    prompt: 'If the participant left a note in the PARTICIPANT\'S OWN NOTE field above → surface it so the org sees it. Do NOT create a finding about notes if no participant note exists.',
    enabled: true,
  },
  {
    id: 'doc-count-mismatch',
    severity: 'info',
    label: 'Doc Count',
    description: 'Document count vs travel item count seems unusual',
    prompt: 'If document count vs travel item count seems unusual.',
    enabled: true,
  },
  {
    id: 'car-distance',
    severity: 'info',
    label: 'Car Distance',
    description: 'Car travel distance needs manual reasonableness check',
    prompt: 'Car travel — flag distance for manual reasonableness check.',
    enabled: true,
  },
  {
    id: 'luggage-fee',
    severity: 'info',
    label: 'Luggage Fee',
    description: 'Luggage fee added from separate invoice',
    prompt: 'If a luggage fee was added to a flight from a separate invoice → inform the org so they can verify the luggage invoice matches the flight.',
    enabled: true,
  },
];

/**
 * Build the rules section of the AI prompt from the enabled rules.
 * Groups rules by severity and numbers them sequentially.
 */
export function buildRulesPrompt(variables: { participantCountry: string; projectCountry: string }): string {
  const enabledRules = REVIEW_RULES.filter(r => r.enabled);

  const groups: Record<string, { heading: string; rules: ReviewRule[] }> = {
    critical: { heading: 'CRITICAL (organisation must take action):', rules: [] },
    important: { heading: 'IMPORTANT (organisation should review):', rules: [] },
    info: { heading: 'INFORMATIONAL (good to know):', rules: [] },
  };

  for (const rule of enabledRules) {
    groups[rule.severity].rules.push(rule);
  }

  const lines: string[] = [];
  let ruleNumber = 1;

  for (const severity of ['critical', 'important', 'info'] as const) {
    const group = groups[severity];
    if (group.rules.length === 0) continue;

    lines.push(group.heading);
    for (const rule of group.rules) {
      // Replace {{placeholders}} with actual values
      let promptText = rule.prompt;
      promptText = promptText.replace(/\{\{participantCountry\}\}/g, variables.participantCountry);
      promptText = promptText.replace(/\{\{projectCountry\}\}/g, variables.projectCountry);
      lines.push(`${ruleNumber}. ${promptText}`);
      ruleNumber++;
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Context for the AI that reads one uploaded file: who travelled where and when. It helps
 * with years printed as "26" or misread (2025 for 2026) and with local currencies ("zł" = PLN).
 */
import prisma from '../../utils/prisma.js';
import { normalizeCountryName } from '../../utils/countryName.js';

const LOCAL_CURRENCY: Record<string, string> = {
  poland: 'PLN ("zł")',
  czechia: 'CZK ("Kč")',
  'czech republic': 'CZK ("Kč")',
  hungary: 'HUF ("Ft")',
  romania: 'RON ("lei")',
  bulgaria: 'BGN ("лв")',
  sweden: 'SEK ("kr")',
  denmark: 'DKK ("kr")',
  norway: 'NOK ("kr")',
  iceland: 'ISK ("kr")',
  switzerland: 'CHF',
  liechtenstein: 'CHF',
  'united kingdom': 'GBP ("£")',
  turkey: 'TRY ("₺")',
  türkiye: 'TRY ("₺")',
  serbia: 'RSD ("din")',
  'north macedonia': 'MKD ("ден")',
  albania: 'ALL ("Lek")',
  'bosnia and herzegovina': 'BAM ("KM")',
  georgia: 'GEL ("₾")',
  armenia: 'AMD ("֏")',
  azerbaijan: 'AZN ("₼")',
  ukraine: 'UAH ("₴")',
  moldova: 'MDL ("lei")',
};

export async function extractionContextFor(participantId: string): Promise<string | undefined> {
  const p = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { country: true, project: { select: { country: true, startDate: true, endDate: true } } },
  });
  if (!p) return undefined;
  const home = normalizeCountryName(p.country);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const currencies = [...new Set([home, p.project.country].map((c) => LOCAL_CURRENCY[c.trim().toLowerCase()]).filter(Boolean))];
  return `TRIP CONTEXT: this file belongs to a participant from ${home} who travelled to ${p.project.country} for a project from ${day(
    p.project.startDate
  )} to ${day(p.project.endDate)} (travel days can be a few days before and after). Dates on the file are almost certainly from that period: if the year is missing, unclear or printed with two digits, use the project's year. ${
    currencies.length ? `Besides EUR, amounts may be in ${currencies.join(' or ')}; use that currency code when you see its symbol.` : ''
  }`.trim();
}

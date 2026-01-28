import prisma from '../../utils/prisma.js';

/**
 * InforEuro Exchange Rate Service
 * Fetches and caches exchange rates from the European Commission's InforEuro API
 * https://ec.europa.eu/budg/inforeuro/api/public/
 */

// Supported currencies (common Erasmus+ participant countries)
export const SUPPORTED_CURRENCIES = [
  'EUR', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'SEK', 'DKK', 'NOK',
  'GBP', 'USD', 'CHF', 'TRY', 'UAH', 'RSD', 'MKD', 'ALL', 'BAM', 'GEL',
  'MDL', 'ISK'
];

interface InfoEuroRate {
  currencyIso: string;
  refCurrencyIso: string;
  amount: number;
  dateStart: string;
  dateEnd: string;
}

/**
 * Fetch exchange rate from InforEuro API for a specific currency
 */
async function fetchRateFromApi(currencyCode: string, year: number, month: number): Promise<number | null> {
  const currency = currencyCode.toUpperCase();

  if (currency === 'EUR') {
    return 1.0;
  }

  try {
    // InforEuro API returns ALL rates regardless of query params, so we fetch and filter
    const url = `https://ec.europa.eu/budg/inforeuro/api/public/currencies/${currency}`;

    console.log(`[InforEuro] Fetching rates for ${currency} from ${url}`);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[InforEuro] API returned ${response.status} for ${currency}`);
      return null;
    }

    const data = await response.json() as InfoEuroRate[];

    console.log(`[InforEuro] API returned ${data.length} rates for ${currency}`);

    if (data.length === 0) {
      console.warn(`[InforEuro] No rates returned for ${currency}`);
      return null;
    }

    // Find the rate for the specific month/year
    // dateStart format is "DD/MM/YYYY" (European format)
    const targetMonthStr = month.toString().padStart(2, '0');
    const targetYearStr = year.toString();

    const matchingRate = data.find(rate => {
      // dateStart is like "01/08/2025" (DD/MM/YYYY)
      const parts = rate.dateStart.split('/');
      if (parts.length === 3) {
        const rateMonth = parts[1]; // MM
        const rateYear = parts[2];  // YYYY
        return rateMonth === targetMonthStr && rateYear === targetYearStr;
      }
      return false;
    });

    if (matchingRate) {
      // InforEuro gives: 1 EUR = X foreign currency
      // We need: 1 foreign currency = X EUR
      // So we invert: rate = 1 / amount
      const rateToEur = 1 / matchingRate.amount;
      console.log(`[InforEuro] Found rate for ${currency} ${month}/${year}: 1 EUR = ${matchingRate.amount} ${currency}, so 1 ${currency} = ${rateToEur.toFixed(6)} EUR`);
      return rateToEur;
    }

    // If no exact match, use the most recent rate as fallback
    console.warn(`[InforEuro] No exact rate for ${currency} ${month}/${year}, using most recent`);
    const mostRecent = data[0]; // First item is most recent
    const rateToEur = 1 / mostRecent.amount;
    console.log(`[InforEuro] Using most recent rate (${mostRecent.dateStart}): 1 EUR = ${mostRecent.amount} ${currency}, so 1 ${currency} = ${rateToEur.toFixed(6)} EUR`);
    return rateToEur;

  } catch (error) {
    console.error(`[InforEuro] Error fetching rate for ${currency}:`, error);
    return null;
  }
}

/**
 * Get exchange rate for a currency at a specific month
 * Always fetches fresh from InforEuro API to ensure correctness
 */
export async function getExchangeRate(
  currencyCode: string,
  purchaseDate: Date
): Promise<number> {
  const currency = currencyCode.toUpperCase();

  // EUR is always 1:1
  if (currency === 'EUR') {
    return 1.0;
  }

  const year = purchaseDate.getFullYear();
  const month = purchaseDate.getMonth() + 1; // JS months are 0-indexed

  // Always fetch fresh from API to ensure correctness
  const rate = await fetchRateFromApi(currency, year, month);

  if (rate !== null) {
    console.log(`[InforEuro] Got rate for ${currency} ${month}/${year}: ${rate}`);
    return rate;
  }

  // Ultimate fallback: use hardcoded rates (only if API fails)
  console.warn(`[InforEuro] API failed for ${currency} ${month}/${year}, using hardcoded fallback`);
  return getHardcodedRate(currency);
}

/**
 * Convert amount from a currency to EUR
 */
export async function convertToEur(
  amount: number,
  currencyCode: string,
  purchaseDate?: Date
): Promise<number> {
  const date = purchaseDate || new Date();
  const rate = await getExchangeRate(currencyCode, date);
  const eurAmount = amount * rate;
  return Math.round(eurAmount * 100) / 100; // Round to 2 decimals
}

/**
 * Get all cached rates (for admin view)
 */
export async function getAllCachedRates(): Promise<{
  currencyCode: string;
  year: number;
  month: number;
  rateToEur: number;
  fetchedAt: Date;
}[]> {
  return prisma.exchangeRate.findMany({
    orderBy: [{ currencyCode: 'asc' }, { year: 'desc' }, { month: 'desc' }],
  });
}

/**
 * Clear cached exchange rates
 * @param currencyCode - Optional: clear only rates for this currency
 * @param year - Optional: clear only rates for this year
 * @param month - Optional: clear only rates for this month
 */
export async function clearCachedRates(
  currencyCode?: string,
  year?: number,
  month?: number
): Promise<number> {
  const where: { currencyCode?: string; year?: number; month?: number } = {};

  if (currencyCode) where.currencyCode = currencyCode.toUpperCase();
  if (year) where.year = year;
  if (month) where.month = month;

  const result = await prisma.exchangeRate.deleteMany({ where });
  console.log(`[InforEuro] Cleared ${result.count} cached rates`);
  return result.count;
}

/**
 * Force refresh a rate from the API (bypasses cache)
 */
export async function refreshRate(
  currencyCode: string,
  purchaseDate: Date
): Promise<number> {
  const currency = currencyCode.toUpperCase();

  if (currency === 'EUR') {
    return 1.0;
  }

  const year = purchaseDate.getFullYear();
  const month = purchaseDate.getMonth() + 1;

  // Delete existing cached rate
  await prisma.exchangeRate.deleteMany({
    where: { currencyCode: currency, year, month },
  });

  console.log(`[InforEuro] Refreshing rate for ${currency} ${month}/${year}`);

  // Fetch fresh rate from API
  const rate = await fetchRateFromApi(currency, year, month);

  if (rate !== null) {
    // Cache the new rate
    await prisma.exchangeRate.create({
      data: {
        currencyCode: currency,
        year,
        month,
        rateToEur: rate,
      },
    });
    return rate;
  }

  // Fallback to hardcoded rates
  console.warn(`[InforEuro] Could not refresh rate for ${currency}, using hardcoded fallback`);
  return getHardcodedRate(currency);
}

/**
 * Hardcoded fallback rates (approximate, for when API is unavailable)
 * These are rough approximations and should not be relied upon
 */
function getHardcodedRate(currency: string): number {
  const fallbackRates: Record<string, number> = {
    PLN: 0.23,    // Polish Zloty
    CZK: 0.041,   // Czech Koruna
    HUF: 0.0026,  // Hungarian Forint
    RON: 0.20,    // Romanian Leu
    BGN: 0.51,    // Bulgarian Lev
    HRK: 0.13,    // Croatian Kuna (legacy)
    SEK: 0.088,   // Swedish Krona
    DKK: 0.13,    // Danish Krone
    NOK: 0.085,   // Norwegian Krone
    GBP: 1.17,    // British Pound
    USD: 0.92,    // US Dollar
    CHF: 1.05,    // Swiss Franc
    TRY: 0.029,   // Turkish Lira
    UAH: 0.025,   // Ukrainian Hryvnia
    RSD: 0.0085,  // Serbian Dinar
    MKD: 0.016,   // Macedonian Denar
    ALL: 0.0095,  // Albanian Lek
    BAM: 0.51,    // Bosnian Mark
    GEL: 0.35,    // Georgian Lari
    MDL: 0.051,   // Moldovan Leu
    ISK: 0.0067,  // Icelandic Krona
  };

  return fallbackRates[currency] || 1.0;
}

/**
 * Prefetch rates for common currencies for a given date range
 * Useful for warming up the cache
 */
export async function prefetchRates(startDate: Date, endDate: Date): Promise<void> {
  const currencies = ['PLN', 'CZK', 'HUF', 'RON', 'BGN', 'GBP', 'USD', 'SEK', 'DKK', 'NOK'];

  const startMonth = startDate.getMonth() + 1;
  const startYear = startDate.getFullYear();
  const endMonth = endDate.getMonth() + 1;
  const endYear = endDate.getFullYear();

  for (const currency of currencies) {
    let currentYear = startYear;
    let currentMonth = startMonth;

    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
      try {
        await getExchangeRate(currency, new Date(currentYear, currentMonth - 1, 15));
      } catch (error) {
        console.error(`[InforEuro] Failed to prefetch ${currency} ${currentMonth}/${currentYear}`);
      }

      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }
  }
}

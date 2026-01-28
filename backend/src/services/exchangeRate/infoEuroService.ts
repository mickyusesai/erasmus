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
    // InforEuro API endpoint with year/month parameters for precise lookup
    const url = `https://ec.europa.eu/budg/inforeuro/api/public/currencies/${currency}?year=${year}&month=${month}`;

    console.log(`[InforEuro] Fetching rate for ${currency} ${month}/${year} from ${url}`);

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

    // With year/month params, we should get exactly the rate we need
    if (data.length > 0) {
      const rate = data[0];
      // InforEuro gives: 1 EUR = X foreign currency
      // We need: 1 foreign currency = X EUR
      // So we invert: rate = 1 / amount
      const rateToEur = 1 / rate.amount;
      console.log(`[InforEuro] Found rate for ${currency} ${month}/${year}: 1 EUR = ${rate.amount} ${currency}, so 1 ${currency} = ${rateToEur.toFixed(6)} EUR`);
      return rateToEur;
    }

    // Fallback: try without date params and match manually
    console.log(`[InforEuro] No rate with params, trying full list...`);
    const fallbackUrl = `https://ec.europa.eu/budg/inforeuro/api/public/currencies/${currency}`;
    const fallbackResponse = await fetch(fallbackUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (fallbackResponse.ok) {
      const allRates = await fallbackResponse.json() as InfoEuroRate[];
      console.log(`[InforEuro] Full list has ${allRates.length} rates`);

      // Find rate by matching year/month in dateStart
      const matchingRate = allRates.find(rate => {
        const startDate = new Date(rate.dateStart);
        return startDate.getFullYear() === year && (startDate.getMonth() + 1) === month;
      });

      if (matchingRate) {
        const rateToEur = 1 / matchingRate.amount;
        console.log(`[InforEuro] Found rate in full list: 1 ${currency} = ${rateToEur.toFixed(6)} EUR`);
        return rateToEur;
      }

      // If still no match, get the most recent rate
      if (allRates.length > 0) {
        // Sort by dateStart descending to get most recent
        allRates.sort((a, b) => new Date(b.dateStart).getTime() - new Date(a.dateStart).getTime());
        const mostRecent = allRates[0];
        const rateToEur = 1 / mostRecent.amount;
        console.log(`[InforEuro] Using most recent rate (${mostRecent.dateStart}): 1 ${currency} = ${rateToEur.toFixed(6)} EUR`);
        return rateToEur;
      }
    }

    console.warn(`[InforEuro] No rate found for ${currency} ${month}/${year}`);
    return null;
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

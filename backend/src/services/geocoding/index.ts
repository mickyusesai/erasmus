/**
 * Geocoding service using OpenStreetMap Nominatim API
 * Free, no API key required, but has rate limits (1 request/second)
 */

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

// Simple in-memory cache for geocoding results
const cache = new Map<string, { country: string | null; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get the country for a given city name using OpenStreetMap Nominatim
 * Returns null if city cannot be found
 */
export async function getCountryForCity(cityName: string): Promise<string | null> {
  const normalizedCity = cityName.toLowerCase().trim();

  // Check cache first
  const cached = cache.get(normalizedCity);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.country;
  }

  try {
    // Use Nominatim API (free, no key required)
    // Important: Must include User-Agent header as per Nominatim usage policy
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&addressdetails=1&limit=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'EasyReimburse/1.0 (travel-reimbursement-app)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Nominatim API error: ${response.status}`);
      return null;
    }

    const results: NominatimResult[] = await response.json();

    if (results.length === 0) {
      cache.set(normalizedCity, { country: null, timestamp: Date.now() });
      return null;
    }

    const country = results[0].address?.country || null;

    // Cache the result
    cache.set(normalizedCity, { country, timestamp: Date.now() });

    return country;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

/**
 * Check if a city is in a given country
 * Returns { matches: boolean, detectedCountry: string | null }
 */
export async function validateCityCountry(
  cityName: string,
  expectedCountry: string
): Promise<{ matches: boolean; detectedCountry: string | null }> {
  const detectedCountry = await getCountryForCity(cityName);

  if (!detectedCountry) {
    // Can't determine - assume it matches to avoid false positives
    return { matches: true, detectedCountry: null };
  }

  // Normalize for comparison
  const normalizedExpected = expectedCountry.toLowerCase().trim();
  const normalizedDetected = detectedCountry.toLowerCase().trim();

  // Handle common variations
  const countryAliases: Record<string, string[]> = {
    'united states': ['usa', 'us', 'united states of america'],
    'united kingdom': ['uk', 'great britain', 'england', 'scotland', 'wales', 'northern ireland'],
    'north macedonia': ['macedonia', 'republic of north macedonia'],
    'czech republic': ['czechia'],
    'the netherlands': ['netherlands', 'holland'],
    'bosnia and herzegovina': ['bosnia', 'herzegovina'],
  };

  // Direct match
  if (normalizedDetected === normalizedExpected) {
    return { matches: true, detectedCountry };
  }

  // Check aliases
  for (const [canonical, aliases] of Object.entries(countryAliases)) {
    const allNames = [canonical, ...aliases];
    if (allNames.includes(normalizedDetected) && allNames.includes(normalizedExpected)) {
      return { matches: true, detectedCountry };
    }
  }

  // Check if one contains the other (e.g., "North Macedonia" contains "Macedonia")
  if (normalizedDetected.includes(normalizedExpected) || normalizedExpected.includes(normalizedDetected)) {
    return { matches: true, detectedCountry };
  }

  return { matches: false, detectedCountry };
}

/**
 * Clear the geocoding cache (useful for testing)
 */
export function clearGeocodingCache(): void {
  cache.clear();
}

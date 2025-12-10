/**
 * Geocoding utility using Nominatim API
 */

export interface GeocodingResult {
  lat: number;
  lon: number;
  display_name: string;
}

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100; // Respect Nominatim rate limit (1 req/sec)

/**
 * Geocode an address using Nominatim OpenStreetMap API
 * @param address The address or city name to geocode
 * @param countryCode Optional country code (default: 'se' for Sweden)
 * @returns GeocodingResult or null if geocoding fails
 */
export async function geocodeAddress(
  address: string,
  countryCode: string = 'se'
): Promise<GeocodingResult | null> {
  // Rate limiting
  const now = Date.now();
  if (now - lastRequestTime < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - (now - lastRequestTime);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      address
    )}&countrycodes=${countryCode}&limit=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'JobbNuGeocoding/1.0 (info@jobbnu.se)',
      },
    });

    if (!response.ok) {
      console.error(`Nominatim API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data || data.length === 0) {
      console.warn(`No results found for address: ${address}`);
      return null;
    }

    const { lat, lon, display_name } = data[0];
    return {
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      display_name,
    };
  } catch (error) {
    console.error(`Geocoding error for "${address}":`, error);
    return null;
  }
}

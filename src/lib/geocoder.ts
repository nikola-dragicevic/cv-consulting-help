// lib/geocoder.ts - Free geocoding using Nominatim (OpenStreetMap)

interface GeocodingResult {
  lat: number
  lon: number
  address: string
  confidence: number
}

// Rate limiting for Nominatim (max 1 request/second)
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 1100 // 1.1 seconds to be safe

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest
    await new Promise(resolve => setTimeout(resolve, waitTime))
  }

  lastRequestTime = Date.now()
  return fetch(url, {
    headers: {
      'User-Agent': 'CV-Consulting-Sweden/1.0 (job-matching-service)'
    }
  })
}

export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  try {
    const cleanAddress = encodeURIComponent(address.trim())
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${cleanAddress}&countrycodes=se&limit=1&addressdetails=1`

    console.log(`Geocoding: ${address}`)

    const response = await rateLimitedFetch(url)

    if (!response.ok) {
      console.error(`Geocoding failed for "${address}": HTTP ${response.status}`)
      return null
    }

    const data = await response.json()

    if (!Array.isArray(data) || data.length === 0) {
      console.log(`No results for: ${address}`)
      return null
    }

    const result = data[0]
    const lat = parseFloat(result.lat)
    const lon = parseFloat(result.lon)

    if (!lat || !lon) {
      console.error(`Invalid coordinates for "${address}": lat=${lat}, lon=${lon}`)
      return null
    }

    // Calculate confidence based on result type and importance
    let confidence = 0.5
    if (result.importance > 0.5) confidence += 0.2
    if (result.class === 'place') confidence += 0.2
    if (result.type === 'city' || result.type === 'town') confidence += 0.1

    console.log(`✓ Geocoded: ${address} -> ${lat}, ${lon} (confidence: ${confidence})`)

    return {
      lat,
      lon,
      address: result.display_name || address,
      confidence: Math.min(confidence, 1.0)
    }

  } catch (error) {
    console.error(`Geocoding error for "${address}":`, error)
    return null
  }
}

// Batch geocoding with progress reporting
export async function geocodeBatch(
  addresses: string[],
  onProgress?: (completed: number, total: number, currentAddress: string) => void
): Promise<Map<string, GeocodingResult>> {
  const results = new Map<string, GeocodingResult>()

  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i]

    if (onProgress) {
      onProgress(i, addresses.length, address)
    }

    const result = await geocodeAddress(address)
    if (result) {
      results.set(address, result)
    }

    // Extra delay every 10 requests to be nice to Nominatim
    if ((i + 1) % 10 === 0) {
      console.log(`Processed ${i + 1}/${addresses.length} addresses. Pausing...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  return results
}

// Fallback coordinates for major Swedish cities
export const CITY_FALLBACKS: Record<string, { lat: number; lon: number }> = {
  'stockholm': { lat: 59.3293, lon: 18.0686 },
  'göteborg': { lat: 57.7089, lon: 11.9746 },
  'malmö': { lat: 55.6050, lon: 13.0038 },
  'uppsala': { lat: 59.8586, lon: 17.6389 },
  'västerås': { lat: 59.6162, lon: 16.5528 },
  'örebro': { lat: 59.2741, lon: 15.2066 },
  'linköping': { lat: 58.4108, lon: 15.6214 },
  'helsingborg': { lat: 56.0465, lon: 12.6945 },
  'jönköping': { lat: 57.7826, lon: 14.1618 },
  'norrköping': { lat: 58.5877, lon: 16.1924 }
}

export function getFallbackCoordinates(city: string): { lat: number; lon: number } | null {
  const key = city.toLowerCase().trim()
  return CITY_FALLBACKS[key] || null
}
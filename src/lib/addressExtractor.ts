// lib/addressExtractor.ts - Extract Swedish addresses from job descriptions

// Swedish address patterns
const SWEDISH_ADDRESS_PATTERNS = [
  // Street + number + city pattern
  /([A-ZÅÄÖ][a-zåäö]+(?:gatan|vägen|stråket|torget|platsen|gränden|väg))\s+(\d+[A-Za-z]?),?\s*(\d{3}\s?\d{2})?\s*([A-ZÅÄÖ][a-zåäö\s]+)/gi,

  // City center locations
  /(centrum|city|centralstation),?\s+([A-ZÅÄÖ][a-zåäö\s]+)/gi,

  // Area/district + city
  /([A-ZÅÄÖ][a-zåäö\s]{3,20}),\s+([A-ZÅÄÖ][a-zåäö\s]+)/gi,

  // Postal code + city
  /(\d{3}\s?\d{2})\s+([A-ZÅÄÖ][a-zåäö\s]+)/gi
]

// Location indicators in Swedish job descriptions
const LOCATION_INDICATORS = [
  'belägen i', 'lokaliserad i', 'finns i', 'ligger i', 'placerat i',
  'kontor i', 'vårt kontor ligger', 'vi finns i', 'arbetar i',
  'arbetsplats:', 'adress:', 'address:', 'plats:', 'ort:',
  'anläggningen ligger', 'huvudkontor i', 'verksamhet i'
]

export function extractAddressFromJobDescription(description: string, city: string): string[] {
  if (!description) return []

  const addresses: string[] = []
  const text = description.toLowerCase()

  // First, look for location indicators
  for (const indicator of LOCATION_INDICATORS) {
    const index = text.indexOf(indicator.toLowerCase())
    if (index !== -1) {
      // Extract text after the indicator (next 100 chars)
      const afterIndicator = description.slice(index, index + 100)

      // Apply patterns to this section
      for (const pattern of SWEDISH_ADDRESS_PATTERNS) {
        const matches = afterIndicator.match(pattern)
        if (matches) {
          addresses.push(...matches.map(m => m.trim()))
        }
      }
    }
  }

  // Also search in the first 200 characters (job summary area)
  const summary = description.slice(0, 200)
  for (const pattern of SWEDISH_ADDRESS_PATTERNS) {
    const matches = summary.match(pattern)
    if (matches) {
      addresses.push(...matches.map(m => m.trim()))
    }
  }

  // If no addresses found, use the city as fallback
  if (addresses.length === 0 && city) {
    addresses.push(city)
  }

  // Clean and deduplicate
  return [...new Set(addresses)]
    .filter(addr => addr.length > 3)
    .slice(0, 3) // Max 3 addresses per job
}

// Major Swedish cities for validation
export const SWEDISH_CITIES = [
  'Stockholm', 'Göteborg', 'Malmö', 'Uppsala', 'Västerås', 'Örebro',
  'Linköping', 'Helsingborg', 'Jönköping', 'Norrköping', 'Lund', 'Umeå',
  'Gävle', 'Borås', 'Eskilstuna', 'Södertälje', 'Karlstad', 'Täby',
  'Växjö', 'Halmstad', 'Sundsvall', 'Luleå', 'Trollhättan', 'Östersund',
  'Kalmar', 'Kristianstad', 'Karlskrona', 'Skövde', 'Falun', 'Sandviken'
]

export function isValidSwedishCity(text: string): boolean {
  return SWEDISH_CITIES.some(city =>
    text.toLowerCase().includes(city.toLowerCase())
  )
}

// Clean address for geocoding
export function cleanAddressForGeocoding(address: string): string {
  return address
    .replace(/[^\wåäöÅÄÖ\s,.-]/g, '') // Keep only letters, numbers, Swedish chars, spaces, commas
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim()
}
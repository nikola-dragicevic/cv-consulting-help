// Smart Location Extraction & Geocoding with Fallback Hierarchy
// 1. Street Address (best) -> 2. District -> 3. City Center (fallback)

// Stockholm districts with precise coordinates
const STOCKHOLM_DISTRICTS = {
  // Central Stockholm
  'norrmalm': { lat: 59.3326, lon: 18.0649, zone: 'Central', precision: 'district' },
  'östermalm': { lat: 59.3378, lon: 18.0918, zone: 'Central', precision: 'district' },
  'södermalm': { lat: 59.3181, lon: 18.0711, zone: 'Central', precision: 'district' },
  'gamla stan': { lat: 59.3251, lon: 18.0711, zone: 'Central', precision: 'district' },
  'vasastan': { lat: 59.3433, lon: 18.0472, zone: 'Central', precision: 'district' },
  'city': { lat: 59.3326, lon: 18.0649, zone: 'Central', precision: 'district' },
  'centrum': { lat: 59.3326, lon: 18.0649, zone: 'Central', precision: 'district' },
  'centrala stockholm': { lat: 59.3326, lon: 18.0649, zone: 'Central', precision: 'district' },

  // Northern Stockholm
  'kista': { lat: 59.4036, lon: 17.9445, zone: 'North', precision: 'district' },
  'rinkeby': { lat: 59.3919, lon: 17.9244, zone: 'North', precision: 'district' },
  'tensta': { lat: 59.3958, lon: 17.9011, zone: 'North', precision: 'district' },
  'akalla': { lat: 59.4133, lon: 17.9072, zone: 'North', precision: 'district' },
  'husby': { lat: 59.4044, lon: 17.9194, zone: 'North', precision: 'district' },
  'solna': { lat: 59.3606, lon: 18.0011, zone: 'North', precision: 'district' },
  'sundbyberg': { lat: 59.3617, lon: 17.9708, zone: 'North', precision: 'district' },
  'sollentuna': { lat: 59.4280, lon: 17.9510, zone: 'North', precision: 'district' },

  // Southern Stockholm
  'söderort': { lat: 59.2500, lon: 18.0500, zone: 'South', precision: 'district' },
  'älvsjö': { lat: 59.2781, lon: 18.0167, zone: 'South', precision: 'district' },
  'farsta': { lat: 59.2433, lon: 18.0958, zone: 'South', precision: 'district' },
  'skärholmen': { lat: 59.2761, lon: 17.9069, zone: 'South', precision: 'district' },
  'fruängen': { lat: 59.2922, lon: 17.9661, zone: 'South', precision: 'district' },
  'handen': { lat: 59.1647, lon: 18.1442, zone: 'South', precision: 'district' },
  'huddinge': { lat: 59.2367, lon: 17.9822, zone: 'South', precision: 'district' },
  'flemingsberg': { lat: 59.2173, lon: 17.9478, zone: 'South', precision: 'district' },

  // Western Stockholm
  'västerort': { lat: 59.3500, lon: 17.8500, zone: 'West', precision: 'district' },
  'vällingby': { lat: 59.3617, lon: 17.8772, zone: 'West', precision: 'district' },
  'rissne': { lat: 59.3636, lon: 17.8886, zone: 'West', precision: 'district' },
  'blackeberg': { lat: 59.3544, lon: 17.8614, zone: 'West', precision: 'district' },
  'hässelby': { lat: 59.3703, lon: 17.8325, zone: 'West', precision: 'district' },
  'spånga': { lat: 59.3881, lon: 17.8708, zone: 'West', precision: 'district' },

  // Eastern Stockholm
  'österort': { lat: 59.3000, lon: 18.2000, zone: 'East', precision: 'district' },
  'nacka': { lat: 59.3108, lon: 18.1636, zone: 'East', precision: 'district' },
  'saltsjöbaden': { lat: 59.2725, lon: 18.3089, zone: 'East', precision: 'district' },
  'värmdö': { lat: 59.2500, lon: 18.3500, zone: 'East', precision: 'district' },
  'gustavsberg': { lat: 59.3258, lon: 18.3922, zone: 'East', precision: 'district' },

  // Islands
  'lidingö': { lat: 59.3661, lon: 18.1431, zone: 'East', precision: 'district' }
}

// City centers for fallback
const CITY_FALLBACKS = {
  'stockholm': { lat: 59.3293, lon: 18.0686, precision: 'city' },
  'göteborg': { lat: 57.7089, lon: 11.9746, precision: 'city' },
  'malmö': { lat: 55.6050, lon: 13.0038, precision: 'city' },
  'uppsala': { lat: 59.8586, lon: 17.6389, precision: 'city' },
  'västerås': { lat: 59.6162, lon: 16.5528, precision: 'city' },
  'örebro': { lat: 59.2741, lon: 15.2066, precision: 'city' }
  // ... (add more cities as needed)
}

// Street address patterns for Swedish addresses
const STREET_PATTERNS = [
  // Full address: Street + number + postal code + city
  /([A-ZÅÄÖ][a-zåäö]+(?:gatan|vägen|stråket|torget|platsen|gränden|väg))\s+(\d+[A-Za-z]?),?\s*(\d{3}\s?\d{2})\s+([A-ZÅÄÖ][a-zåäö\s]+)/gi,

  // Street + number without postal code
  /([A-ZÅÄÖ][a-zåäö]+(?:gatan|vägen|stråket|torget|platsen|gränden|väg))\s+(\d+[A-Za-z]?)/gi,

  // Postal code + area
  /(\d{3}\s?\d{2})\s+([A-ZÅÄÖ][a-zåäö\s]+)/gi
]

// District patterns
const DISTRICT_PATTERNS = [
  /kontor\s+i\s+([A-ZÅÄÖ][a-zåäö\s]+)/gi,
  /ligger\s+i\s+([A-ZÅÄÖ][a-zåäö\s]+)/gi,
  /belägen\s+i\s+([A-ZÅÄÖ][a-zåäö\s]+)/gi,
  /placerad\s+i\s+([A-ZÅÄÖ][a-zåäö\s]+)/gi
]

function extractStreetAddress(description) {
  if (!description) return null

  for (const pattern of STREET_PATTERNS) {
    const matches = description.match(pattern)
    if (matches) {
      const cleanMatch = matches[0].trim()

      // Validate it looks like a real address
      if (cleanMatch.length > 10 && /\d/.test(cleanMatch)) {
        return {
          address: cleanMatch,
          precision: 'street',
          confidence: 0.9
        }
      }
    }
  }

  return null
}

function extractDistrict(description, city) {
  if (!description) return null

  const text = description.toLowerCase()
  const results = []

  // Method 1: Pattern matching
  for (const pattern of DISTRICT_PATTERNS) {
    const matches = description.match(pattern)
    if (matches) {
      matches.forEach(match => {
        const district = match.replace(/kontor\s+i\s+|ligger\s+i\s+|belägen\s+i\s+|placerad\s+i\s+/gi, '').trim()
        if (district.length > 3 && district.length < 30) {
          results.push(district)
        }
      })
    }
  }

  // Method 2: Check for known Stockholm districts
  if (city && city.toLowerCase() === 'stockholm') {
    const districtNames = Object.keys(STOCKHOLM_DISTRICTS)
    for (const district of districtNames) {
      if (text.includes(district.toLowerCase())) {
        results.push(district)
      }
    }
  }

  if (results.length > 0) {
    // Return the first found district
    const district = results[0].toLowerCase().trim()
    return {
      district,
      precision: 'district',
      confidence: 0.7
    }
  }

  return null
}

async function geocodeAddress(address) {
  try {
    await new Promise(resolve => setTimeout(resolve, 1100)) // Rate limit

    const encodedAddress = encodeURIComponent(address + ', Sweden')
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&countrycodes=se&limit=1&addressdetails=1`

    const response = await fetch(url, {
      headers: { 'User-Agent': 'CV-Consulting-Sweden/1.0' }
    })

    if (!response.ok) return null

    const data = await response.json()
    if (!data || data.length === 0) return null

    const result = data[0]
    return {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      address: result.display_name,
      precision: 'geocoded',
      confidence: 0.8
    }
  } catch (error) {
    console.error('Geocoding error:', error)
    return null
  }
}

async function smartLocationLookup(description, city) {
  console.log(`  🎯 Smart location lookup for: ${city}`)

  // PRIORITY 1: Try to extract street address
  const streetResult = extractStreetAddress(description)
  if (streetResult) {
    console.log(`    🏠 Found street address: ${streetResult.address}`)

    // Geocode the street address
    const geocoded = await geocodeAddress(streetResult.address)
    if (geocoded) {
      return {
        lat: geocoded.lat,
        lon: geocoded.lon,
        location: streetResult.address,
        precision: 'street',
        confidence: 0.9,
        source: 'extracted+geocoded'
      }
    }
  }

  // PRIORITY 2: Try to extract district
  const districtResult = extractDistrict(description, city)
  if (districtResult && city && city.toLowerCase() === 'stockholm') {
    const districtCoords = STOCKHOLM_DISTRICTS[districtResult.district]
    if (districtCoords) {
      console.log(`    🏘️  Found Stockholm district: ${districtResult.district}`)
      return {
        lat: districtCoords.lat,
        lon: districtCoords.lon,
        location: `${districtResult.district}, ${city}`,
        precision: 'district',
        confidence: 0.7,
        source: 'district_mapping'
      }
    }
  }

  // PRIORITY 3: City center fallback
  if (city) {
    const cityKey = city.toLowerCase().trim()
    const cityCoords = CITY_FALLBACKS[cityKey]
    if (cityCoords) {
      console.log(`    🏙️  Using city center: ${city}`)
      return {
        lat: cityCoords.lat,
        lon: cityCoords.lon,
        location: city,
        precision: 'city',
        confidence: 0.5,
        source: 'city_fallback'
      }
    }
  }

  console.log(`    ❌ No location found`)
  return null
}

module.exports = {
  smartLocationLookup,
  STOCKHOLM_DISTRICTS,
  CITY_FALLBACKS
}
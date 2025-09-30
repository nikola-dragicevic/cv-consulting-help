// Find addresses in job descriptions using Swedish patterns
require('dotenv').config()

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Swedish address patterns
const ADDRESS_PATTERNS = [
  // Street + number + postal code
  /([A-ZÅÄÖ][a-zåäö]+(?:gatan|vägen|stråket|torget|platsen|gränden|väg))\s+(\d+[A-Za-z]?),?\s*(\d{3}\s?\d{2})/gi,

  // Postal code + city
  /(\d{3}\s?\d{2})\s+([A-ZÅÄÖ][a-zåäö\s]+)/gi,

  // Street addresses without postal codes
  /([A-ZÅÄÖ][a-zåäö]+(?:gatan|vägen|stråket|torget|platsen|gränden))\s+(\d+[A-Za-z]?)/gi,

  // Company + address patterns
  /(kontor|ligger|belägen|adress|address)[\s:]+([A-ZÅÄÖ][a-zåäö\s,\d]+)/gi
]

function extractAddresses(text) {
  if (!text) return []

  const addresses = []
  const lowerText = text.toLowerCase()

  // Look for location indicators
  const indicators = ['adress:', 'address:', 'kontor:', 'ligger', 'belägen', 'plats:']

  for (const indicator of indicators) {
    const index = lowerText.indexOf(indicator)
    if (index !== -1) {
      // Extract 100 chars after indicator
      const section = text.slice(index, index + 100)

      // Apply patterns
      for (const pattern of ADDRESS_PATTERNS) {
        const matches = section.match(pattern)
        if (matches) {
          addresses.push(...matches)
        }
      }
    }
  }

  // Also check entire description for address patterns
  for (const pattern of ADDRESS_PATTERNS) {
    const matches = text.match(pattern)
    if (matches) {
      addresses.push(...matches)
    }
  }

  return [...new Set(addresses)]
    .filter(addr => addr.length > 5)
    .slice(0, 3)
}

async function findAddresses() {
  console.log('🔍 Searching for addresses in job descriptions...')

  const { data: jobs, error } = await supabase
    .from('job_ads')
    .select('id, headline, city, description_text, location')
    .eq('city', 'Stockholm')
    .not('description_text', 'is', null)
    .limit(20)

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  let foundCount = 0

  for (const job of jobs) {
    const addresses = extractAddresses(job.description_text)

    if (addresses.length > 0) {
      foundCount++
      console.log(`\n📍 JOB: ${job.headline.slice(0, 60)}...`)
      console.log(`   Current location: ${job.location || 'NULL'}`)
      console.log(`   Found addresses:`)
      addresses.forEach((addr, i) => {
        console.log(`     ${i + 1}. ${addr.trim()}`)
      })
    }
  }

  console.log(`\n📊 Results: Found addresses in ${foundCount}/${jobs.length} jobs`)

  if (foundCount === 0) {
    console.log('\n💡 Suggestions:')
    console.log('1. Addresses might be in company info, not job descriptions')
    console.log('2. Need to enhance scraping to capture company addresses')
    console.log('3. Use company names to lookup addresses via Google Places API')
  }
}

findAddresses()
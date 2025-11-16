// Test smart geocoding on Stockholm jobs specifically
require('dotenv').config()

const { createClient } = require('@supabase/supabase-js')
const { smartLocationLookup } = require('../src/lib/smartGeocoder.js')

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function testStockholmJobs() {
  console.log('🏙️  Testing smart geocoding on Stockholm jobs...')

  const { data: jobs, error } = await supabase
    .from('job_ads')
    .select('id, headline, city, description_text, location_lat, location_lon')
    .eq('city', 'Stockholm')
    .not('description_text', 'is', null)
    .limit(10)

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  console.log(`📊 Testing ${jobs.length} Stockholm jobs`)

  let updated = 0
  const stats = { street: 0, district: 0, city: 0, failed: 0 }

  for (const [i, job] of jobs.entries()) {
    console.log(`\n[${i+1}/${jobs.length}] ${job.headline.slice(0, 50)}...`)

    const result = await smartLocationLookup(job.description_text, job.city)

    if (result) {
      console.log(`  ✅ ${result.precision}: ${result.location}`)
      console.log(`  📍 Coordinates: ${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}`)

      stats[result.precision]++

      // Update database
      const { error: updateError } = await supabase
        .from('job_ads')
        .update({
          location_lat: result.lat,
          location_lon: result.lon,
          location: result.location
        })
        .eq('id', job.id)

      if (!updateError) {
        updated++
      }
    } else {
      console.log(`  ❌ No location found`)
      stats.failed++
    }
  }

  console.log(`\n📊 Stockholm Results:`)
  console.log(`   Updated: ${updated}/${jobs.length}`)
  console.log(`   🏠 Street addresses: ${stats.street}`)
  console.log(`   🏘️  Districts: ${stats.district}`)
  console.log(`   🏙️  City centers: ${stats.city}`)
  console.log(`   ❌ Failed: ${stats.failed}`)
}

testStockholmJobs()
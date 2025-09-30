// Simple geocoding script using JavaScript
require('dotenv').config()

const { createClient } = require('@supabase/supabase-js')

console.log('🚀 Starting simple geocoding test...')

// Check environment
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url) {
  console.error('❌ Missing SUPABASE_URL')
  process.exit(1)
}

if (!key) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

console.log('✅ Environment variables found')

// Create Supabase client
const supabase = createClient(url, key)

// Swedish city coordinates (expanded)
const CITY_COORDS = {
  'stockholm': { lat: 59.3293, lon: 18.0686 },
  'göteborg': { lat: 57.7089, lon: 11.9746 },
  'malmö': { lat: 55.6050, lon: 13.0038 },
  'uppsala': { lat: 59.8586, lon: 17.6389 },
  'västerås': { lat: 59.6162, lon: 16.5528 },
  'örebro': { lat: 59.2741, lon: 15.2066 },
  'linköping': { lat: 58.4108, lon: 15.6214 },
  'helsingborg': { lat: 56.0465, lon: 12.6945 },
  'jönköping': { lat: 57.7826, lon: 14.1618 },
  'norrköping': { lat: 58.5877, lon: 16.1924 },
  'lund': { lat: 55.7047, lon: 13.1910 },
  'umeå': { lat: 63.8258, lon: 20.2630 },
  'gävle': { lat: 60.6749, lon: 17.1413 },
  'borås': { lat: 57.7210, lon: 12.9401 },
  'eskilstuna': { lat: 59.3706, lon: 16.5077 },
  'södertälje': { lat: 59.1955, lon: 17.6256 },
  'karlstad': { lat: 59.3793, lon: 13.5036 },
  'växjö': { lat: 56.8777, lon: 14.8091 },
  'halmstad': { lat: 56.6745, lon: 12.8580 },
  'sundsvall': { lat: 62.3908, lon: 17.3069 },
  'luleå': { lat: 65.5848, lon: 22.1547 },
  'trollhättan': { lat: 58.2837, lon: 12.2886 },
  'östersund': { lat: 63.1792, lon: 14.6357 },
  'kalmar': { lat: 56.6634, lon: 16.3567 },
  'kristianstad': { lat: 56.0294, lon: 14.1567 },
  'karlskrona': { lat: 56.1612, lon: 15.5869 },
  'skövde': { lat: 58.3915, lon: 13.8452 },
  'falun': { lat: 60.6077, lon: 15.6281 },
  'kungsbacka': { lat: 57.4878, lon: 12.0807 },
  'laholm': { lat: 56.5113, lon: 13.0420 },
  'vännäs': { lat: 63.9089, lon: 19.7570 },
  'sandviken': { lat: 60.6197, lon: 16.7767 },
  'täby': { lat: 59.4439, lon: 18.0687 },
  'sollentuna': { lat: 59.4280, lon: 17.9510 },
  'huddinge': { lat: 59.2367, lon: 17.9822 }
}

async function testGeocoding() {
  try {
    console.log('📊 Fetching jobs without coordinates...')

    // Get jobs without coordinates
    const { data: jobs, error } = await supabase
      .from('job_ads')
      .select('id, headline, city, location_lat, location_lon')
      .or('location_lat.is.null,location_lon.is.null')
      .not('city', 'is', null)
      .limit(100)

    if (error) {
      console.error('❌ Database error:', error)
      return
    }

    console.log(`📋 Found ${jobs.length} jobs to process`)

    let updated = 0

    for (const job of jobs) {
      console.log(`\n🔄 Processing: ${job.headline?.slice(0, 50)}...`)

      // Skip if already has coordinates
      if (job.location_lat && job.location_lon) {
        console.log('  ⏭️  Already has coordinates')
        continue
      }

      // Get city coordinates
      const cityKey = job.city?.toLowerCase()?.trim()
      const coords = CITY_COORDS[cityKey]

      if (coords) {
        console.log(`  🏙️  Using ${job.city} coordinates: ${coords.lat}, ${coords.lon}`)

        // Update database
        const { error: updateError } = await supabase
          .from('job_ads')
          .update({
            location_lat: coords.lat,
            location_lon: coords.lon
          })
          .eq('id', job.id)

        if (updateError) {
          console.error('  ❌ Update failed:', updateError)
        } else {
          updated++
          console.log('  ✅ Updated successfully')
        }
      } else {
        console.log(`  ❓ No coordinates for city: ${job.city}`)
      }
    }

    console.log(`\n🎉 Complete! Updated ${updated}/${jobs.length} jobs`)

  } catch (error) {
    console.error('💥 Error:', error)
  }
}

testGeocoding()
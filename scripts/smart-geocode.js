// Smart Geocoding with Street > District > City fallback hierarchy
require('dotenv').config()

const { createClient } = require('@supabase/supabase-js')
const { smartLocationLookup } = require('../src/lib/smartGeocoder.js')

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function smartGeocodeJobs() {
  console.log('🧠 Starting smart geocoding with fallback hierarchy...')
  console.log('📋 Priority: Street Address > District > City Center')

  try {
    // Get jobs without coordinates
    const { data: jobs, error } = await supabase
      .from('job_ads')
      .select('id, headline, city, description_text, location_lat, location_lon')
      .or('location_lat.is.null,location_lon.is.null')
      .not('city', 'is', null)
      .limit(20) // Start with 20 for testing

    if (error) {
      console.error('❌ Database error:', error)
      return
    }

    console.log(`📊 Found ${jobs.length} jobs to process`)

    let processed = 0
    let updated = 0
    const stats = {
      street: 0,
      district: 0,
      city: 0,
      failed: 0
    }

    for (const job of jobs) {
      processed++
      console.log(`\n[${processed}/${jobs.length}] Processing: ${job.headline.slice(0, 50)}...`)

      // Skip if already has coordinates
      if (job.location_lat && job.location_lon) {
        console.log('  ⏭️  Already has coordinates')
        continue
      }

      try {
        // Smart location lookup with fallback hierarchy
        const locationResult = await smartLocationLookup(job.description_text, job.city)

        if (locationResult) {
          console.log(`  ✅ Location found: ${locationResult.location} (${locationResult.precision})`)

          // Update database
          const { error: updateError } = await supabase
            .from('job_ads')
            .update({
              location_lat: locationResult.lat,
              location_lon: locationResult.lon,
              location: locationResult.location // Update the location field too
            })
            .eq('id', job.id)

          if (updateError) {
            console.error('  ❌ Database update failed:', updateError)
          } else {
            updated++
            stats[locationResult.precision]++
            console.log(`  💾 Database updated successfully`)
          }
        } else {
          stats.failed++
          console.log('  ❌ No location could be determined')
        }

      } catch (jobError) {
        stats.failed++
        console.error(`  ❌ Error processing job:`, jobError.message)
      }

      // Progress report every 10 jobs
      if (processed % 10 === 0) {
        console.log(`\n📊 Progress Report:`)
        console.log(`   Processed: ${processed}/${jobs.length}`)
        console.log(`   Updated: ${updated}`)
        console.log(`   Street addresses: ${stats.street}`)
        console.log(`   Districts: ${stats.district}`)
        console.log(`   City centers: ${stats.city}`)
        console.log(`   Failed: ${stats.failed}`)
      }
    }

    // Final report
    console.log(`\n🎉 Smart Geocoding Complete!`)
    console.log(`📊 Final Statistics:`)
    console.log(`   Total processed: ${processed}`)
    console.log(`   Successfully updated: ${updated}`)
    console.log(`   `)
    console.log(`   🏠 Street addresses: ${stats.street} (${Math.round(stats.street/updated*100)}%)`)
    console.log(`   🏘️  Districts: ${stats.district} (${Math.round(stats.district/updated*100)}%)`)
    console.log(`   🏙️  City centers: ${stats.city} (${Math.round(stats.city/updated*100)}%)`)
    console.log(`   ❌ Failed: ${stats.failed}`)

    const precision = stats.street + stats.district
    console.log(`\n🎯 Precision Rate: ${Math.round(precision/updated*100)}% (street + district)`)

  } catch (error) {
    console.error('💥 Fatal error:', error)
  }
}

// Run the smart geocoding
smartGeocodeJobs()
  .then(() => {
    console.log('✅ Smart geocoding script completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('💥 Script failed:', error)
    process.exit(1)
  })
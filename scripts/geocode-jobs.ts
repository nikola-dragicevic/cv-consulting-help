// scripts/geocode-jobs.ts - Update job_ads with geocoded addresses

// Load environment variables FIRST
import dotenv from 'dotenv'
import path from 'path'

// Try multiple .env locations
const envPath = path.join(process.cwd(), '.env')
console.log('Loading .env from:', envPath)
const result = dotenv.config({ path: envPath })

if (result.error) {
  console.error('❌ Error loading .env:', result.error)
  process.exit(1)
}

console.log('✅ Environment loaded')
console.log('SUPABASE_URL exists:', !!process.env.SUPABASE_URL || !!process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log('SERVICE_KEY exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

import { supabaseServer } from '../src/lib/supabaseServer'
import { extractAddressFromJobDescription } from '../src/lib/addressExtractor'
import { geocodeAddress, getFallbackCoordinates } from '../src/lib/geocoder'

interface JobRecord {
  id: string
  headline: string
  description_text: string
  city: string
  location: string | null
  location_lat: number | null
  location_lon: number | null
}

async function geocodeJobsInBatches() {
  console.log('🚀 Starting job geocoding process...')

  try {
    // 1. Fetch jobs that need geocoding
    console.log('📊 Fetching jobs that need geocoding...')

    const { data: jobs, error } = await supabaseServer
      .from('job_ads')
      .select('id, headline, description_text, city, location, location_lat, location_lon')
      .or('location_lat.is.null,location_lon.is.null')
      .not('city', 'is', null)
      .limit(100) // Start with 100 jobs for testing

    if (error) {
      console.error('❌ Database error:', error)
      return
    }

    if (!jobs || jobs.length === 0) {
      console.log('✅ No jobs need geocoding!')
      return
    }

    console.log(`📋 Found ${jobs.length} jobs to geocode`)

    // 2. Process each job
    let processed = 0
    let updated = 0

    for (const job of jobs as JobRecord[]) {
      processed++
      console.log(`\n[${processed}/${jobs.length}] Processing: ${job.headline?.slice(0, 50)}...`)

      try {
        let lat: number | null = null
        let lon: number | null = null
        let extractedAddress: string | null = null

        // Skip if already has coordinates
        if (job.location_lat && job.location_lon) {
          console.log('  ⏭️  Already has coordinates, skipping')
          continue
        }

        // Method 1: Use existing location if available
        if (job.location) {
          console.log(`  🔍 Geocoding existing location: ${job.location}`)
          const result = await geocodeAddress(job.location)
          if (result) {
            lat = result.lat
            lon = result.lon
            extractedAddress = job.location
          }
        }

        // Method 2: Extract address from description
        if (!lat && job.description_text) {
          console.log('  📝 Extracting address from description...')
          const addresses = extractAddressFromJobDescription(job.description_text, job.city)

          for (const address of addresses) {
            console.log(`  🔍 Trying: ${address}`)
            const result = await geocodeAddress(address)
            if (result && result.confidence > 0.3) {
              lat = result.lat
              lon = result.lon
              extractedAddress = address
              break
            }
          }
        }

        // Method 3: Use city fallback
        if (!lat && job.city) {
          console.log(`  🏙️  Using city fallback: ${job.city}`)
          const fallback = getFallbackCoordinates(job.city)
          if (fallback) {
            lat = fallback.lat
            lon = fallback.lon
            extractedAddress = job.city
          }
        }

        // Update database if we found coordinates
        if (lat && lon) {
          console.log(`  💾 Updating database: ${lat}, ${lon}`)

          const updateData: any = {
            location_lat: lat,
            location_lon: lon,
            // Update location field if we extracted a new address
            ...(extractedAddress && !job.location ? { location: extractedAddress } : {})
          }

          const { error: updateError } = await supabaseServer
            .from('job_ads')
            .update(updateData)
            .eq('id', job.id)

          if (updateError) {
            console.error(`  ❌ Update failed:`, updateError)
          } else {
            updated++
            console.log(`  ✅ Updated successfully`)
          }
        } else {
          console.log('  ❌ No coordinates found')
        }

      } catch (jobError) {
        console.error(`  ❌ Error processing job ${job.id}:`, jobError)
      }

      // Progress report every 10 jobs
      if (processed % 10 === 0) {
        console.log(`\n📊 Progress: ${processed}/${jobs.length} processed, ${updated} updated`)
      }
    }

    console.log(`\n🎉 Geocoding complete!`)
    console.log(`📊 Final stats: ${processed} processed, ${updated} updated`)

  } catch (error) {
    console.error('💥 Fatal error:', error)
  }
}

// Run if called directly
if (require.main === module) {
  geocodeJobsInBatches()
    .then(() => {
      console.log('✅ Script finished')
      process.exit(0)
    })
    .catch(error => {
      console.error('💥 Script failed:', error)
      process.exit(1)
    })
}

export { geocodeJobsInBatches }
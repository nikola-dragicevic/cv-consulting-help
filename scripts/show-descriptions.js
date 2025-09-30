// Show sample job descriptions to understand address extraction needs
require('dotenv').config()

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function showSampleDescriptions() {
  console.log('📋 Fetching sample job descriptions...')

  const { data: jobs, error } = await supabase
    .from('job_ads')
    .select('headline, city, description_text')
    .eq('city', 'Stockholm')
    .not('description_text', 'is', null)
    .limit(3)

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  jobs.forEach((job, i) => {
    console.log(`\n=== JOB ${i+1}: ${job.headline.slice(0,50)}...`)
    console.log(`City: ${job.city}`)
    console.log(`Description (first 400 chars):`)
    console.log('-'.repeat(60))
    console.log(job.description_text.slice(0, 400) + '...')
    console.log('-'.repeat(60))
  })
}

showSampleDescriptions()
// scripts/geocode-jobs.ts (Version 3 - Robust med fallback och hantering av misslyckanden)

import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Saknar Supabase miljövariabler.');
  process.exit(1);
}

const supabaseServer = createClient(supabaseUrl, supabaseServiceKey);

interface GeocodingResult { lat: number; lon: number; address: string; }

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100;

async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  const now = Date.now();
  if (now - lastRequestTime < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - (now - lastRequestTime);
    console.log(`   - Rate limiting: väntar ${waitTime}ms...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=se&limit=1`;
    const response = await fetch(url, { headers: { 'User-Agent': 'JobbNuGeocoding/1.0 (info@jobbnu.se)' } });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.[0]) return null;
    const { lat, lon, display_name } = data[0];
    return { lat: parseFloat(lat), lon: parseFloat(lon), address: display_name };
  } catch (error) {
    console.error(`  - Geokodningsfel för "${address}":`, error);
    return null;
  }
}

const STREET_PATTERN = /([A-ZÅÄÖ][a-zåäö]+(?:gatan|vägen|gränd| torg|plan))\s+(\d+[A-Z]?)/i;

async function processJobs() {
  console.log('🚀 Startar robust geokodningsprocess...');
  let totalUpdated = 0;

  while (true) {
    console.log(`\n--- Ny batch ---`);
    const { data: jobs, error } = await supabaseServer
      .from('job_ads')
      .select('id, headline, description_text, city')
      .is('location_lat', null)
      .not('city', 'is', null)
      .limit(50);

    if (error || !jobs || jobs.length === 0) {
      console.log('✅ Inga fler jobb att geokoda. Processen är klar.');
      break;
    }

    console.log(`📋 Hittade ${jobs.length} jobb att bearbeta.`);

    for (const job of jobs) {
      console.log(`  -> Bearbetar: ${job.id} (${job.headline.slice(0, 30)}...)`);

      let geoResult: GeocodingResult | null = null;
      let finalLocation = job.city; // Fallback är alltid staden

      // Försök 1: Hitta och geokoda exakt adress + stad
      const streetMatch = job.description_text?.match(STREET_PATTERN);
      if (streetMatch) {
        const fullAddress = `${streetMatch[0]}, ${job.city}`;
        console.log(`     - Försök 1 (Exakt adress): "${fullAddress}"`);
        geoResult = await geocodeAddress(fullAddress);
        if(geoResult) finalLocation = geoResult.address;
      }

      // Försök 2 (Fallback): Om exakt adress misslyckades, geokoda bara staden
      if (!geoResult) {
        console.log(`     - Försök 2 (Endast stad): "${job.city}"`);
        geoResult = await geocodeAddress(job.city);
        if(geoResult) finalLocation = geoResult.address;
      }

      // Uppdatera databasen
      let updatePayload = {};
      if (geoResult) {
        updatePayload = { location_lat: geoResult.lat, location_lon: geoResult.lon, location: finalLocation };
        console.log(`     ✅ Hittade koordinater: ${geoResult.lat.toFixed(4)}, ${geoResult.lon.toFixed(4)}`);
        totalUpdated++;
      } else {
        // Om allt misslyckas, sätt till 0,0 för att stoppa loopen
        updatePayload = { location_lat: 0, location_lon: 0, location: job.city };
        console.warn(`     ⚠️ Misslyckades helt. Markerar jobbet för att inte försöka igen.`);
      }

      await supabaseServer.from('job_ads').update(updatePayload).eq('id', job.id);
    }
  }
  console.log(`\n🎉 Klart! Totalt ${totalUpdated} jobb har uppdaterats med koordinater.`);
}

processJobs();
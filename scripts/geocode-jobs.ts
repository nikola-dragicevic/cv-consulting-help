// scripts/geocode-jobs.ts - Effektiv batch-geokodning av jobbannonser

import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// --- Miljövariabler ---
// Säkerställer att .env-filer laddas korrekt
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Saknar Supabase miljövariabler. Kontrollera din .env-fil.');
  process.exit(1);
}

const supabaseServer = createClient(supabaseUrl, supabaseServiceKey);

// --- Geokodningslogik ---

interface GeocodingResult {
  lat: number;
  lon: number;
  address: string;
}

// Respekterar Nominatims policy (max 1 anrop/sekund)
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100; // 1.1 sekunder för säkerhetsmarginal

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    console.log(`   - Rate limiting: väntar ${waitTime}ms...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();
  // Uppdaterad User-Agent med din nya e-post
  return fetch(url, { headers: { 'User-Agent': 'JobbNuGeocoding/1.0 (info@jobbnu.se)' } });
}

async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  try {
    const cleanAddress = encodeURIComponent(`${address}, Sweden`.trim());
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${cleanAddress}&countrycodes=se&limit=1`;

    const response = await rateLimitedFetch(url);
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

// --- Adressextrahering ---
const STREET_PATTERN = /([A-ZÅÄÖ][a-zåäö]+(?:gatan|vägen|gränd| torg|plan))\s+(\d+[A-Z]?)/i;

function extractBestAddress(description: string, city: string): string {
    if (description) {
        const match = description.match(STREET_PATTERN);
        // Om en gatuadress hittas, använd den
        if (match) return match[0];
    }
    // Annars, falla tillbaka på staden
    return city;
}

// --- Huvudskript ---

async function processJobs() {
  console.log('🚀 Startar geokodningsprocess...');
  let totalUpdated = 0;
  const BATCH_SIZE = 50;

  while (true) {
    console.log(`\n--- Ny batch ---`);
    console.log(`📊 Hämtar upp till ${BATCH_SIZE} jobb som saknar koordinater...`);

    // **Kärnan i effektiviteten:** Hämtar BARA jobb där location_lat är null.
    const { data: jobs, error } = await supabaseServer
      .from('job_ads')
      .select('id, headline, description_text, city')
      .is('location_lat', null)
      .not('city', 'is', null)
      .limit(BATCH_SIZE);

    if (error) {
      console.error('❌ Databasfel:', error.message);
      break;
    }

    if (!jobs || jobs.length === 0) {
      console.log('✅ Inga fler jobb att geokoda. Processen är klar.');
      break;
    }

    console.log(`📋 Hittade ${jobs.length} jobb att bearbeta.`);

    for (const job of jobs) {
      console.log(`  -> Bearbetar: ${job.id} (${job.headline.slice(0, 30)}...)`);

      // 1. Hitta bästa adresskandidat
      const addressToGeocode = extractBestAddress(job.description_text, job.city);
      console.log(`     - Adresskandidat: "${addressToGeocode}"`);

      // 2. Geokoda
      const geoResult = await geocodeAddress(addressToGeocode);

      // 3. Uppdatera databasen
      if (geoResult) {
        const { error: updateError } = await supabaseServer
          .from('job_ads')
          .update({
            location_lat: geoResult.lat,
            location_lon: geoResult.lon,
            location: geoResult.address // Spara den fullständiga adressen
          })
          .eq('id', job.id);

        if (updateError) {
          console.error(`     ❌ DB-uppdatering misslyckades:`, updateError.message);
        } else {
          totalUpdated++;
          console.log(`     ✅ Uppdaterad med lat/lon: ${geoResult.lat.toFixed(4)}, ${geoResult.lon.toFixed(4)}`);
        }
      } else {
        console.warn(`     ⚠️ Kunde inte geokoda "${addressToGeocode}". Jobbet hoppas över för nu.`);
        // Vi uppdaterar inte, så det kommer att försökas igen nästa gång skriptet körs.
      }
    }
  }
  console.log(`\n🎉 Klart! Totalt ${totalUpdated} jobb har uppdaterats med koordinater.`);
}

processJobs();
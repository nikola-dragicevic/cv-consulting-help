# CLAUDE.md

## Projektöversikt

Detta är en Next.js-applikation för CV-konsultation och jobbmatchning. Appen kombinerar en AI-driven jobbmatchningstjänst med professionell CV-skrivning och karriärrådgivning. Den är integrerad med `jobbnu.se`.

## Arkitektur

### Kärnteknologier
- **Next.js & App Router**
- **TypeScript**
- **Tailwind CSS**
- **Supabase** (Databas, Auth, Storage)
- **Stripe** (Betalningar)
- **Ollama (nomic-embed-text)** för lokal vektorisering.

### Datamodell
- `candidate_profiles`: Användare med CV, preferenser och en 768-dim `vector`.
- `job_ads`: Jobbannonser med beskrivningar, geodata och en 768-dim `embedding`.

### Viktiga flöden
1.  **Vektorisering:**
    -   `scripts/enrich_jobs.py`: Batch-jobb för att vektorisera alla jobbannonser.
    -   `scripts/generate_candidate_vector.py`: Vektoriserar kandidatprofiler.
2.  **Geokodning:**
    -   `scripts/geocode-jobs.ts` använder `src/lib/geocoder.ts` för att extrahera adresser och hämta lat/lon från Nominatim.
3.  **Matchning:**
    -   `/api/match/init`: Tar emot CV, vektoriserar det och gör en första sökning.
    -   `/api/match/refine`: Tar emot användarens "wishlist", skapar en `v_wish`-vektor och omrankar jobben med en 70/30-viktning.
4.  **Karta:**
    -   Frontend-kartan (`InteractiveJobMap.tsx`) skickar sin position till en säker backend-slutpunkt (`/api/map-jobs`) som endast returnerar synliga jobb.

## Utvecklingsplan
- [x] Slutför vektorisering av alla 40k jobb. (Detta görs när initial_load.py har hämtat data igen, för att datan i supabase är mer än två månader gammal)
- [ ] Implementera geokodning för alla jobb med `geocode-jobs.ts`.
- [ ] Bygg `/api/map-jobs` för säker hämtning av kartdata.
- [ ] Integrera Supabase Auth för användarregistrering och profilsidor.
- [ ] Uppdatera landningssidan på `jobbnu.se` för att inkludera matchningsverktyget.
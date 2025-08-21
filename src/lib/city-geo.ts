
// =============================
// File: lib/city-geo.ts
// Tiny city→geo helper + Stockholm metro aliases to support the toggle now
// (We will replace with a DB/seed in step B.)
// =============================
export type CityGeo = { lat: number; lon: number; county_code: string; metro_slug?: string }

const CITY_LOOKUP: Record<string, CityGeo> = {
  stockholm: { lat: 59.3293, lon: 18.0686, county_code: "01", metro_slug: "stockholm" },
  göteborg: { lat: 57.7089, lon: 11.9746, county_code: "14", metro_slug: "goteborg" },
  goteborg: { lat: 57.7089, lon: 11.9746, county_code: "14", metro_slug: "goteborg" },
  malmö: { lat: 55.60498, lon: 13.00382, county_code: "12", metro_slug: "malmo" },
  malmo: { lat: 55.60498, lon: 13.00382, county_code: "12", metro_slug: "malmo" },
  uppsala: { lat: 59.8586, lon: 17.6389, county_code: "03", metro_slug: "uppsala" },
  bålsta: { lat: 59.5692, lon: 17.5277, county_code: "03", metro_slug: "stockholm" },
  balsta: { lat: 59.5692, lon: 17.5277, county_code: "03", metro_slug: "stockholm" },
  solna: { lat: 59.3600, lon: 18.0009, county_code: "01", metro_slug: "stockholm" },
  sundbyberg: { lat: 59.3600, lon: 17.9711, county_code: "01", metro_slug: "stockholm" },
  täby: { lat: 59.4439, lon: 18.0687, county_code: "01", metro_slug: "stockholm" },
  taby: { lat: 59.4439, lon: 18.0687, county_code: "01", metro_slug: "stockholm" },
  nacka: { lat: 59.3105, lon: 18.1637, county_code: "01", metro_slug: "stockholm" },
  södertälje: { lat: 59.1955, lon: 17.6253, county_code: "01", metro_slug: "stockholm" },
  sodertalje: { lat: 59.1955, lon: 17.6253, county_code: "01", metro_slug: "stockholm" },
}

export function cityToGeo(cityRaw: string): CityGeo | null {
  const key = (cityRaw || "").trim().toLowerCase()
  return CITY_LOOKUP[key] ?? null
}

export function resolveMetroSlug(cityRaw: string): string | undefined {
  return cityToGeo(cityRaw)?.metro_slug
}

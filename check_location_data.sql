-- Check how many jobs have location coordinates
SELECT 
  COUNT(*) as total_jobs,
  COUNT(location_lat) as jobs_with_lat,
  COUNT(location_lon) as jobs_with_lon,
  COUNT(CASE WHEN location_lat IS NOT NULL AND location_lon IS NOT NULL THEN 1 END) as jobs_with_coords,
  ROUND(100.0 * COUNT(CASE WHEN location_lat IS NOT NULL AND location_lon IS NOT NULL THEN 1 END) / COUNT(*), 2) as percent_with_coords
FROM job_ads
WHERE is_active = true AND embedding IS NOT NULL;

-- Check specific cities where jobs are located
SELECT 
  location,
  COUNT(*) as count,
  COUNT(CASE WHEN location_lat IS NOT NULL AND location_lon IS NOT NULL THEN 1 END) as with_coords
FROM job_ads
WHERE is_active = true AND embedding IS NOT NULL
GROUP BY location
ORDER BY count DESC
LIMIT 20;

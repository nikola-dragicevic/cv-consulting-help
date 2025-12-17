-- Drop the old functions first to allow return type changes
DROP FUNCTION IF EXISTS match_jobs_initial(vector, float, float, float, int);
DROP FUNCTION IF EXISTS match_jobs_profile_wish(vector, vector, float, float, float, text, text, boolean, int);

-- 1. Re-create Initial Matching Function
create or replace function match_jobs_initial(
    v_profile vector(1024),
    u_lat float,
    u_lon float,
    radius_km float,
    top_k int
)
returns table (
    id text,
    headline text,
    description_text text,
    location text,
    location_lat float,
    location_lon float,
    company_size text,
    work_modality text,
    job_url text,
    webpage_url text,
    s_profile float
)
language sql stable
as $$
  select
    j.id,
    j.headline,
    j.description_text,
    j.location,
    j.location_lat,
    j.location_lon,
    j.company_size,
    j.work_modality,
    j.job_url,
    j.webpage_url,
    (1 - (j.embedding <=> v_profile)) as s_profile -- Cosine Similarity
  from job_ads j
  where 
    j.embedding is not null 
    AND j.is_active = true 
    AND (j.application_deadline is null or j.application_deadline >= now())
    AND (
      radius_km >= 9999 
      OR (
        j.location_lat BETWEEN u_lat - (radius_km / 111.0) AND u_lat + (radius_km / 111.0)
        AND
        j.location_lon BETWEEN u_lon - (radius_km / (111.0 * cos(radians(u_lat)))) AND u_lon + (radius_km / (111.0 * cos(radians(u_lat))))
      )
    )
  order by (j.embedding <=> v_profile) asc
  limit top_k;
$$;

-- 2. Re-create Refined Matching Function
create or replace function match_jobs_profile_wish(
    v_profile vector(1024),
    v_wish vector(1024),
    u_lat float,
    u_lon float,
    radius_km float,
    metro text,
    county text,
    remote_boost boolean,
    p_top_k int
)
returns table (
    id text,
    headline text,
    location text,
    location_lat float,
    location_lon float,
    company_size text,
    work_modality text,
    job_url text,
    webpage_url text,
    s_profile float,
    s_wish float,
    final_score float
)
language sql stable
as $$
  select
    j.id,
    j.headline,
    j.location,
    j.location_lat,
    j.location_lon,
    j.company_size,
    j.work_modality,
    j.job_url,
    j.webpage_url,
    (1 - (j.embedding <=> v_profile)) as s_profile,
    (1 - (j.embedding <=> v_wish)) as s_wish,
    (
      (0.7 * (1 - (j.embedding <=> v_profile))) + 
      (0.3 * (1 - (j.embedding <=> v_wish))) +
      (CASE WHEN remote_boost AND j.work_modality IN ('hybrid', 'remote') THEN 0.05 ELSE 0 END)
    ) as final_score
  from job_ads j
  where 
    j.embedding is not null 
    AND j.is_active = true 
    AND (j.application_deadline is null or j.application_deadline >= now())
    AND (
      radius_km >= 9999
      OR (
        j.location_lat BETWEEN u_lat - (radius_km / 111.0) AND u_lat + (radius_km / 111.0)
        AND
        j.location_lon BETWEEN u_lon - (radius_km / (111.0 * cos(radians(u_lat)))) AND u_lon + (radius_km / (111.0 * cos(radians(u_lat))))
      )
    )
  order by final_score desc
  limit p_top_k;
$$;
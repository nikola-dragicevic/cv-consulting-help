-- ✅ FINAL (768-dim) RPC FUNCTIONS WITH INTELLIGENT FALLBACK & CORRECT COLUMNS

drop function if exists match_jobs_initial(vector, float, float, float, int, text[]);
drop function if exists match_jobs_initial(vector, float, float, float, int, text[], text);
drop function if exists match_jobs_profile_wish(vector, vector, float, float, float, text, text, boolean, int, text[]);

-- 1) Initial matching with occupation field hard filter
create or replace function match_jobs_initial(
    v_profile vector(768),
    u_lat float,
    u_lon float,
    radius_km float,
    top_k int,
    candidate_tags text[] default null,
    filter_occupation_field text default null  -- ✅ Hard filter by occupation field
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
    (1 - (j.embedding <=> v_profile)) as s_profile
  from job_ads j
  where
    j.embedding is not null
    and j.is_active = true
    and (j.application_deadline is null or j.application_deadline >= now())

    -- ✅ SMART GATE: 
    and (
      candidate_tags is null
      or array_length(candidate_tags, 1) is null
      or j.category_tags is null 
      or array_length(j.category_tags, 1) is null
      or array_length(j.category_tags, 1) = 0
      or (j.category_tags && candidate_tags)
    )

    -- ✅ HARD FILTER: Occupation field must match exactly (prevents cross-domain matches)
    and (
      filter_occupation_field is null
      or j.occupation_field_label = filter_occupation_field
    )

    and (
      radius_km >= 9999
      or (
        j.location_lat between u_lat - (radius_km / 111.0) and u_lat + (radius_km / 111.0)
        and
        j.location_lon between u_lon - (radius_km / (111.0 * cos(radians(u_lat))))
                         and u_lon + (radius_km / (111.0 * cos(radians(u_lat))))
      )
    )
  order by (j.embedding <=> v_profile) asc
  limit top_k;
$$;

-- 2) Refined matching with both vectors + occupation field filter
create or replace function match_jobs_profile_wish(
    v_profile vector(768),
    v_wish vector(768),
    u_lat float,
    u_lon float,
    radius_km float,
    metro text,
    county text,
    remote_boost boolean,
    p_top_k int,
    candidate_tags text[] default null,
    filter_occupation_field text default null  -- ✅ Added occupation field filter
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
      (0.2 * (1 - (j.embedding <=> v_profile))) +
      (0.8 * (1 - (j.embedding <=> v_wish))) +
      (case when remote_boost and j.work_modality in ('hybrid', 'remote') then 0.05 else 0 end)
    ) as final_score
  from job_ads j
  where
    j.embedding is not null
    and j.is_active = true
    and (j.application_deadline is null or j.application_deadline >= now())

    -- ✅ SMART GATE
    and (
      candidate_tags is null
      or array_length(candidate_tags, 1) is null
      or j.category_tags is null
      or array_length(j.category_tags, 1) is null
      or array_length(j.category_tags, 1) = 0
      or (j.category_tags && candidate_tags)
    )

    -- ✅ HARD FILTER: Occupation field must match exactly (same as initial match)
    and (
      filter_occupation_field is null
      or j.occupation_field_label = filter_occupation_field
    )

    and (
      radius_km >= 9999
      or (
        j.location_lat between u_lat - (radius_km / 111.0) and u_lat + (radius_km / 111.0)
        and
        j.location_lon between u_lon - (radius_km / (111.0 * cos(radians(u_lat))))
                         and u_lon + (radius_km / (111.0 * cos(radians(u_lat))))
      )
    )
  order by final_score desc
  limit p_top_k;
$$;
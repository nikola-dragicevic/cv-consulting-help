-- scripts/match_jobs.sql
-- This SQL function finds the top N job matches for a given candidate vector

create or replace function match_jobs(
    embedding vector(1024),
    top_k integer default 10
)
returns table (
    id text,
    headline text,
    description_text text,
    similarity float
)
language sql stable
as $$
  select
    id,
    headline,
    description_text,
    1 - (embedding <#> match_jobs.embedding) as similarity
  from job_ads
  where embedding is not null AND is_active = true AND (application_deadline is null or application_deadline >= now())
  order by embedding <#> match_jobs.embedding
  limit top_k;
$$;

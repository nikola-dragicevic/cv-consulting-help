alter table public.admin_saved_jobs
add column if not exists application_reference text;

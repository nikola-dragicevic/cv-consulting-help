alter table public.employer_interview_bookings
add column if not exists followup_token uuid,
add column if not exists employer_followup_email_sent_at timestamptz,
add column if not exists employer_followup_completed_at timestamptz,
add column if not exists employer_followup_notes text,
add column if not exists agreed_base_salary_sek integer,
add column if not exists employment_start_date date,
add column if not exists employment_type text,
add column if not exists employment_contract_signed boolean not null default false,
add column if not exists employment_contract_signed_at timestamptz,
add column if not exists proof_document_path text,
add column if not exists proof_document_name text,
add column if not exists salary_confirmed_at timestamptz,
add column if not exists active_billing_at timestamptz,
add column if not exists employment_ended_at date;

update public.employer_interview_bookings
set followup_token = gen_random_uuid()
where followup_token is null;

alter table public.employer_interview_bookings
alter column followup_token set default gen_random_uuid();

create unique index if not exists idx_employer_interview_bookings_followup_token
  on public.employer_interview_bookings(followup_token);

insert into storage.buckets (id, name, public)
values ('employer-proofs', 'employer-proofs', false)
on conflict (id) do update set public = false;

drop policy if exists "service_role_all_access_employer_proofs" on storage.objects;
create policy "service_role_all_access_employer_proofs"
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'employer-proofs')
  with check (bucket_id = 'employer-proofs');

alter table public.employer_intro_acceptances
add column if not exists compensation_model text not null default 'monthly_percentage',
add column if not exists monthly_percentage numeric(5,2),
add column if not exists one_time_fee_sek integer;

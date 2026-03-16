alter table public.employer_interview_bookings
add column if not exists admin_followup_status text not null default 'booked';

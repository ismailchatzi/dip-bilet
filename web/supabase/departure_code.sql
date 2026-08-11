-- Supabase → SQL Editor → Run
-- Profilde kalkış tercihi

alter table public.profiles
  add column if not exists departure_code text not null default 'IST';

notify pgrst, 'reload schema';

-- Supabase → SQL Editor → Run
-- Telefon + SMS bildirim alanları

alter table public.profiles
  add column if not exists phone text,
  add column if not exists phone_verified boolean not null default false,
  add column if not exists sms_alerts boolean not null default false;

grant select, insert, update, delete on table public.profiles to service_role;

notify pgrst, 'reload schema';

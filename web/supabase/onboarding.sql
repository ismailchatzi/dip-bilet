-- Kurulum sonrası onboarding: adım, destinasyon tercihleri, tamamlanma zamanı
-- Supabase SQL Editor'da bir kez çalıştır.

alter table public.profiles
  add column if not exists onboarding_step int not null default 0;

alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

alter table public.profiles
  add column if not exists destination_codes text[] not null default '{}';

comment on column public.profiles.onboarding_step is '0=kalkış, 1=destinasyon, 2=bildirim; tamamlanınca onboarding_completed_at dolar';
comment on column public.profiles.destination_codes is 'Kullanıcının takip ettiği varış IATA kodları';

-- Mevcut üyeler kurulumu atlasın (yeni akıştan önce kayıtlı olanlar)
update public.profiles
set
  onboarding_completed_at = coalesce(onboarding_completed_at, now()),
  onboarding_step = greatest(onboarding_step, 3)
where onboarding_completed_at is null
  and created_at < now() - interval '1 minute';

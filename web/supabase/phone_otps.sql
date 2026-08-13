-- SMS OTP (telefon doğrulama)
create table if not exists public.phone_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists phone_otps_user_created_idx
  on public.phone_otps (user_id, created_at desc);

alter table public.phone_otps enable row level security;

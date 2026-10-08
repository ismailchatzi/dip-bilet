-- Supabase Dashboard → SQL Editor → Run
-- Fiyat özetleri (gece VPS hesaplar) + üye fiyat alarmları. Mevcut tablolara dokunmaz.

create table if not exists public.price_insights (
  dest_code text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.price_insights enable row level security;
grant all on table public.price_insights to service_role;

create table if not exists public.price_alerts (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  dest_code text not null,
  month text,
  max_price numeric not null check (max_price > 0),
  currency text not null default 'USD',
  active boolean not null default true,
  last_sent_key text,
  last_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists price_alerts_user_idx on public.price_alerts (user_id);

alter table public.price_alerts enable row level security;

drop policy if exists "price_alerts own select" on public.price_alerts;
create policy "price_alerts own select" on public.price_alerts
  for select using (auth.uid() = user_id);

drop policy if exists "price_alerts own insert" on public.price_alerts;
create policy "price_alerts own insert" on public.price_alerts
  for insert with check (auth.uid() = user_id);

drop policy if exists "price_alerts own delete" on public.price_alerts;
create policy "price_alerts own delete" on public.price_alerts
  for delete using (auth.uid() = user_id);

grant select, insert, delete on table public.price_alerts to authenticated;
grant usage, select on sequence public.price_alerts_id_seq to authenticated;
grant all on table public.price_alerts to service_role;
grant usage, select on sequence public.price_alerts_id_seq to service_role;

notify pgrst, 'reload schema';

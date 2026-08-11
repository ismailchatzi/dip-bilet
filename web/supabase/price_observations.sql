-- Supabase Dashboard → SQL Editor → Run
-- Fiyat gözlemleri: kendi rota/sezon ortalaması için

create table if not exists public.price_observations (
  id bigserial primary key,
  route_key text not null,
  season_key text not null,
  destination_code text,
  destination_name text not null,
  price numeric not null,
  currency text not null default 'TRY',
  outbound_date date,
  return_date date,
  source text not null,
  discount_percent numeric,
  average_price numeric,
  observed_at timestamptz not null default now()
);

create index if not exists price_observations_route_season_idx
  on public.price_observations (route_key, season_key);

create index if not exists price_observations_observed_at_idx
  on public.price_observations (observed_at desc);

alter table public.price_observations enable row level security;

-- Sadece service role yazar/okur (RLS açık, kullanıcı policy yok)

grant all on table public.price_observations to service_role;
grant usage, select on sequence public.price_observations_id_seq to service_role;

notify pgrst, 'reload schema';

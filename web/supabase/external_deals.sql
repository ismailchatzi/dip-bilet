-- Supabase Dashboard → SQL Editor → Run
-- Dış kaynak fırsat ilanları (ucuzaucak, fly4free, Secret Flying, Faretus, Telegram).
-- Yalnız VPS toplayıcısı yazar; mevcut tablolara dokunmaz.

create table if not exists public.external_deals (
  id bigserial primary key,
  source text not null,
  source_id text not null,
  url text not null,
  title text not null,
  published_at timestamptz,
  origin text,
  dest_code text,
  price numeric,
  currency text,
  trip_type text,
  stops integer,
  date_pairs jsonb not null default '[]'::jsonb,
  details jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists external_deals_seen_idx on public.external_deals (first_seen_at desc);
create index if not exists external_deals_dest_idx on public.external_deals (dest_code);

alter table public.external_deals enable row level security;
grant all on table public.external_deals to service_role;
grant usage, select on sequence public.external_deals_id_seq to service_role;

notify pgrst, 'reload schema';

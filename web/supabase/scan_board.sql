-- Supabase Dashboard → SQL Editor → Run
-- Panel sadece buradan okur; SerpApi çağırmaz. Cron yazar.

create table if not exists public.scan_board (
  id int primary key default 1 check (id = 1),
  deals jsonb,
  city_fares jsonb,
  updated_at timestamptz not null default now()
);

insert into public.scan_board (id)
values (1)
on conflict (id) do nothing;

alter table public.scan_board enable row level security;

-- Giriş yapmış kullanıcı paneli okuyabilir (yazma yok)
create policy "Authenticated read scan_board"
  on public.scan_board
  for select
  to authenticated
  using (true);

grant select on table public.scan_board to authenticated;
grant all on table public.scan_board to service_role;

notify pgrst, 'reload schema';

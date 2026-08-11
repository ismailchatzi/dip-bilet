-- Supabase Dashboard → SQL Editor → New query → Run
-- E-posta bildirimleri: profil + daha önce haber verilen fırsatlar

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  email_alerts boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alerted_deals (
  deal_key text primary key,
  destination text,
  price numeric,
  discount_percent numeric,
  first_alerted_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.alerted_deals enable row level security;

-- Üye kendi profilini okur / günceller
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- alerted_deals: sadece service role (RLS açık, policy yok = kullanıcı erişemez)

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mevcut üyeleri profil tablosuna doldur
insert into public.profiles (id, email)
select id, coalesce(email, '')
from auth.users
where email is not null
on conflict (id) do update
  set email = excluded.email,
      updated_at = now();

grant select, insert, update on table public.profiles to authenticated;
grant all on table public.alerted_deals to service_role;

notify pgrst, 'reload schema';

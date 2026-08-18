-- Supabase → SQL Editor → Run
-- 1) phone / phone_verified yalnız service_role (OTP sonrası) yazılır
-- 2) SMS kota için IP hash kolonu

alter table public.phone_otps
  add column if not exists ip_hash text;

create index if not exists phone_otps_ip_created_idx
  on public.phone_otps (ip_hash, created_at desc);

create or replace function public.protect_profile_phone()
returns trigger
language plpgsql
as $$
declare
  jwt_role text;
begin
  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  );
  if jwt_role = '' then
    begin
      jwt_role := coalesce(
        current_setting('request.jwt.claims', true)::json ->> 'role',
        ''
      );
    exception
      when others then
        jwt_role := '';
    end;
  end if;

  if jwt_role = 'service_role' then
    return new;
  end if;

  -- Dashboard / security definer (handle_new_user)
  if jwt_role = '' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.phone := null;
    new.phone_verified := false;
    return new;
  end if;

  new.phone := old.phone;
  new.phone_verified := old.phone_verified;
  return new;
end;
$$;

drop trigger if exists protect_profile_phone on public.profiles;
create trigger protect_profile_phone
  before insert or update on public.profiles
  for each row
  execute function public.protect_profile_phone();

notify pgrst, 'reload schema';

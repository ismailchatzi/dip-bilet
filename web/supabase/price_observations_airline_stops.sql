-- Havayolu / aktarma: tek yön taramadan kartlara
alter table public.price_observations
  add column if not exists airline text,
  add column if not exists stops integer,
  add column if not exists self_transfer boolean;

notify pgrst, 'reload schema';

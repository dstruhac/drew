-- Shared trigger function to keep `updated_at` current on every row update.
-- Reused by every table below that has an `updated_at` column.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

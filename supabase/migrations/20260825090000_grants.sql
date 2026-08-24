-- Table-level GRANTs for the `authenticated` role. Row Level Security
-- policies (see profiles.sql, competitions.sql, matches.sql,
-- predictions.sql) are the real access boundary, but Postgres checks
-- table-level GRANTs first -- without these, every query fails with
-- "permission denied for table ..." before RLS is ever evaluated.
grant usage on schema public to authenticated;

grant select, update on public.profiles to authenticated;
grant select on public.competitions to authenticated;
grant select on public.matches to authenticated;
grant select, insert, update, delete on public.predictions to authenticated;

-- sync-fixtures.mjs běží pod service role klíčem (obchází RLS, viz
-- scripts/sync/lib/supabase-client.mjs), ale stejně jako `authenticated`
-- (20260825090000_grants.sql) potřebuje explicitní table-level GRANT --
-- Supabase u čerstvě vytvořené tabulky negrantuje přístup automaticky
-- ani service_role roli. Reálně objeveno prvním ostrým během
-- sync-fixtures.yml (27.8.2026): "permission denied for table
-- competitions", ještě než se vůbec dostalo k vyhodnocení RLS.
grant usage on schema public to service_role;

grant select on public.competitions to service_role;
grant select, insert, update on public.matches to service_role;

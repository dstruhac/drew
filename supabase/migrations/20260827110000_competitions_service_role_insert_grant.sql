-- service_role dosud mělo na competitions jen SELECT
-- (20260827090000_service_role_grants.sql) -- sync-fixtures.mjs do
-- competitions nikdy nezapisoval, jen z ní četl. scripts/sync/ensure-competition.mjs
-- teď potřebuje i INSERT/UPDATE (zakládá/doplňuje competition), narazil
-- proto na stejnou třídu chyby jako dřív matches: "permission denied for
-- table competitions", ještě před vyhodnocením RLS. Objeveno prvním
-- ostrým během ensure-competition.yml (27.8.2026, zakládání "Chance Liga").
grant insert, update on public.competitions to service_role;

-- award-weekly-badges.mjs běží pod service role klíčem a potřebuje číst
-- predictions.points, aby mohlo sečíst body za uplynulý týden. Stejná
-- třída chyby jako u matches/competitions (viz PROJECT.md) -- Supabase
-- negrantuje přístup k tabulce automaticky ani service_role roli.
-- Reálně objeveno prvním ostrým během award-weekly-badges.yml
-- (27.8.2026): "permission denied for table predictions".
grant select on public.predictions to service_role;

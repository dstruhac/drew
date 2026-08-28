-- predict-reminders.mjs běží pod service role klíčem a potřebuje číst
-- competition_participants (kdo hraje kterou soutěž), aby vůbec vědělo,
-- komu chybějící tip hlídat. Stejná třída chyby jako u matches/
-- competitions/predictions/weekly_badges (viz PROJECT.md, sekce
-- "Grants") -- Supabase negrantuje přístup k tabulce automaticky ani
-- service_role roli, tentokrát u competition_participants.
grant select on public.competition_participants to service_role;

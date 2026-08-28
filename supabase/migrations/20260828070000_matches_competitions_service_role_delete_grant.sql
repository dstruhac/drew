-- Jednorázový úklid testovacích dat (28.8.2026, odsouhlaseno s uživatelem
-- přes AskUserQuestion) potřebuje smazat celou testovací competition
-- "Fotbalová liga 2026/27" a tři ručně založené demo zápasy uvnitř
-- "Hokejová extraliga 2026/27" -- přes service role klíč z GitHub Actions
-- (db-once-cleanup.yml), protože tenhle sandbox nemá přímý přístup na
-- *.supabase.co (viz CLAUDE.md, sekce "Síťové omezení").
--
-- service_role dosud mělo na matches/competitions jen SELECT/INSERT/UPDATE
-- (20260827090000_service_role_grants.sql,
-- 20260827110000_competitions_service_role_insert_grant.sql) -- stejná
-- třída chyby jako předchozí čtyři výskyty (viz PROJECT.md, sekce
-- "Grants"), tentokrát poprvé potřebujeme DELETE.
grant delete on public.matches to service_role;
grant delete on public.competitions to service_role;

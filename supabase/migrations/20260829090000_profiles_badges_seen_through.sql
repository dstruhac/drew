-- Do jakého týdne (weekly_badges.week_start) uživatel už viděl souhrn
-- medailí za vítězství týdne (dashboard, viz badge-center.tsx).
-- Nahrazuje dřívější "watermark" jen v localStorage prohlížeče --
-- appka si to teď pamatuje v DB, takže se gratulace/upozornění
-- nezobrazí znovu na jiném zařízení.
--
-- Default `current_date` platí i pro NOVĚ vznikající řádky (nový
-- uživatel se tak automaticky dozví jen o medailích udělených PO
-- registraci, ne o historii soutěže, do které se teprve přidal) --
-- handle_new_user() trigger sloupec při insertu nevyplňuje, takže se
-- na nové řádky uplatní tenhle sloupcový default.
alter table public.profiles
  add column badges_seen_through date not null default current_date;

-- Zpětné vyplnění existujících uživatelů na dnešek, aby appka po
-- nasazení nezaplavila dashboard historickými medailemi, které si
-- třeba už všimli přes starý localStorage mechanismus.
update public.profiles set badges_seen_through = current_date;

-- profiles_update_own (20260824120200_profiles.sql) je politika na
-- celý řádek bez omezení sloupců -- žádná nová policy/grant není
-- potřeba, zápis bude fungovat stejně jako dnešní změna přezdívky.

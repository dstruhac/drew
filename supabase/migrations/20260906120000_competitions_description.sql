-- Krátký popisek soutěže (zobrazený na kartičce místo dřívějšího
-- řádku s body bodování, viz CompetitionCard) -- např. "Nejvyšší
-- česká fotbalová liga" nebo u Náhodné ligy vysvětlení, jak výběr
-- zápasů funguje. Nullable, ať appka umí zobrazit i soutěž bez
-- popisku (fallback v UI), ale u všech čtyř existujících soutěží ho
-- rovnou vyplňujeme.
alter table public.competitions
  add column description text;

update public.competitions
set description = 'Nejvyšší česká hokejová soutěž — tip na každý zápas sezóny.'
where name = 'Hokejová extraliga 2026/27';

update public.competitions
set description = 'Nejvyšší česká fotbalová liga — tip na každé kolo.'
where name = 'Chance Liga';

update public.competitions
set description = 'Nejlepší anglická fotbalová liga — tip na každé kolo.'
where name = 'Premier League';

update public.competitions
set description = 'Každý den 5 nových zápasů namátkou ze 13 fotbalových a hokejových lig.'
where sport = 'mixed';

-- competitions_select_authenticated (20260824120300_competitions.sql)
-- je politika na celý řádek bez omezení sloupců -- žádná nová
-- policy/grant není potřeba, čtení bude fungovat stejně jako u
-- logo_url dnes.

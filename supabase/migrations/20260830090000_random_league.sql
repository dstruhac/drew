-- "Náhodná liga": jedna trvalá soutěž, které se každý den doplní 5
-- náhodně vybraných zápasů napříč skupinou známých fotbalových a
-- hokejových lig (viz scripts/sync/random-league.mjs). Na rozdíl od
-- ostatních soutěží zápasy NEPOCHÁZEJÍ z jedné ligy (competitions.
-- scrape_source/scrape_path), ale z libovolné ligy v poolu -- proto
-- potřebuje appka vědět sport i zdrojovou stránku ZVLÁŠŤ u KAŽDÉHO
-- zápasu, ne jen jednou u competition.
--
-- sport = 'mixed' je signál pro sync-results (viz results.mjs), že
-- tahle competition kombinuje víc lig a musí se s ní zacházet jinak
-- (seskupit zápasy podle matches.source_scrape_path, dotáhnout výsledek
-- z KAŽDÉ zdrojové ligy zvlášť, a nikdy needitovat řádky mimo těch, co
-- si appka sama vybrala -- jinak by omylem naimportovala celou ligu).
alter table public.competitions
  drop constraint competitions_sport_check,
  add constraint competitions_sport_check check (sport in ('hockey', 'football', 'mixed'));

-- Vyplněno jen u zápasů "mixed" competition (Náhodná liga) -- u
-- normální jednoligové competition zůstává null a appka použije
-- competition.sport, přesně jak je tomu dnes.
alter table public.matches
  add column sport text check (sport in ('hockey', 'football')),
  add column source_scrape_path text;

comment on column public.matches.sport is
  'Jen u zápasů z "mixed" competition (Náhodná liga) -- který sport tenhle konkrétní zápas je. Jinak null, appka použije competition.sport.';
comment on column public.matches.source_scrape_path is
  'Jen u zápasů z "mixed" competition (Náhodná liga) -- livesport.cz cesta ligy, odkud zápas pochází, aby sync-results věděl, kde hledat výsledek.';

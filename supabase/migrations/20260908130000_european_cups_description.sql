-- Popisky pro tři nové samostatné soutěže (Liga mistrů, Evropská liga,
-- Konferenční liga), založené 8.9.2026 na žádost uživatele jako
-- plnohodnotné sledované competitions (vlastní žebříček/kartička) --
-- ne jen jako zdroj zápasů uvnitř Creme de la Creme ligy, kam scrape
-- cesty přibyly ve stejný den o pár hodin dřív (viz
-- 20260908070000_creme_description_variable_count.sql).
--
-- Soutěže samotné zakládá scripts/sync/ensure-competition.mjs (přes
-- ensure-competition.yml), tahle migrace jen doplňuje description
-- stejným způsobem jako u ostatních čtyř soutěží
-- (20260906120000_competitions_description.sql).
update public.competitions
set description = 'Nejprestižnější evropský fotbalový pohár — tip na každý zápas Realu, Bayernu, PSG a dalších.'
where name = 'Liga mistrů';

update public.competitions
set description = 'Druhý nejvyšší evropský fotbalový pohár — tip na každý zápas.'
where name = 'Evropská liga';

update public.competitions
set description = 'Třetí evropský fotbalový pohár — tip na každý zápas.'
where name = 'Konferenční liga';

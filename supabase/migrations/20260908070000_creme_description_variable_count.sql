-- Popisek "Creme de la Creme ligy" (competitions.description, viz
-- 20260906120000_competitions_description.sql) sliboval napevno "5
-- nových zápasů" -- realita je "0 až 5" (mezinárodní reprezentační
-- přestávky, kdy většina domácích lig nehraje, + nově i vyřazování
-- zápasů s kickoffem v pražské noci, viz random-league.mjs). Napevno
-- daných 5 mátlo uživatele v den, kdy appka reálně ukázala jen 1 (nebo
-- 0) zápasů. Zároveň aktualizován počet lig v poolu (13 -> 16, po
-- přidání Ligy mistrů / Evropské ligy / Konferenční ligy 8.9.2026).
update public.competitions
set description = 'Každý den 0–5 nových zápasů namátkou ze 16 fotbalových a hokejových lig.'
where sport = 'mixed';

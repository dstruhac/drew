-- Stejný reálný zápas se dokáže objevit ve víc soutěžích najednou --
-- typicky "Náhodná liga" (Creme de la Creme liga) nabírá zápasy ze
-- sledovaných domácích lig (Chance Liga, Premier League, ...), takže
-- appka pro NĚJ založí druhý řádek v `matches` se STEJNÝM
-- `external_id` (livesport ID zápasu), jen jinou `competition_id`.
--
-- Appka teď (14.9.2026, na žádost uživatele) při uložení tipu hledá
-- sourozenecké zápasy podle `external_id` napříč VŠEMI soutěžemi, aby
-- mohla stejný tip propsat i tam -- viz submitPrediction() v
-- src/app/(app)/spaces/[id]/actions.ts. Bez indexu by tenhle dotaz
-- (`where external_id = ...`) dělal sekvenční průchod celou tabulkou
-- při KAŽDÉM uložení tipu.
create index if not exists matches_external_id_idx
  on public.matches (external_id)
  where external_id is not null;

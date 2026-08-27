-- sync-fixtures.mjs upsertuje s onConflict: "competition_id,external_id"
-- (matches.upsert(rows, { onConflict: "competition_id,external_id" })).
-- Postgres ale ON CONFLICT s pouhým seznamem sloupců nedokáže napárovat
-- na ČÁSTEČNÝ unikátní index (matches_competition_external_id_key měl
-- `where external_id is not null`) -- proto první ostrý běh selhal:
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification".
--
-- Řešení: obyčejný (neomezený) unikátní index na stejné dvojici sloupců.
-- Chování zůstává stejné, jak bylo zamýšleno -- Postgres bere každou
-- hodnotu NULL jako navzájem odlišnou, takže víc ručně vytvořených
-- zápasů s external_id = NULL v jedné competition je pořád v pořádku,
-- omezuje se jen shoda konkrétních (competition_id, external_id) párů.
drop index public.matches_competition_external_id_key;

create unique index matches_competition_external_id_key
  on public.matches (competition_id, external_id);

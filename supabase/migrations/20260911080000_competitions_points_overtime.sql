-- Bod navíc za správně tipnuté "bude/nebude prodloužení/nájezdy"
-- (predictions.predicted_overtime_flag) -- rozhodnuto s uživatelem
-- 10.9.2026: přesný tip / vítěz / góly zůstávají 3/1/1 stejné napříč
-- sporty (beze změny), hokej má navíc tuhle NEZÁVISLOU čtvrtou osu,
-- která se vždy přičítá navrch, bez ohledu na to, jestli hráč trefil
-- přesný tip, nebo ne. Maximum za hokejový zápas je tak 4 body (3+1),
-- o 1 víc než fotbalový strop 3 -- odpovídá tomu, že hokej má jednu
-- otázku k tipování navíc.
--
-- Per-competition sloupec (stejná konvence jako points_exact/
-- points_winner/points_total_goals), ne globální konstanta -- appka
-- dnes bodování soutěže nastavuje na téhle úrovni. U fotbalových
-- soutěží se hodnota nikdy neuplatní (predicted_overtime_flag je u
-- fotbalu vždy null, viz calculate_match_points úprava v navazující
-- migraci), takže default 1 je neškodný i tam.
alter table public.competitions
  add column points_overtime int not null default 1;

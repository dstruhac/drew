-- Podpora pro odložené zápasy (29.8.2026, na žádost uživatele po
-- reálném případu -- Bohemians vs. Mladá Boleslav, Chance Liga).
--
-- Livesport.cz odložený zápas beze zbytku zmizí jak z rozpisu
-- ("/program/"), tak z výsledků ("/vysledky/"), dokud nevyhlásí nový
-- termín -- appka to dřív nerozeznala od zápasu, který se právě hraje,
-- a ukazovala matoucí "čekáme na aktuální skóre" donekonečna.
--
-- Detekce (scripts/sync/results.mjs): zápas se považuje za odložený,
-- když má status='scheduled', kickoff_at je víc než 4 hodiny v
-- minulosti (bezpečná rezerva nad běžnou délku zápasu i s
-- prodloužením), a NENÍ mezi zápasy, které livesport.cz právě teď
-- vrací na stránce výsledků (ne jen mezi těmi s už zapsaným skóre --
-- odložený zápas na výsledkové stránce úplně chybí, dohrávaný tam je,
-- jen zatím bez skóre).
--
-- Zpětné odblokování: jakmile livesport.cz zápas znovu zařadí do
-- rozpisu s novým termínem, sync-fixtures ho najde na "/program/" a
-- explicitně nastaví status zpátky na 'scheduled' (viz úprava
-- scripts/sync/fixtures.mjs ve stejném commitu) -- appka tedy sama
-- pozná, až se zápas znovu rozehraje.
alter table public.matches drop constraint matches_status_check;
alter table public.matches add constraint matches_status_check
  check (status in ('scheduled', 'live', 'finished', 'postponed'));

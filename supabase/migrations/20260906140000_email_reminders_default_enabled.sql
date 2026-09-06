-- Výchozí stav e-mailového upozornění na nevyplněný tip
-- (competition_participants.email_reminders_enabled) přehozen z opt-in
-- (vypnuto) na opt-out (zapnuto) -- na žádost uživatele 6.9.2026.
--
-- Platí jen pro NOVĚ vznikající řádky (nový participant, viz
-- joinCompetition v spaces/[id]/actions.ts, který sloupec při insertu
-- nevyplňuje, takže se uplatní sloupcový default). Vědomě NEmění
-- stávající řádky -- účastník, který si upozornění sám nezapnul, ho
-- dál mít nebude, ať appka nikomu nezačne posílat e-maily bez toho,
-- aby o to sám požádal (viz předchozí rozhodnutí
-- 20260828170000_competition_participants_email_reminders.sql, dnes
-- jen otočené pro budoucí participanty, ne zpětně).
alter table public.competition_participants
  alter column email_reminders_enabled set default true;

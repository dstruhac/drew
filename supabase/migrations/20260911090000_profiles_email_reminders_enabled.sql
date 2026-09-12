-- Upozornění na nevyplněný tip přechází z opt-in PER COMPETITION
-- (competition_participants.email_reminders_enabled) na jeden globální
-- přepínač na hráče -- uživatel 11.9.2026 nahlásil, že mít to
-- rozsekané po jednotlivých soutěžích je matoucí, a chtěl to sjednotit
-- do jednoho přepínače v hlavičce appky.
--
-- Default `true` navazuje na dřívější rozhodnutí
-- (20260906140000_email_reminders_default_enabled.sql) -- appka se
-- posunula k "upozornění zapnutá, dokud si je hráč sám nevypne", ne
-- naopak.
alter table public.profiles
  add column email_reminders_enabled boolean not null default true;

-- Migrace stavu (odsouhlaseno s uživatelem 11.9.2026): kdo měl
-- upozornění zapnuté aspoň u JEDNÉ soutěže, dostane globální přepínač
-- rovnou zapnutý (a od teď je bude dostávat napříč VŠEMI svými
-- soutěžemi, ne jen tou, kde si ho původně zapnul) -- kdo neměl
-- zapnuto nikde, zůstává vypnutý.
update public.profiles p
set email_reminders_enabled = exists (
  select 1
  from public.competition_participants cp
  where cp.user_id = p.id
    and cp.email_reminders_enabled = true
);

-- predict-reminders.mjs (service role) teď čte tenhle sloupec místo
-- competition_participants.email_reminders_enabled -- service_role
-- dosud neměla na public.profiles vůbec žádný grant (zjištěno
-- 10.9.2026 při revizi dokumentace, tehdy odloženo jako "zatím
-- neškodí, nic to nečte" -- teď už to čte). Stejná třída chyby jako
-- u matches/competitions/predictions/weekly_badges/
-- competition_participants (viz PROJECT.md, "Grants").
grant select on public.profiles to service_role;

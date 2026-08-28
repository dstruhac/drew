-- E-mailové upozornění na nevyplněný tip (predict-reminders.mjs) se
-- zapíná/vypíná ZA KAŽDOU SOUTĚŽ ZVLÁŠŤ -- na žádost uživatele
-- 28.8.2026 tlačítkem přímo na stránce soutěže, ne globálně v profilu.
-- Výchozí stav nového participanta je VYPNUTO (opt-in, ne opt-out) --
-- odsouhlaseno s uživatelem 28.8.2026, ať appka nikoho nezahltí e-maily
-- bez toho, aby si o ně řekl.
alter table public.competition_participants
  add column email_reminders_enabled boolean not null default false;

-- Přihlášení/odhlášení ze soutěže (insert/delete) appka už uměla
-- samoobslužně -- update přibývá kvůli tomuhle přepínači.
create policy "competition_participants_update_own"
  on public.competition_participants for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant update on public.competition_participants to authenticated;

-- Hecovačky rozšiřují competition_participants o dva sloupce a
-- upravují, kdo smí přidat/vidět koho -- viz docs/PROJECT.md, sekce
-- Hecovačky.
alter table public.competition_participants
  add column added_by uuid references public.profiles (id) on delete set null,
  add column notified_at timestamptz;

comment on column public.competition_participants.added_by is
  'Vyplněno jen když participanta přidal NĚKDO JINÝ (tvůrce hecovačky) -- u samoobslužného přihlášení do veřejné soutěže i u přijetí pozvánkového odkazu zůstává null (hráč se přidal sám, e-mail není potřeba).';
comment on column public.competition_participants.notified_at is
  'Kdy appka poslala e-mail "byl jsi přidán do hecovačky X" -- viz scripts/sync/hecovacky.mjs. Null = ještě neposláno (nebo se posílat nemá, viz added_by).';

-- Zpřísnění dřívější samoobslužné insert policy (20260826200000): u
-- soukromé (hecovačka) competition se hráč nesmí přidat sám bez
-- pozvánky -- jen u veřejných soutěží funguje "Chci hrát" beze změny.
drop policy "competition_participants_insert_own" on public.competition_participants;

create policy "competition_participants_insert_own"
  on public.competition_participants for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.competitions c
      where c.id = competition_participants.competition_id
        and c.visibility = 'public'
    )
  );

-- Tvůrce hecovačky smí vložit LIBOVOLNÉHO uživatele appky do své
-- vlastní soukromé competition -- "přidat hráče ze seznamu" i
-- počáteční hráči při založení (viz create_hecovacka()).
create policy "competition_participants_insert_by_owner"
  on public.competition_participants for insert
  to authenticated
  with check (
    exists (
      select 1 from public.competitions c
      where c.id = competition_participants.competition_id
        and c.created_by = auth.uid()
        and c.visibility = 'private'
    )
  );

-- Tvůrce smí i odebrat participanta ze své hecovačky (oprava omylu
-- při přidávání) -- vedle stávající "sám sebe" delete policy.
create policy "competition_participants_delete_by_owner"
  on public.competition_participants for delete
  to authenticated
  using (
    exists (
      select 1 from public.competitions c
      where c.id = competition_participants.competition_id
        and c.created_by = auth.uid()
        and c.visibility = 'private'
    )
  );

-- Nahrazuje dřívější "kdokoliv přihlášený vidí, kdo hraje kterou
-- soutěž" -- u soukromé hecovačky vidí seznam hráčů jen její
-- tvůrce/participant, stejné omezení jako u competitions/matches výše.
drop policy "competition_participants_select_authenticated" on public.competition_participants;

create policy "competition_participants_select_visible"
  on public.competition_participants for select
  to authenticated
  using (
    exists (
      select 1 from public.competitions c
      where c.id = competition_participants.competition_id
        and (
          c.visibility = 'public'
          or c.created_by = auth.uid()
          or exists (
            select 1 from public.competition_participants cp2
            where cp2.competition_id = c.id
              and cp2.user_id = auth.uid()
          )
        )
    )
  );

-- service_role potřebuje UPDATE (zápis notified_at po odeslání
-- e-mailu, viz hecovacky.mjs) -- appka má v historii osm případů, kdy
-- chyběl grant pro service_role a zjistilo se to až při ostrém běhu
-- (viz PROJECT.md, sekce "Grants"), takže ho přidávám rovnou spolu se
-- sloupci, co ho budou potřebovat.
grant update on public.competition_participants to service_role;

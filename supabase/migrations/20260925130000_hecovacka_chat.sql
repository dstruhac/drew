-- Chat v hecovačkách (na žádost uživatele 25.9.2026) -- textové zprávy
-- + GIFky z GIPHY (appka jen ukládá URL vybraného GIFu, samotné
-- vyhledávání jde přímo z prohlížeče na GIPHY API, appka do toho
-- nezasahuje). Jen pro hecovačky (visibility='private'), ne pro
-- veřejné soutěže -- odsouhlaseno s uživatelem, veřejné soutěže appka
-- hraje i s lidmi, co se navzájem neznají.
--
-- Jedna společná místnost na celou hecovačku (ne zvlášť po zápasech) --
-- odsouhlaseno s uživatelem.
create table public.hecovacka_messages (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text,
  gif_url text,
  created_at timestamptz not null default now(),
  -- Zpráva musí mít aspoň jedno z obojího -- appka trimuje a kontroluje
  -- na serveru (actions.ts), ale RLS insert policy níže sama o sobě
  -- obsah nekontroluje, takže by šlo přímým zápisem obejít trim a
  -- uložit vizuálně prázdnou zprávu (samé mezery) bez GIFky -- proto
  -- appka i tady vyžaduje neprázdný ořezaný text, ne jen "not null"
  -- (nalezeno Codex review na PR #231, 5. kolo).
  constraint hecovacka_messages_body_or_gif check (
    gif_url is not null or (body is not null and btrim(body) <> '')
  ),
  -- Běžný chatový limit délky, appka to samo o sobě nijak nevymáhá na
  -- klientovi zvlášť přísně, jen jako pojistka proti zjevnému zneužití.
  constraint hecovacka_messages_body_length check (body is null or char_length(body) <= 500),
  -- Stejná kontrola jako v sendHecovackaMessage (actions.ts) -- appka
  -- gifUrl bere jako obyčejný string z formuláře, tahle podmínka je
  -- druhá pojistka přímo v DB, ať to nejde obejít ani mimo appku
  -- (nalezeno Codex review na PR #231).
  constraint hecovacka_messages_gif_url_check check (
    gif_url is null
    or (char_length(gif_url) <= 500 and gif_url ~ '^https://media[0-9]*\.giphy\.com/')
  )
);

create index hecovacka_messages_competition_id_created_at_idx
  on public.hecovacka_messages (competition_id, created_at);

alter table public.hecovacka_messages enable row level security;

-- Vidět/psát smí jen participant DANÉ hecovačky -- stejné pravidlo
-- jako u zápasů/tipů (vynuceno v DB, ne jen v UI). Insert navíc
-- kontroluje visibility='private' -- appka do veřejných soutěží chat
-- vůbec nenabízí v UI, ale ať to nejde obejít ani přímým zápisem.
-- Skončená (archivovaná) hecovačka se "zakonzervuje" stejně jako
-- zápasy/přidávání hráčů (viz assertHecovackaNotArchived v actions.ts)
-- -- appka nedovolí novou zprávu, historii ale číst jde dál.
create policy "hecovacka_messages_select_participant"
  on public.hecovacka_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.competition_participants cp
      where cp.competition_id = hecovacka_messages.competition_id
        and cp.user_id = auth.uid()
    )
  );

create policy "hecovacka_messages_insert_own"
  on public.hecovacka_messages for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.competition_participants cp
      where cp.competition_id = hecovacka_messages.competition_id
        and cp.user_id = auth.uid()
    )
    and exists (
      select 1 from public.competitions c
      where c.id = hecovacka_messages.competition_id
        and c.visibility = 'private'
        and c.status <> 'archived'
    )
  );

-- Autor smí smazat jen svou vlastní zprávu (odsouhlaseno s uživatelem).
create policy "hecovacka_messages_delete_own"
  on public.hecovacka_messages for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.hecovacka_messages to authenticated;

-- Realtime -- appka zprávy doručuje ostatním hráčům bez nutnosti
-- obnovit stránku (Supabase Realtime naslouchá změnám v týhle
-- tabulce). RLS výše platí i tady u INSERT/UPDATE (appka dostane jen
-- řádky, které by SELECT policy pustila).
--
-- DELETE je jiný případ (ověřeno webovým hledáním 25.9.2026, appka
-- předtím zkoušela REPLICA IDENTITY FULL, což u DELETE s RLS nestačí):
-- Supabase Realtime u smazaného řádku úmyslně pošle jen primární klíč
-- v "old" záznamu, ať přes RLS neuteče žádný jiný sloupec smazaného
-- řádku ven -- ani REPLICA IDENTITY FULL na tom nic nemění. Appka proto
-- na klientu (chat-panel.tsx) DELETE eventy vůbec nefiltruje podle
-- competition_id (nejde to), jen podle toho, jestli má appka danou
-- zprávu zrovna v místní paměti -- appka dostane DELETE eventy ze
-- VŠECH hecovaček (jen holé UUID smazané zprávy, žádný obsah), pro
-- cizí hecovačku appka takový event jen tiše ignoruje (nemá to v
-- seznamu, nemá co smazat).
alter publication supabase_realtime add table public.hecovacka_messages;

-- Kdy hráč naposledy viděl chat dané hecovačky -- appka podle toho
-- pozná nepřečtené zprávy (odznak na kartičce Dashboardu + ikonka
-- v horní liště). NULL = nikdy neotevřel, všechny zprávy jsou nové.
-- Update zvládne appka přes už existující politiku
-- "competition_participants_update_own" (20260828170000) a grant
-- (authenticated má UPDATE na celou tabulku už teď) -- nic dalšího
-- navíc nepotřeba.
alter table public.competition_participants
  add column chat_last_read_at timestamptz;

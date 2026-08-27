-- weekly_badges: vizuální odznak za nejvíc bodů v kalendářním týdnu
-- (pondělí-neděle, pražský čas), zvlášť za každou competition.
-- Uděluje periodická úloha award-weekly-badges (scripts/sync/) service
-- role klíčem -- žádná insert/update/delete policy pro běžné
-- uživatele, stejný model jako matches.
--
-- Při shodě (víc hráčů se stejným maximem bodů v týdnu) dostane
-- medaili každý z nich -- proto (competition_id, week_start, user_id)
-- jako primární klíč, ne unikátní jen na (competition_id, week_start).
--
-- Týden bez zápasů nebo bez jediného obodovaného tipu (maxPoints = 0)
-- žádný řádek nedostane -- "vítěz" s 0 body by nic neznamenal
-- (odsouhlaseno s uživatelem 27.8.2026).
create table public.weekly_badges (
  competition_id uuid not null references public.competitions (id) on delete cascade,
  week_start date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  points int not null,
  awarded_at timestamptz not null default now(),
  primary key (competition_id, week_start, user_id)
);

create index weekly_badges_user_id_idx on public.weekly_badges (user_id);

alter table public.weekly_badges enable row level security;

-- Stejný důvěryhodný model jako zbytek appky: kdokoliv přihlášený vidí
-- všechny udělené medaile (zobrazují se na žebříčku každé soutěže).
create policy "weekly_badges_select_authenticated"
  on public.weekly_badges for select
  to authenticated
  using (true);

-- Grants pro obě role rovnou v týhle migraci -- ať se nemusí (potřetí)
-- objevovat "permission denied for table ..." až při prvním ostrém
-- běhu, jako se to stalo u matches a competitions (viz PROJECT.md).
grant select on public.weekly_badges to authenticated;
grant select, insert on public.weekly_badges to service_role;

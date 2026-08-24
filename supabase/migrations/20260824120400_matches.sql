-- matches: individual games inside a competition.
--
-- `external_id` is nullable on purpose: a NULL external_id already means
-- "not imported from an API", which is exactly what a future manually
-- created match will look like. No extra "source" column needed yet.
--
-- `status` again uses text + check (see competitions.sql) so new statuses
-- can be added with a constraint change instead of an enum migration.
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  external_id text,
  home_team text not null,
  away_team text not null,
  kickoff_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'finished')),
  home_score int,
  away_score int,
  -- Only meaningful for hockey (was the match decided in overtime /
  -- a shootout). Always null for football matches.
  overtime_flag boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prevent importing the same external match twice into the same
-- competition. Manually created matches (external_id is null) are exempt.
create unique index matches_competition_external_id_key
  on public.matches (competition_id, external_id)
  where external_id is not null;

create index matches_competition_id_idx on public.matches (competition_id);
create index matches_kickoff_at_idx on public.matches (kickoff_at);

create trigger matches_set_updated_at
  before update on public.matches
  for each row
  execute function public.set_updated_at();

alter table public.matches enable row level security;

-- Everyone signed in can see all matches (same trust model as competitions).
create policy "matches_select_authenticated"
  on public.matches for select
  to authenticated
  using (true);

-- No insert/update/delete policy for regular users yet: matches are
-- written by the results-import Edge Function (service role, bypasses
-- RLS) or manually via the Supabase SQL editor. When manual match
-- creation ships, add an insert/update policy scoped to the competition's
-- `created_by`.

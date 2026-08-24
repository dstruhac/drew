-- competitions ("spaces"): one tipping competition, e.g. a season or a
-- tournament. Scoring config lives here so it can differ per competition.
--
-- `sport` and `status` use text + check constraints instead of Postgres
-- enum types on purpose: adding a new allowed value later is a plain
-- `alter table ... drop constraint / add constraint`, no ALTER TYPE
-- ceremony. Extend the check lists here when adding a new sport.
create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sport text not null check (sport in ('hockey', 'football')),
  status text not null default 'active' check (status in ('active', 'archived')),
  points_exact int not null default 3,
  points_winner int not null default 1,
  points_total_goals int not null default 1,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger competitions_set_updated_at
  before update on public.competitions
  for each row
  execute function public.set_updated_at();

alter table public.competitions enable row level security;

-- Everyone signed in can browse all competitions (small trusted group,
-- no per-competition membership model yet).
create policy "competitions_select_authenticated"
  on public.competitions for select
  to authenticated
  using (true);

-- No insert/update/delete policy for regular users yet: competitions are
-- created manually via the Supabase SQL editor / service role for now.
-- When self-service creation is added, add an insert policy such as
-- `with check (created_by = auth.uid())` plus an owner-only update/delete
-- policy using `created_by = auth.uid()`.

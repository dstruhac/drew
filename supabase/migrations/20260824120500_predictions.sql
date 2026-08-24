-- predictions: one user's tip for one match.
--
-- `is_locked` is a plain stored flag (as specced) kept in sync by app /
-- Edge Function logic for display purposes. It is NOT what RLS relies on
-- for enforcement below -- the policies compare against the match's
-- `kickoff_at` directly, so a stale `is_locked` value can never be used
-- to sneak in a late edit.
create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  predicted_home_score int not null,
  predicted_away_score int not null,
  -- Only meaningful for hockey matches. Always null for football.
  predicted_overtime_flag boolean,
  is_locked boolean not null default false,
  -- Filled in by the scoring Edge Function once the match is finished.
  points int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, user_id)
);

create index predictions_match_id_idx on public.predictions (match_id);
create index predictions_user_id_idx on public.predictions (user_id);

create trigger predictions_set_updated_at
  before update on public.predictions
  for each row
  execute function public.set_updated_at();

alter table public.predictions enable row level security;

-- Before kickoff: a user can only see their own tip (no copying).
-- From kickoff onward the match is locked, so everyone's tips become
-- visible to every signed-in user.
create policy "predictions_select_own_or_locked"
  on public.predictions for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.matches m
      where m.id = predictions.match_id
        and m.kickoff_at <= now()
    )
  );

create policy "predictions_insert_own_before_kickoff"
  on public.predictions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = predictions.match_id
        and m.kickoff_at > now()
    )
  );

create policy "predictions_update_own_before_kickoff"
  on public.predictions for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = predictions.match_id
        and m.kickoff_at > now()
    )
  );

create policy "predictions_delete_own_before_kickoff"
  on public.predictions for delete
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = predictions.match_id
        and m.kickoff_at > now()
    )
  );

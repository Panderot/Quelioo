-- Quelio Live Game ("Canlı Yarışma"): a teacher hosts a quiz on the board, students join from their phones.
-- Students never sign in. They get a per-game player token from the server (stored here only as a hash);
-- every student read and write goes through api/live. Teachers read their own games through Row Level
-- Security and control them only through api/live. Nothing here is writable by the browser.

-- ---------------------------------------------------------------------------
-- live_games
-- ---------------------------------------------------------------------------

create table public.live_games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- The quiz the game was made from. No foreign key: a game (and its results) outlives the quiz in the Archive.
  quiz_id text not null check (char_length(quiz_id) <= 80),
  quiz_title text not null default '' check (char_length(quiz_title) <= 300),
  code text not null check (code ~ '^[0-9]{6}$'),
  -- Random part of the Realtime topic names. Topics carry only "state changed" hints, never data.
  channel_key text not null check (char_length(channel_key) between 16 and 64),
  settings jsonb not null check (pg_column_size(settings) < 4000),
  -- Snapshot taken when the lobby opens (questions, options, correct answers, explanations): later edits
  -- to the quiz never change a running game. Server-side only; students never read this table.
  questions jsonb not null check (pg_column_size(questions) < 3000000),
  question_count integer not null check (question_count between 1 and 200),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  state text not null default 'lobby' check (state in ('lobby', 'question', 'reveal', 'finished', 'ended')),
  locked boolean not null default false,
  paused boolean not null default false,
  current_index integer not null default -1,
  question_started_at timestamptz,
  question_deadline timestamptz,
  paused_remaining_ms integer check (paused_remaining_ms >= 0),
  -- Bumped on every change; clients refetch the state when a hint carries a newer number.
  rev integer not null default 0,
  -- Aggregates only (player count, average, per-question rates): no nicknames. Kept after the players are deleted.
  summary jsonb check (pg_column_size(summary) < 500000),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  last_activity_at timestamptz not null default now(),
  -- Set when the 30-day cleanup removed the players and their answers.
  ranking_purged_at timestamptz
);

-- A code is unique among games that are still running; finished games release it.
create unique index live_games_active_code_idx on public.live_games (code) where state in ('lobby', 'question', 'reveal');
create index live_games_owner_created_idx on public.live_games (owner_id, created_at desc);
create index live_games_cleanup_idx on public.live_games (state, last_activity_at);

-- ---------------------------------------------------------------------------
-- live_players
-- ---------------------------------------------------------------------------

create table public.live_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.live_games (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 16),
  -- Lower-cased, accent-free form used to refuse a nickname that only differs by case or accents.
  nickname_key text not null check (char_length(nickname_key) between 1 and 64),
  -- SHA-256 of the player token. The token itself is only on the student's device.
  token_hash text not null unique check (char_length(token_hash) = 64),
  score integer not null default 0 check (score >= 0),
  streak integer not null default 0 check (streak >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  total_time_ms bigint not null default 0 check (total_time_ms >= 0),
  removed boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create unique index live_players_game_nickname_idx on public.live_players (game_id, nickname_key) where not removed;
create index live_players_game_idx on public.live_players (game_id);

-- ---------------------------------------------------------------------------
-- live_answers
-- ---------------------------------------------------------------------------

create table public.live_answers (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.live_games (id) on delete cascade,
  player_id uuid not null references public.live_players (id) on delete cascade,
  question_index integer not null check (question_index >= 0),
  -- Chosen option numbers (one for single choice and true/false, several for multi-answer).
  answer jsonb not null check (pg_column_size(answer) < 200),
  received_at timestamptz not null default now(),
  elapsed_ms integer not null check (elapsed_ms >= 0),
  correct boolean not null,
  -- Points of this answer including the streak bonus; filled in when the question is revealed.
  points integer not null default 0 check (points >= 0),
  unique (player_id, question_index)
);

create index live_answers_game_question_idx on public.live_answers (game_id, question_index);

-- ---------------------------------------------------------------------------
-- live_rate: join attempts per client in a short window (shared by every server instance)
-- ---------------------------------------------------------------------------

create table public.live_rate (
  key text primary key check (char_length(key) <= 120),
  window_start timestamptz not null default now(),
  hits integer not null default 0
);

-- Counts one attempt for `p_key`; false once the window's budget is used up.
create or replace function public.live_rate_hit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_hits integer;
begin
  insert into public.live_rate as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end,
        hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end
  returning hits into current_hits;
  return current_hits <= p_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cleanup: idle games end after 30 minutes; the players and answers of games finished more than
-- 30 days ago are deleted (KVKK). Aggregates in live_games.summary stay.
-- ---------------------------------------------------------------------------

create or replace function public.live_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ended_count integer;
  purged_games integer;
  purged_players integer;
begin
  update public.live_games
     set state = 'ended', finished_at = coalesce(finished_at, now()), rev = rev + 1
   where state in ('lobby', 'question', 'reveal') and last_activity_at < now() - interval '30 minutes';
  get diagnostics ended_count = row_count;

  with old_games as (
    select id from public.live_games
     where state in ('finished', 'ended')
       and ranking_purged_at is null
       and coalesce(finished_at, last_activity_at) < now() - interval '30 days'
  ), removed as (
    delete from public.live_players p using old_games g where p.game_id = g.id returning p.id
  ), marked as (
    update public.live_games set ranking_purged_at = now() where id in (select id from old_games) returning id
  )
  select (select count(*) from marked), (select count(*) from removed) into purged_games, purged_players;

  delete from public.live_rate where window_start < now() - interval '1 hour';

  return jsonb_build_object('ended', ended_count, 'purgedGames', purged_games, 'purgedPlayers', purged_players);
end;
$$;

revoke all on function public.live_rate_hit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.live_cleanup() from public, anon, authenticated;
grant execute on function public.live_rate_hit(text, integer, integer) to service_role;
grant execute on function public.live_cleanup() to service_role;

-- A daily job where pg_cron exists (Supabase: enable the extension once). api/live?action=cleanup, called by a
-- Vercel cron, does the same work, so the migration must not fail when pg_cron is unavailable.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('quelio-live-cleanup', '17 3 * * *', 'select public.live_cleanup()');
exception when others then
  raise notice 'pg_cron is not available; use the Vercel cron for api/live?action=cleanup (%)', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security: a teacher reads their own games, and the players of those games. Nobody writes
-- from the browser, and students (anon) have no access at all.
-- ---------------------------------------------------------------------------

alter table public.live_games enable row level security;
alter table public.live_players enable row level security;
alter table public.live_answers enable row level security;
alter table public.live_rate enable row level security;

create policy live_games_select_own on public.live_games
  for select to authenticated using ((select auth.uid()) = owner_id);

create policy live_players_select_own on public.live_players
  for select to authenticated using (
    exists (select 1 from public.live_games g where g.id = live_players.game_id and g.owner_id = (select auth.uid()))
  );

create policy live_answers_select_own on public.live_answers
  for select to authenticated using (
    exists (select 1 from public.live_games g where g.id = live_answers.game_id and g.owner_id = (select auth.uid()))
  );

revoke all on public.live_games from anon, authenticated;
revoke all on public.live_players from anon, authenticated;
revoke all on public.live_answers from anon, authenticated;
revoke all on public.live_rate from anon, authenticated;
revoke all on all sequences in schema public from anon;

-- Column grants keep the question snapshot (with the correct answers) and token hashes out of the browser.
grant select (id, owner_id, quiz_id, quiz_title, code, settings, question_count, skipped_count, state, locked, paused,
              current_index, summary, created_at, started_at, finished_at, last_activity_at, ranking_purged_at)
  on public.live_games to authenticated;
grant select (id, game_id, nickname, score, streak, correct_count, total_time_ms, removed, joined_at)
  on public.live_players to authenticated;
grant select (game_id, player_id, question_index, correct, points, elapsed_ms)
  on public.live_answers to authenticated;

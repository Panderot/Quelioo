-- Why a game closed: 'completed' (played to the end or ended by the teacher after it started), 'cancelled'
-- (the teacher closed the lobby) or 'idle' (nobody touched it for 30 minutes). Older rows stay null.

alter table public.live_games add column end_reason text check (end_reason in ('completed', 'cancelled', 'idle'));

grant select (end_reason) on public.live_games to authenticated;

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
     set state = 'ended', end_reason = 'idle', finished_at = coalesce(finished_at, now()), rev = rev + 1
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

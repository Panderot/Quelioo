-- Live games, part 2: an automatic change counter, the list of questions already revealed, and a join guard
-- that counts only WRONG codes (a classroom shares one IP: 60 students joining must not block each other,
-- but guessing codes must).

alter table public.live_games add column played integer[] not null default '{}';

grant select (played) on public.live_games to authenticated;

-- rev goes up by one on every update, whoever makes it, so a Realtime hint carrying a number is comparable.
create or replace function public.live_games_bump_rev()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.rev = old.rev + 1;
  return new;
end;
$$;

create trigger live_games_bump_rev before update on public.live_games
  for each row execute function public.live_games_bump_rev();

-- True while `p_key` has already used up its budget in the window (reads only, counts nothing).
create or replace function public.live_rate_blocked(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select r.hits >= p_max and r.window_start >= now() - make_interval(secs => p_window_seconds)
       from public.live_rate r where r.key = p_key),
    false);
$$;

revoke all on function public.live_rate_blocked(text, integer, integer) from public, anon, authenticated;
grant execute on function public.live_rate_blocked(text, integer, integer) to service_role;

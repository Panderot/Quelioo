-- Merge one feature's data into a saved solution's extras without overwriting other keys
-- (two features can write at the same time). Runs as the caller, so Row Level Security applies.
create or replace function public.merge_solve_extras(p_id uuid, p_key text, p_value jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.solves
  set extras = extras || jsonb_build_object(p_key, p_value)
  where id = p_id;
$$;

revoke all on function public.merge_solve_extras(uuid, text, jsonb) from public, anon;
grant execute on function public.merge_solve_extras(uuid, text, jsonb) to authenticated;

-- Written exams (Yazılı Sınav): a teacher's printable school exams and the header fields they reuse.
-- Own rows only, like every user table.

create table public.written_exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 300),
  settings jsonb not null check (pg_column_size(settings) < 1000000),
  questions jsonb not null check (jsonb_typeof(questions) = 'array' and pg_column_size(questions) < 1000000),
  source_quiz_id uuid,
  source_text text not null default '' check (char_length(source_text) <= 400000),
  -- For the list, which must not download every question.
  question_count integer generated always as (jsonb_array_length(questions)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index written_exams_user_updated_idx on public.written_exams (user_id, updated_at desc);
create trigger written_exams_set_updated_at before update on public.written_exams
  for each row execute function public.set_updated_at();

create table public.exam_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  header jsonb not null check (pg_column_size(header) < 20000),
  updated_at timestamptz not null default now()
);
create trigger exam_settings_set_updated_at before update on public.exam_settings
  for each row execute function public.set_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['written_exams', 'exam_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete_own', t);
  end loop;
end;
$$;

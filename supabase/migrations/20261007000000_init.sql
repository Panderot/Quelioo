-- Quelio: accounts, user data, usage, subscriptions and private storage.
-- Every table has Row Level Security; user rows are readable and writable only by their owner.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (one row per auth user, created by a trigger on sign-up)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  ui_language text not null default 'en' check (ui_language in ('en', 'tr', 'hyw')),
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- subscriptions (server writes only; payments come later)
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  plan text not null default 'free' check (char_length(plan) <= 40),
  status text not null default 'active' check (char_length(status) <= 40),
  current_period_end timestamptz,
  provider text check (char_length(provider) <= 40),
  provider_customer_id text check (char_length(provider_customer_id) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- A profile and a free subscription for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');
  meta_lang text := new.raw_user_meta_data ->> 'ui_language';
begin
  insert into public.profiles (id, display_name, ui_language)
  values (
    new.id,
    left(coalesce(meta_name, split_part(coalesce(new.email, ''), '@', 1)), 80),
    case when meta_lang in ('en', 'tr', 'hyw') then meta_lang else 'en' end
  );
  insert into public.subscriptions (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Flashcards
-- ---------------------------------------------------------------------------

create table public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 80),
  description text not null default '' check (char_length(description) <= 160),
  source text not null default 'manual' check (source in ('manual', 'topic', 'text', 'quiz', 'solution')),
  source_ref text check (char_length(source_ref) <= 500),
  language text not null default 'en' check (char_length(language) <= 40),
  new_per_day integer not null default 10 check (new_per_day between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index decks_user_created_idx on public.decks (user_id, created_at);
create trigger decks_set_updated_at before update on public.decks
  for each row execute function public.set_updated_at();

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deck_id uuid not null,
  front text not null default '' check (char_length(front) <= 300),
  back text not null default '' check (char_length(back) <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (deck_id, user_id) references public.decks (id, user_id) on delete cascade
);
create index cards_user_deck_created_idx on public.cards (user_id, deck_id, created_at);
create trigger cards_set_updated_at before update on public.cards
  for each row execute function public.set_updated_at();

-- Spaced repetition (Leitner, five boxes). Times are exact instants (millisecond precision).
create table public.card_progress (
  card_id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  box smallint not null default 1 check (box between 1 and 5),
  due timestamptz not null default now(),
  lapses integer not null default 0 check (lapses >= 0),
  reviews integer not null default 0 check (reviews >= 0),
  last_reviewed_at timestamptz,
  introduced_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (card_id, user_id) references public.cards (id, user_id) on delete cascade
);
create index card_progress_user_due_idx on public.card_progress (user_id, due);
create trigger card_progress_set_updated_at before update on public.card_progress
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Archive: quizzes and solutions
-- ---------------------------------------------------------------------------

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 300),
  source text not null default 'text' check (source in ('text', 'file', 'url')),
  question_type text not null default '' check (char_length(question_type) <= 60),
  difficulty text not null default '' check (char_length(difficulty) <= 60),
  question_count text not null default '' check (char_length(question_count) <= 20),
  options_count text check (char_length(options_count) <= 20),
  output_language text check (char_length(output_language) <= 40),
  source_text text check (char_length(source_text) <= 400000),
  source_hash text check (char_length(source_hash) <= 80),
  include_explanations boolean,
  shuffle_options boolean,
  include_hints boolean,
  focus_parts_count integer check (focus_parts_count between 0 and 1000),
  coverage_scope text check (coverage_scope in ('part')),
  -- GeneratedQuiz: questions, answers, shuffle order, coverage plan.
  quiz jsonb not null check (pg_column_size(quiz) < 3000000),
  -- Reserved for saved attempts and scores.
  results jsonb check (pg_column_size(results) < 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quizzes_user_created_idx on public.quizzes (user_id, created_at desc);
create index quizzes_user_source_hash_idx on public.quizzes (user_id, source_hash);
create trigger quizzes_set_updated_at before update on public.quizzes
  for each row execute function public.set_updated_at();

create table public.solves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  language text not null default 'auto' check (char_length(language) <= 40),
  schema_version integer not null default 1,
  result jsonb not null check (pg_column_size(result) < 1000000),
  extras jsonb not null default '{}'::jsonb check (pg_column_size(extras) < 2000000),
  -- Object path inside the private "uploads" bucket (starts with the user id).
  thumbnail_path text check (char_length(thumbnail_path) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index solves_user_created_idx on public.solves (user_id, created_at desc);
create trigger solves_set_updated_at before update on public.solves
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Songs and audio lessons
-- ---------------------------------------------------------------------------

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The quiz the song was made from. No foreign key: a song outlives its quiz in the Archive.
  quiz_id text not null check (char_length(quiz_id) <= 80),
  quiz_title text not null default '' check (char_length(quiz_title) <= 300),
  title text not null default '' check (char_length(title) <= 300),
  lyrics text not null default '' check (char_length(lyrics) <= 20000),
  style text not null check (char_length(style) <= 60),
  tone text not null default 'normal' check (char_length(tone) <= 60),
  provider text not null check (char_length(provider) <= 60),
  demo boolean not null default false,
  mime_type text not null check (char_length(mime_type) <= 100),
  duration_seconds numeric not null default 0 check (duration_seconds >= 0),
  fact_check_passed boolean not null default true,
  coverage jsonb check (pg_column_size(coverage) < 500000),
  series_part integer check (series_part between 1 and 100),
  -- Object path inside the private "audio" bucket (starts with the user id).
  audio_path text check (char_length(audio_path) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index songs_user_created_idx on public.songs (user_id, created_at desc);
create index songs_user_quiz_idx on public.songs (user_id, quiz_id);
create trigger songs_set_updated_at before update on public.songs
  for each row execute function public.set_updated_at();

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  schema_version integer not null default 1,
  title text not null default '' check (char_length(title) <= 300),
  source_kind text not null default 'text' check (source_kind in ('text', 'file', 'url', 'quiz', 'solution')),
  source_label text not null default '' check (char_length(source_label) <= 500),
  source_text text not null default '' check (char_length(source_text) <= 400000),
  source_hash text not null default '' check (char_length(source_hash) <= 80),
  options jsonb not null check (pg_column_size(options) < 10000),
  key_points jsonb not null check (pg_column_size(key_points) < 1000000),
  -- Parts with their scripts, voices and audio flags.
  episodes jsonb not null check (pg_column_size(episodes) < 3000000),
  plan_cost_usd numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lessons_user_created_idx on public.lessons (user_id, created_at desc);
create trigger lessons_set_updated_at before update on public.lessons
  for each row execute function public.set_updated_at();

-- Extracted key points per source + level + language (so a style change never pays twice).
create table public.lesson_plans (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (char_length(key) <= 80),
  title text not null default '' check (char_length(title) <= 300),
  key_points jsonb not null check (pg_column_size(key_points) < 1000000),
  episodes jsonb not null check (pg_column_size(episodes) < 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
create trigger lesson_plans_set_updated_at before update on public.lesson_plans
  for each row execute function public.set_updated_at();

-- Recorded lesson lines, keyed by their text, voice and model.
create table public.lesson_segments (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (char_length(key) <= 200),
  -- Object path inside the private "audio" bucket (starts with the user id).
  audio_path text not null check (char_length(audio_path) <= 300),
  duration_seconds numeric not null default 0 check (duration_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
create trigger lesson_segments_set_updated_at before update on public.lesson_segments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- usage_events (server writes only)
-- ---------------------------------------------------------------------------

create table public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null check (char_length(feature) <= 60),
  provider text not null default '' check (char_length(provider) <= 60),
  model text not null default '' check (char_length(model) <= 100),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  created_at timestamptz not null default now()
);
create index usage_events_user_created_idx on public.usage_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_events enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy usage_events_select_own on public.usage_events
  for select to authenticated using ((select auth.uid()) = user_id);

do $$
declare
  t text;
begin
  foreach t in array array['decks', 'cards', 'card_progress', 'quizzes', 'solves', 'songs', 'lessons', 'lesson_plans', 'lesson_segments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete_own', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: nothing for anon; owners get only what the app needs
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Users change their own name and language, never their role; profiles are created by the trigger
-- and removed with the auth user.
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, ui_language) on public.profiles to authenticated;

-- Written by the server (secret key) only.
revoke insert, update, delete on public.subscriptions from authenticated;
revoke insert, update, delete on public.usage_events from authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private buckets, objects live under "<user id>/..."
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('audio', 'audio', false, 52428800, array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/L16', 'application/octet-stream']),
  ('uploads', 'uploads', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  b text;
begin
  foreach b in array array['audio', 'uploads']
  loop
    execute format('create policy %I on storage.objects for select to authenticated using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)', b || '_select_own', b);
    execute format('create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)', b || '_insert_own', b);
    execute format('create policy %I on storage.objects for update to authenticated using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)', b || '_update_own', b, b);
    execute format('create policy %I on storage.objects for delete to authenticated using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)', b || '_delete_own', b);
  end loop;
end;
$$;

-- Removes the data of the features that no longer exist: Songs, Audio Lesson, Live Game and Written Exam.
-- Kept: profiles, subscriptions, decks, cards, card_progress, quizzes, solves, usage_events and the "uploads" bucket.

-- The daily cleanup job of the Live Game (only where pg_cron exists).
do $$
begin
  perform cron.unschedule('quelio-live-cleanup');
exception when others then
  raise notice 'no pg_cron job to remove (%)', sqlerrm;
end;
$$;

-- Tables (policies, triggers and indexes go with them).
drop table if exists public.live_answers cascade;
drop table if exists public.live_players cascade;
drop table if exists public.live_games cascade;
drop table if exists public.live_rate cascade;
drop table if exists public.written_exams cascade;
drop table if exists public.exam_settings cascade;
drop table if exists public.songs cascade;
drop table if exists public.lesson_segments cascade;
drop table if exists public.lesson_plans cascade;
drop table if exists public.lessons cascade;

-- Functions of the Live Game.
drop function if exists public.live_rate_hit(text, integer, integer);
drop function if exists public.live_rate_blocked(text, integer, integer);
drop function if exists public.live_cleanup();
drop function if exists public.live_games_bump_rev();

-- The "audio" storage bucket held song and lesson audio: its policies go here; the files and the bucket
-- itself are removed through the Storage API (direct deletes from storage tables are not allowed).
drop policy if exists audio_select_own on storage.objects;
drop policy if exists audio_insert_own on storage.objects;
drop policy if exists audio_update_own on storage.objects;
drop policy if exists audio_delete_own on storage.objects;

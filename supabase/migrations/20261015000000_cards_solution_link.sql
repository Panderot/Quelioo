-- The question notebook: a card made from a solved problem remembers that solution, so the study
-- screen can show the original photo. No foreign key on purpose — deleting a solution and putting
-- it back with Undo must keep the link, and a missing solution is simply shown without a photo.
alter table public.cards add column solution_id uuid;

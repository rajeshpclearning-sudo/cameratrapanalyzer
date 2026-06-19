-- Run once on existing Supabase projects that already have camera_trap_sightings.
-- SQL Editor → New query → paste → Run

alter table public.camera_trap_sightings
  alter column individual_count type text using individual_count::text;

alter table public.camera_trap_sightings
  add column if not exists status text not null default 'Success';

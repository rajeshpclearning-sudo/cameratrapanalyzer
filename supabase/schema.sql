-- Run once in Supabase: SQL Editor → New query → paste → Run
-- Personal use: no login in the app; the server writes with the service role key.

create table if not exists public.camera_trap_sightings (
  id uuid primary key default gen_random_uuid(),
  job_id text not null,
  photo_name text not null,
  sighting_date text,
  sighting_time text,
  species text not null,
  individual_count text not null default '0',
  behavior text not null,
  status text not null default 'Success',
  created_at timestamptz not null default now()
);

create index if not exists camera_trap_sightings_job_id_idx
  on public.camera_trap_sightings (job_id);

create index if not exists camera_trap_sightings_created_at_idx
  on public.camera_trap_sightings (created_at desc);

-- Personal project: no Row Level Security (server uses service role key only).
alter table public.camera_trap_sightings disable row level security;

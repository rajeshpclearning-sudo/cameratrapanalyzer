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

-- Preview-pane accuracy feedback (used on next analysis; later consolidated into rules).
create table if not exists public.analysis_feedback (
  id uuid primary key default gen_random_uuid(),
  photo_name text not null,
  ai_species text not null default '',
  correct_species text not null default '',
  comment text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists analysis_feedback_created_at_idx
  on public.analysis_feedback (created_at desc);

create index if not exists analysis_feedback_status_idx
  on public.analysis_feedback (status);

alter table public.analysis_feedback disable row level security;

-- Canonical wildlife species dimension (same list as lib/species-dimension.ts).
create table if not exists public.species_dimension (
  id bigserial primary key,
  common_name text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.species_dimension (common_name, sort_order) values
  ('Spotted Deer', 10),
  ('Asian Elephant', 20),
  ('Gaur', 30),
  ('Sambar Deer', 40),
  ('Indian Muntjac', 50),
  ('Indian Hare', 60),
  ('Indian Crested Porcupine', 70),
  ('Indian Chevrotain', 80),
  ('Bonnet Macaque', 90),
  ('South-Eastern Langur', 100),
  ('Common Leopard', 110),
  ('Leopard Cat', 120),
  ('Wild Dog', 130),
  ('Tiger', 140),
  ('Indian Wild Pig', 150),
  ('Common Palm Civet', 160),
  ('Small Indian Civet', 170),
  ('Stripe-necked Mongoose', 180),
  ('Grey Mongoose', 190),
  ('Sloth Bear', 200)
on conflict (common_name) do update
  set sort_order = excluded.sort_order,
      active = true;

alter table public.species_dimension disable row level security;

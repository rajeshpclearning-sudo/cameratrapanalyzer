-- Review / field-team flags on camera_trap_sightings (Has Human, injury, expert review, foreign objects).

alter table public.camera_trap_sightings
  add column if not exists has_human boolean not null default false;

alter table public.camera_trap_sightings
  add column if not exists injury_or_foreign_on_animal boolean not null default false;

alter table public.camera_trap_sightings
  add column if not exists injury_or_foreign_notes text not null default '';

alter table public.camera_trap_sightings
  add column if not exists needs_expert_review boolean not null default false;

alter table public.camera_trap_sightings
  add column if not exists expert_review_reason text not null default '';

alter table public.camera_trap_sightings
  add column if not exists has_foreign_object_scene boolean not null default false;

alter table public.camera_trap_sightings
  add column if not exists foreign_object_notes text not null default '';

create index if not exists camera_trap_sightings_has_human_idx
  on public.camera_trap_sightings (has_human)
  where has_human = true;

create index if not exists camera_trap_sightings_needs_expert_review_idx
  on public.camera_trap_sightings (needs_expert_review)
  where needs_expert_review = true;

create index if not exists camera_trap_sightings_foreign_flags_idx
  on public.camera_trap_sightings (has_foreign_object_scene, injury_or_foreign_on_animal)
  where has_foreign_object_scene = true or injury_or_foreign_on_animal = true;

-- Canonical wildlife species dimension for FFS Station C8 / WildEye.
-- Optional reference table (app also embeds the same list in lib/species-dimension.ts).

create table if not exists public.species_dimension (
  id bigserial primary key,
  common_name text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.species_dimension is
  'Standard species_common labels for camera-trap wildlife logs';

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

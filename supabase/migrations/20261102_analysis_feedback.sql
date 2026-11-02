-- Preview-pane accuracy feedback for WildEye Analyzer
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

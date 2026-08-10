-- Snapshot Folders — Supabase schema
--
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query →
-- paste → Run. Tables are prefixed `chrome_snapshot_` so they don't collide
-- with the other project sharing this database.
--
-- Row Level Security is enabled so every user can only read/write their OWN
-- folders and screenshots. The image is stored as a base64 data URL in the
-- `image` text column (Postgres TOASTs large values automatically).

-- Folders ---------------------------------------------------------------------
create table if not exists public.chrome_snapshot_folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

-- Screenshots -----------------------------------------------------------------
create table if not exists public.chrome_snapshot_screenshots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  folder_id  uuid references public.chrome_snapshot_folders (id) on delete cascade,
  name       text not null,
  image      text not null,          -- data:image/png;base64,....
  source_url text,
  title      text,
  created_at timestamptz not null default now()
);

create index if not exists chrome_snapshot_screenshots_owner_idx
  on public.chrome_snapshot_screenshots (user_id, folder_id, created_at desc);

-- Row Level Security ----------------------------------------------------------
alter table public.chrome_snapshot_folders     enable row level security;
alter table public.chrome_snapshot_screenshots enable row level security;

-- Each user sees and modifies only their own rows.
drop policy if exists "own folders" on public.chrome_snapshot_folders;
create policy "own folders" on public.chrome_snapshot_folders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own screenshots" on public.chrome_snapshot_screenshots;
create policy "own screenshots" on public.chrome_snapshot_screenshots
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Snapshot Folders — Stripe subscriptions schema
--
-- Run this once in Supabase → SQL Editor (in addition to supabase_schema.sql).
-- Tracks each user's subscription status. Only the Stripe webhook (running with
-- the service_role key, which bypasses RLS) writes to this table; users can
-- only READ their own row, so a user cannot grant themselves access.

create table if not exists public.chrome_snapshot_subscriptions (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text not null default 'inactive',
  price_id               text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  cancellation_feedback  text,   -- Stripe dropdown reason (too_expensive, ...)
  cancellation_comment   text,   -- free-text the customer typed
  cancellation_reason    text,   -- e.g. cancellation_requested
  updated_at             timestamptz not null default now()
);

-- Add the newer columns to an already-existing table (safe to re-run).
alter table public.chrome_snapshot_subscriptions
  add column if not exists cancel_at_period_end  boolean not null default false,
  add column if not exists cancellation_feedback text,
  add column if not exists cancellation_comment  text,
  add column if not exists cancellation_reason   text;

alter table public.chrome_snapshot_subscriptions enable row level security;

-- Users may read only their own subscription row.
drop policy if exists "read own subscription" on public.chrome_snapshot_subscriptions;
create policy "read own subscription" on public.chrome_snapshot_subscriptions
  for select
  using (auth.uid() = user_id);

-- (Intentionally no insert/update/delete policy: writes come only from the
--  webhook via the service_role key.)


-- ---------------------------------------------------------------------------
-- OPTIONAL server-side enforcement (recommended once checkout works).
-- Until you run this, the paywall is enforced in the extension UI only. This
-- makes the database itself refuse to store screenshots for users without an
-- active subscription. Run it AFTER you've confirmed a test subscription works,
-- so you don't lock yourself out mid-setup.
-- ---------------------------------------------------------------------------
--
-- create or replace function public.chrome_snapshot_is_subscribed()
-- returns boolean language sql security definer stable as $$
--   select exists (
--     select 1 from public.chrome_snapshot_subscriptions
--     where user_id = auth.uid() and status in ('active', 'trialing')
--   );
-- $$;
--
-- drop policy if exists "own screenshots" on public.chrome_snapshot_screenshots;
-- create policy "own screenshots" on public.chrome_snapshot_screenshots
--   for all
--   using (auth.uid() = user_id)
--   with check (auth.uid() = user_id and public.chrome_snapshot_is_subscribed());

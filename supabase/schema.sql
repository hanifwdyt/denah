-- ─────────────────────────────────────────────────────────────────────────────
-- Denah cloud storage schema.
--
-- Run this in the Supabase SQL editor (or `supabase db push`). It creates the
-- `plans` table that holds each user's saved floor-plan documents, and Row Level
-- Security policies so every user can only read/write their OWN plans.
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- A plan = the full DenahDoc { levels, activeLevelId, units } stored as JSONB.
create table if not exists public.plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default 'Untitled plan',
  doc         jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Fast "my plans, newest first" lookups.
create index if not exists plans_user_updated_idx
  on public.plans (user_id, updated_at desc);

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table public.plans enable row level security;

-- A user may SELECT only their own plans.
drop policy if exists "plans_select_own" on public.plans;
create policy "plans_select_own"
  on public.plans for select
  using (auth.uid() = user_id);

-- A user may INSERT plans only for themselves.
drop policy if exists "plans_insert_own" on public.plans;
create policy "plans_insert_own"
  on public.plans for insert
  with check (auth.uid() = user_id);

-- A user may UPDATE only their own plans (and cannot reassign ownership).
drop policy if exists "plans_update_own" on public.plans;
create policy "plans_update_own"
  on public.plans for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- A user may DELETE only their own plans.
drop policy if exists "plans_delete_own" on public.plans;
create policy "plans_delete_own"
  on public.plans for delete
  using (auth.uid() = user_id);

-- ── keep updated_at fresh on every UPDATE ────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists plans_touch_updated_at on public.plans;
create trigger plans_touch_updated_at
  before update on public.plans
  for each row execute function public.touch_updated_at();

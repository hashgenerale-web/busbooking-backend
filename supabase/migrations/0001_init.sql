-- ════════════════════════════════════════════════════════════════════════
-- Cobranet Staff Bus Booking — Initial schema
-- Run via: supabase db push   (or paste into the Supabase SQL editor)
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ── staff ──────────────────────────────────────────────────────────────
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text not null unique,
  department text not null default 'General',
  password_hash text not null,
  is_admin boolean not null default false,
  is_new_staff boolean not null default false,
  new_staff_until date,
  is_blocked boolean not null default false,
  block_reason text,
  block_until date,
  days_since_last_seat integer not null default 0,
  total_trips integer not null default 0,
  created_at timestamptz not null default now()
);

-- ── routes ─────────────────────────────────────────────────────────────
create table if not exists routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  stops jsonb not null default '[]'::jsonb,
  capacity integer not null,
  is_active boolean not null default true
);

-- ── registrations (one per staff per day, soft-deleted via withdrawn) ───
create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  route_id uuid not null references routes(id) on delete cascade,
  date date not null,
  registered_at timestamptz not null default now(),
  withdrawn boolean not null default false,
  withdrawn_at timestamptz
);

-- Prevent duplicate active registrations for the same staff/day
create unique index if not exists uniq_active_registration
  on registrations (staff_id, date)
  where withdrawn = false;

-- ── allocations (the result of the daily allocation run) ────────────────
create table if not exists allocations (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  route_id uuid not null references routes(id) on delete cascade,
  seat_number text not null,
  date date not null,
  allocated_at timestamptz not null default now()
);

create unique index if not exists uniq_allocation_per_day
  on allocations (staff_id, date);

-- ── sessions (single active session enforcement) ────────────────────────
create table if not exists sessions (
  staff_id uuid primary key references staff(id) on delete cascade,
  token text not null,
  device_count integer not null default 1,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ── audit_log ─────────────────────────────────────────────────────────
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references staff(id) on delete set null,
  action text not null,
  target_id uuid,
  detail text,
  timestamp timestamptz not null default now()
);

-- ── Helpful indexes ──────────────────────────────────────────────────────
create index if not exists idx_registrations_date on registrations(date);
create index if not exists idx_allocations_date on allocations(date);
create index if not exists idx_allocations_staff on allocations(staff_id);
create index if not exists idx_audit_timestamp on audit_log("timestamp" desc);

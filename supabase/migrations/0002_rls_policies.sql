-- ════════════════════════════════════════════════════════════════════════
-- Row Level Security
--
-- The Node backend connects with the SERVICE ROLE key, which bypasses RLS
-- entirely — so the API works exactly as before with no code changes here.
--
-- These policies exist as defense-in-depth: if the anon/public key is ever
-- exposed to the frontend directly (e.g. for realtime subscriptions), the
-- database itself still enforces who can read/write what.
-- ════════════════════════════════════════════════════════════════════════

alter table staff enable row level security;
alter table routes enable row level security;
alter table registrations enable row level security;
alter table allocations enable row level security;
alter table sessions enable row level security;
alter table audit_log enable row level security;

-- ── staff ──────────────────────────────────────────────────────────────
-- No public/anon access at all. Only the service role (used by the
-- backend) can touch this table — it contains password hashes.
create policy "service role only" on staff
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── routes ─────────────────────────────────────────────────────────────
-- Routes are not sensitive — allow authenticated users (via Supabase Auth,
-- if later adopted) to read active routes. Writes remain service-role only.
create policy "anyone can read active routes" on routes
  for select
  using (is_active = true or auth.role() = 'service_role');

create policy "service role manages routes" on routes
  for insert with check (auth.role() = 'service_role');
create policy "service role updates routes" on routes
  for update using (auth.role() = 'service_role');
create policy "service role deletes routes" on routes
  for delete using (auth.role() = 'service_role');

-- ── registrations / allocations / sessions / audit_log ──────────────────
-- All contain PII or are operationally sensitive (who's on leave, who's
-- riding, session tokens). Service role only, same reasoning as staff.
create policy "service role only" on registrations
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service role only" on allocations
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service role only" on sessions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service role only" on audit_log
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

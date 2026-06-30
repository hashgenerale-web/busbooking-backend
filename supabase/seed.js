/**
 * One-off seed script. Run with: node supabase/seed.js
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Idempotent-ish: skips staff/routes that already exist by username/name.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seed() {
  console.log('Seeding routes...');
  const { data: existingRoutes } = await supabase.from('routes').select('name');
  const existingRouteNames = new Set((existingRoutes || []).map((r) => r.name));

  const routesToInsert = [
    {
      name: 'Route A — Lekki corridor',
      description: 'Covers Chevron, Lekki Phase 1, and Ajah',
      stops: ['Chevron', 'Lekki Phase 1', 'Ajah'],
      capacity: 11,
      is_active: true,
    },
    {
      name: 'Route B — Island / Mainland',
      description: 'Covers VI, Onikan, CMS, and Yaba',
      stops: ['VI', 'Onikan', 'CMS', 'Yaba'],
      capacity: 7,
      is_active: true,
    },
  ].filter((r) => !existingRouteNames.has(r.name));

  if (routesToInsert.length > 0) {
    const { error } = await supabase.from('routes').insert(routesToInsert);
    if (error) throw error;
    console.log(`  Inserted ${routesToInsert.length} routes`);
  } else {
    console.log('  Routes already seeded, skipping');
  }

  console.log('Seeding staff...');
  const { data: existingStaff } = await supabase.from('staff').select('username');
  const existingUsernames = new Set((existingStaff || []).map((s) => s.username));

  const adminPw = bcrypt.hashSync('Admin@123', 10);
  const staffPw = bcrypt.hashSync('Staff@123', 10);
  const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const staffData = [
    { name: 'Super Admin', username: 'admin', is_admin: true, is_new_staff: false, is_blocked: false, department: 'IT',days_since_last_seat: 4, password_hash: adminPw },
    { name: 'Amara Okafor', username: 'amara', department: 'Engineering', is_new_staff: false, is_blocked: false, days_since_last_seat: 4, password_hash: staffPw },
    { name: 'Chidi Eze', username: 'chidi', department: 'Finance', is_new_staff: true, is_blocked: false, new_staff_until: in30Days, password_hash: staffPw },
    { name: 'Fatima Bello', username: 'fatima', department: 'HR', is_new_staff: true, is_blocked: false, new_staff_until: in30Days, password_hash: staffPw },
    { name: 'Emeka Nwosu', username: 'emeka', department: 'Operations', is_new_staff: false, is_blocked: false, days_since_last_seat: 7, password_hash: staffPw },
    { name: 'Ngozi Ibe', username: 'ngozi', department: 'Legal', is_new_staff: false, is_blocked: false, days_since_last_seat: 3, password_hash: staffPw },
    { name: 'Sola Adeyemi', username: 'sola', department: 'Marketing', is_new_staff: false, is_blocked: false, days_since_last_seat: 3, password_hash: staffPw },
    { name: 'Kemi Adebayo', username: 'kemi', department: 'Sales', is_new_staff: false, is_blocked: false, days_since_last_seat: 2, password_hash: staffPw },
    { name: 'Tunde Lawal', username: 'tunde', department: 'Engineering', is_new_staff: false, is_blocked: true, block_reason: 'Annual leave', block_until: '2026-07-20', days_since_last_seat: 2, password_hash: staffPw },
    { name: 'Bisi Okonkwo', username: 'bisi', department: 'Finance', is_new_staff: false, is_blocked: false, days_since_last_seat: 1, password_hash: staffPw },
].filter((s) => !existingUsernames.has(s.username));

  if (staffData.length > 0) {
    const { error } = await supabase.from('staff').insert(staffData);
    if (error) throw error;
    console.log(`  Inserted ${staffData.length} staff`);
  } else {
    console.log('  Staff already seeded, skipping');
  }

  console.log('Done.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

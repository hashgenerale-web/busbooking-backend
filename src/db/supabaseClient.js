const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill these in.'
  );
}

// IMPORTANT: this uses the SERVICE ROLE key, not the anon key.
// The service role bypasses Row Level Security — that's intentional here
// because this client only ever runs on the trusted backend server, never
// in the browser. Access control is enforced in Express middleware
// (requireAuth / requireAdmin), the same way it was with the in-memory db.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

module.exports = supabase;

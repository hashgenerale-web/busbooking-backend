const supabase = require('./supabaseClient');

function mapSession(row) {
  if (!row) return null;
  return {
    staffId: row.staff_id,
    token: row.token,
    deviceCount: row.device_count,
    lastSeen: row.last_seen,
    createdAt: row.created_at,
  };
}

async function get(staffId) {
  const { data, error } = await supabase.from('sessions').select('*').eq('staff_id', staffId).maybeSingle();
  if (error) throw error;
  return mapSession(data);
}

// Upsert — overwrites any existing session for this staff member.
// This single line is what enforces "one active device at a time":
// logging in again replaces the previous row, so the old token no
// longer matches what's stored and requireAuth rejects it.
async function set(staffId, token) {
  const { error } = await supabase
    .from('sessions')
    .upsert({ staff_id: staffId, token, device_count: 1, last_seen: new Date().toISOString() }, { onConflict: 'staff_id' });
  if (error) throw error;
}

async function touch(staffId) {
  const { error } = await supabase.from('sessions').update({ last_seen: new Date().toISOString() }).eq('staff_id', staffId);
  if (error) throw error;
}

async function remove(staffId) {
  const { error } = await supabase.from('sessions').delete().eq('staff_id', staffId);
  if (error) throw error;
}

async function findAll() {
  const { data, error } = await supabase.from('sessions').select('*').order('last_seen', { ascending: false });
  if (error) throw error;
  return data.map(mapSession);
}

async function removeAllExcept(staffId) {
  const { error } = await supabase.from('sessions').delete().neq('staff_id', staffId);
  if (error) throw error;
}

async function count() {
  const { count: c, error } = await supabase.from('sessions').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return c;
}

module.exports = { get, set, touch, remove, findAll, removeAllExcept, count };

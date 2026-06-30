const supabase = require('./supabaseClient');

function mapStaff(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    department: row.department,
    passwordHash: row.password_hash,
    isAdmin: row.is_admin,
    isNewStaff: row.is_new_staff,
    newStaffUntil: row.new_staff_until,
    isBlocked: row.is_blocked,
    blockReason: row.block_reason,
    blockUntil: row.block_until,
    daysSinceLastSeat: row.days_since_last_seat,
    totalTrips: row.total_trips,
    createdAt: row.created_at,
  };
}

async function findAll() {
  const { data, error } = await supabase.from('staff').select('*').order('name');
  if (error) throw error;
  return data.map(mapStaff);
}

async function findById(id) {
  const { data, error } = await supabase.from('staff').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return mapStaff(data);
}

async function findByUsername(username) {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .ilike('username', username)
    .maybeSingle();
  if (error) throw error;
  return mapStaff(data);
}

async function create(staff) {
  const { data, error } = await supabase
    .from('staff')
    .insert({
      name: staff.name,
      username: staff.username,
      department: staff.department || 'General',
      password_hash: staff.passwordHash,
      is_admin: staff.isAdmin || false,
      is_new_staff: staff.isNewStaff || false,
      new_staff_until: staff.newStaffUntil || null,
    })
    .select()
    .single();
  if (error) throw error;
  return mapStaff(data);
}

async function update(id, patch) {
  const colMap = {
    name: 'name',
    department: 'department',
    isAdmin: 'is_admin',
    isNewStaff: 'is_new_staff',
    newStaffUntil: 'new_staff_until',
    passwordHash: 'password_hash',
    isBlocked: 'is_blocked',
    blockReason: 'block_reason',
    blockUntil: 'block_until',
    daysSinceLastSeat: 'days_since_last_seat',
    totalTrips: 'total_trips',
  };
  const dbPatch = {};
  Object.keys(patch).forEach((k) => {
    if (colMap[k]) dbPatch[colMap[k]] = patch[k];
  });
  const { data, error } = await supabase.from('staff').update(dbPatch).eq('id', id).select().maybeSingle();
  if (error) throw error;
  return mapStaff(data);
}

async function remove(id) {
  const { error } = await supabase.from('staff').delete().eq('id', id);
  if (error) throw error;
}

async function block(id, reason, until) {
  return update(id, { isBlocked: true, blockReason: reason || 'Admin restricted', blockUntil: until || null });
}

async function unblock(id) {
  return update(id, { isBlocked: false, blockReason: null, blockUntil: null });
}

// Used by the allocation engine to bulk-write priority score changes
async function bulkUpdatePriority(updates) {
  // updates: [{ id, daysSinceLastSeat, totalTrips }]
  await Promise.all(
    updates.map((u) =>
      supabase
        .from('staff')
        .update({ days_since_last_seat: u.daysSinceLastSeat, total_trips: u.totalTrips })
        .eq('id', u.id)
    )
  );
}

// Unblock anyone whose block_until date has passed
async function unblockExpired(today) {
  const { error } = await supabase
    .from('staff')
    .update({ is_blocked: false, block_reason: null, block_until: null })
    .eq('is_blocked', true)
    .lt('block_until', today);
  if (error) throw error;
}

module.exports = {
  findAll, findById, findByUsername, create, update, remove,
  block, unblock, bulkUpdatePriority, unblockExpired,
};

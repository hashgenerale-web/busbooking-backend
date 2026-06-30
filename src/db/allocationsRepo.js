const supabase = require('./supabaseClient');

function mapAlloc(row) {
  if (!row) return null;
  return {
    id: row.id,
    staffId: row.staff_id,
    routeId: row.route_id,
    seatNumber: row.seat_number,
    date: row.date,
    allocatedAt: row.allocated_at,
  };
}

async function findByDate(date) {
  const { data, error } = await supabase.from('allocations').select('*').eq('date', date);
  if (error) throw error;
  return data.map(mapAlloc);
}

async function findForStaffOnDate(staffId, date) {
  const { data, error } = await supabase
    .from('allocations')
    .select('*')
    .eq('staff_id', staffId)
    .eq('date', date)
    .maybeSingle();
  if (error) throw error;
  return mapAlloc(data);
}

async function findForStaffHistory(staffId, limit = 30) {
  const { data, error } = await supabase
    .from('allocations')
    .select('*')
    .eq('staff_id', staffId)
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map(mapAlloc);
}

async function findInRange(from, to) {
  let query = supabase.from('allocations').select('*').order('date', { ascending: false });
  if (from) query = query.gte('date', from);
  if (to) query = query.lte('date', to);
  const { data, error } = await query;
  if (error) throw error;
  return data.map(mapAlloc);
}

// Bulk insert — used once per day by the allocation engine
async function bulkCreate(allocations) {
  if (allocations.length === 0) return [];
  const rows = allocations.map((a) => ({
    staff_id: a.staffId,
    route_id: a.routeId,
    seat_number: a.seatNumber,
    date: a.date,
  }));
  const { data, error } = await supabase.from('allocations').insert(rows).select();
  if (error) throw error;
  return data.map(mapAlloc);
}

async function deleteByStaffAndDate(staffId, date) {
  const { error } = await supabase.from('allocations').delete().eq('staff_id', staffId).eq('date', date);
  if (error) throw error;
}

async function deleteByDate(date) {
  const { error } = await supabase.from('allocations').delete().eq('date', date);
  if (error) throw error;
}

module.exports = {
  findByDate, findForStaffOnDate, findForStaffHistory, findInRange,
  bulkCreate, deleteByStaffAndDate, deleteByDate,
};

const supabase = require('./supabaseClient');

function mapReg(row) {
  if (!row) return null;
  return {
    id: row.id,
    staffId: row.staff_id,
    routeId: row.route_id,
    date: row.date,
    registeredAt: row.registered_at,
    withdrawn: row.withdrawn,
    withdrawnAt: row.withdrawn_at,
  };
}

async function findActiveByDate(date) {
  const { data, error } = await supabase
    .from('registrations')
    .select('*')
    .eq('date', date)
    .eq('withdrawn', false);
  if (error) throw error;
  return data.map(mapReg);
}

async function findActiveForStaffOnDate(staffId, date) {
  const { data, error } = await supabase
    .from('registrations')
    .select('*')
    .eq('staff_id', staffId)
    .eq('date', date)
    .eq('withdrawn', false)
    .maybeSingle();
  if (error) throw error;
  return mapReg(data);
}

async function create(reg) {
  const { data, error } = await supabase
    .from('registrations')
    .insert({ staff_id: reg.staffId, route_id: reg.routeId, date: reg.date })
    .select()
    .single();
  if (error) throw error;
  return mapReg(data);
}

async function withdraw(id) {
  const { error } = await supabase
    .from('registrations')
    .update({ withdrawn: true, withdrawn_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

async function deleteByDate(date) {
  const { error } = await supabase.from('registrations').delete().eq('date', date);
  if (error) throw error;
}

module.exports = { findActiveByDate, findActiveForStaffOnDate, create, withdraw, deleteByDate };

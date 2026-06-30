const supabase = require('./supabaseClient');

async function log(adminId, action, targetId, detail) {
  const { error } = await supabase.from('audit_log').insert({
    admin_id: adminId,
    action,
    target_id: targetId || null,
    detail: detail || '',
  });
  if (error) throw error;
}

async function recent(limit = 100) {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*, staff!audit_log_admin_id_fkey(name)')
    .order('timestamp', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    adminId: row.admin_id,
    adminName: row.staff?.name || 'Unknown',
    action: row.action,
    targetId: row.target_id,
    detail: row.detail,
    timestamp: row.timestamp,
  }));
}

module.exports = { log, recent };

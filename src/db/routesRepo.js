const supabase = require('./supabaseClient');

function mapRoute(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    stops: row.stops || [],
    capacity: row.capacity,
    isActive: row.is_active,
  };
}

async function findAll() {
  const { data, error } = await supabase.from('routes').select('*').order('name');
  if (error) throw error;
  return data.map(mapRoute);
}

async function findActive() {
  const { data, error } = await supabase.from('routes').select('*').eq('is_active', true).order('name');
  if (error) throw error;
  return data.map(mapRoute);
}

async function findById(id) {
  const { data, error } = await supabase.from('routes').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return mapRoute(data);
}

async function create(route) {
  const { data, error } = await supabase
    .from('routes')
    .insert({
      name: route.name,
      description: route.description || '',
      stops: route.stops || [],
      capacity: route.capacity,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;
  return mapRoute(data);
}

async function update(id, patch) {
  const colMap = { name: 'name', description: 'description', stops: 'stops', capacity: 'capacity', isActive: 'is_active' };
  const dbPatch = {};
  Object.keys(patch).forEach((k) => { if (colMap[k]) dbPatch[colMap[k]] = patch[k]; });
  const { data, error } = await supabase.from('routes').update(dbPatch).eq('id', id).select().maybeSingle();
  if (error) throw error;
  return mapRoute(data);
}

async function remove(id) {
  const { error } = await supabase.from('routes').delete().eq('id', id);
  if (error) throw error;
}

module.exports = { findAll, findActive, findById, create, update, remove };

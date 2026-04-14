import { supabase } from './supabase';

const PING_LIFETIME = 15000; // 15 seconds

function isSupabaseConfigured() {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

/**
 * Create a ping (ephemeral emoji reaction).
 * Returns the ping object. Caller is responsible for scheduling cleanup.
 */
export async function createPing({ lat, lng, emoji }) {
  const ping = {
    lat,
    lng,
    altitude: null,
    content: { type: 'ping', emoji },
    visibility_layer: 'public',
    unlock_date: null,
    media_url: null,
    media_type: null,
    views_left: null,
  };

  if (!isSupabaseConfigured()) {
    return { ...ping, id: `ping_${Date.now()}`, created_at: new Date().toISOString() };
  }

  const { data, error } = await supabase
    .from('capsules')
    .insert(ping)
    .select()
    .single();

  if (error) {
    console.error('[XPortl] Ping insert failed:', error.message);
    throw error;
  }

  // Schedule auto-delete after PING_LIFETIME
  setTimeout(() => deletePing(data.id), PING_LIFETIME);

  return data;
}

/**
 * Delete a ping from the database (cleanup after expiry)
 */
export async function deletePing(pingId) {
  if (!isSupabaseConfigured()) return;

  const { error } = await supabase
    .from('capsules')
    .delete()
    .eq('id', pingId);

  if (error) console.error('[XPortl] Ping delete failed:', error.message);
}

/**
 * Check if a capsule is a ping (ephemeral emoji)
 */
export function isPing(capsule) {
  return capsule.content?.type === 'ping';
}

export { PING_LIFETIME };

import { supabase } from './supabase';
import { deleteMedia } from './storage';

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isSupabaseConfigured() {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

// ── Capsule state helpers ──

export function isCapsuleLocked(capsule) {
  if (!capsule.unlock_date) return false;
  return new Date(capsule.unlock_date) > new Date();
}

export function isGhostCapsule(capsule) {
  return capsule.views_left !== null && capsule.views_left !== undefined;
}

export function getTimeRemaining(capsule) {
  if (!capsule.unlock_date) return null;
  const diff = new Date(capsule.unlock_date) - new Date();
  if (diff <= 0) return null;
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

export function haptic(pattern = [100, 50, 100]) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ── CRUD ──

export async function createCapsule({ lat, lng, altitude, content, visibility_layer, unlock_date, media_url, media_type, views_left }) {
  const capsule = {
    lat,
    lng,
    altitude: altitude || null,
    content,
    visibility_layer: visibility_layer || 'public',
    unlock_date: unlock_date || null,
    media_url: media_url || null,
    media_type: media_type || null,
    views_left: views_left ?? null,
  };

  if (!isSupabaseConfigured()) {
    return { ...capsule, id: `local_${Date.now()}`, views_count: 0, created_at: new Date().toISOString() };
  }

  const { data, error } = await supabase
    .from('capsules')
    .insert(capsule)
    .select()
    .single();

  if (error) {
    console.error('[Xplore] Insert failed:', error.message);
    throw error;
  }

  return data;
}

/**
 * Consume one view of a capsule. Returns { views_left } or null if capsule is gone.
 */
export async function consumeView(capsuleId) {
  if (!isSupabaseConfigured()) return { views_left: null };

  const { data, error } = await supabase.rpc('consume_capsule_view', {
    capsule_id: capsuleId,
  });

  if (error) {
    console.error('[Xplore] consume_view failed:', error.message);
    // Fallback: direct update
    const { data: row } = await supabase
      .from('capsules')
      .select('views_left, views_count')
      .eq('id', capsuleId)
      .single();

    if (row && row.views_left !== null) {
      const newLeft = Math.max(0, row.views_left - 1);
      await supabase.from('capsules').update({
        views_left: newLeft,
        views_count: (row.views_count || 0) + 1,
      }).eq('id', capsuleId);
      return { views_left: newLeft };
    }

    // Increment views_count for non-ghost capsules
    await supabase.from('capsules').update({
      views_count: (row?.views_count || 0) + 1,
    }).eq('id', capsuleId);
    return { views_left: null };
  }

  return { views_left: data };
}

/**
 * Self-destruct a capsule: delete from DB + Storage
 */
export async function selfDestruct(capsuleId) {
  if (!isSupabaseConfigured()) return;

  // Try RPC first
  const { data: mediaUrl, error } = await supabase.rpc('self_destruct_capsule', {
    capsule_id: capsuleId,
  });

  if (error) {
    // Fallback: manual delete
    const { data: row } = await supabase
      .from('capsules')
      .select('media_url')
      .eq('id', capsuleId)
      .single();

    await supabase.from('capsules').delete().eq('id', capsuleId);

    if (row?.media_url) await deleteMedia(row.media_url);
    return;
  }

  if (mediaUrl) await deleteMedia(mediaUrl);
}

// ── Queries ──

export async function getNearbyCapsules(lat, lng, radiusMeters = 50) {
  if (!isSupabaseConfigured()) return [];

  const { data: rpcData, error: rpcError } = await supabase.rpc('get_nearby_capsules', {
    user_lat: lat,
    user_lng: lng,
    radius_meters: radiusMeters,
  });

  if (!rpcError && rpcData) {
    return rpcData.map((c) => ({
      ...c,
      distance_meters: c.distance_meters ?? haversineDistance(lat, lng, c.lat, c.lng),
    }));
  }

  console.warn('[Xplore] RPC fallback:', rpcError?.message);

  const degreeRadius = radiusMeters / 111000;
  const { data: rawData, error: selectError } = await supabase
    .from('capsules')
    .select('id, lat, lng, altitude, content, visibility_layer, unlock_date, views_count, views_left, media_url, media_type, created_at')
    .gte('lat', lat - degreeRadius)
    .lte('lat', lat + degreeRadius)
    .gte('lng', lng - degreeRadius)
    .lte('lng', lng + degreeRadius);

  if (selectError) return [];

  return (rawData || [])
    .filter((c) => {
      if (c.views_left !== null && c.views_left <= 0) return false;
      return true;
    })
    .map((c) => ({ ...c, distance_meters: haversineDistance(lat, lng, c.lat, c.lng) }))
    .filter((c) => c.distance_meters <= radiusMeters)
    .sort((a, b) => a.distance_meters - b.distance_meters);
}

export { haversineDistance };

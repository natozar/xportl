import { supabase } from './supabase';

/**
 * Fetch comments for a capsule, ordered oldest-first.
 * Joins user_profiles to get display_name + avatar_url.
 */
export async function getComments(capsuleId) {
  const { data, error } = await supabase
    .from('comments')
    .select('id, body, created_at, user_id, user_profiles(display_name, avatar_url)')
    .eq('capsule_id', capsuleId)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    console.warn('[XPortl] getComments failed:', error.message);
    return [];
  }

  return (data || []).map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.created_at,
    userId: c.user_id,
    displayName: c.user_profiles?.display_name || 'Portal Walker',
    avatarUrl: c.user_profiles?.avatar_url || null,
  }));
}

/**
 * Post a new comment on a capsule.
 */
export async function addComment(capsuleId, userId, body) {
  const trimmed = (body || '').trim();
  if (!trimmed) return null;

  const { data, error } = await supabase
    .from('comments')
    .insert({ capsule_id: capsuleId, user_id: userId, body: trimmed })
    .select('id, body, created_at, user_id')
    .single();

  if (error) {
    console.error('[XPortl] addComment failed:', error.message);
    throw error;
  }

  return data;
}

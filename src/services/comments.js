import { supabase } from './supabase';
import { createNotification } from './notifications';

/**
 * Fetch comments for a capsule, ordered oldest-first.
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
 * Post a new comment and notify capsule owner + other commenters.
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

  // Fire-and-forget notifications
  notifyOnComment(capsuleId, userId, trimmed).catch(() => {});

  return data;
}

/**
 * Notify capsule owner + previous commenters about a new comment.
 */
async function notifyOnComment(capsuleId, commenterId, commentBody) {
  const preview = commentBody.length > 60 ? commentBody.slice(0, 57) + '...' : commentBody;

  // Get capsule owner
  const { data: capsule } = await supabase
    .from('capsules')
    .select('created_by')
    .eq('id', capsuleId)
    .single();

  const notifiedSet = new Set();

  // Notify capsule owner
  if (capsule?.created_by && capsule.created_by !== commenterId) {
    await createNotification({
      userId: capsule.created_by,
      type: 'comment',
      body: preview,
      capsuleId,
      fromUserId: commenterId,
    });
    notifiedSet.add(capsule.created_by);
  }

  // Notify other commenters on this capsule (unique users, excluding the commenter and owner)
  const { data: otherComments } = await supabase
    .from('comments')
    .select('user_id')
    .eq('capsule_id', capsuleId)
    .neq('user_id', commenterId)
    .limit(50);

  if (otherComments) {
    const uniqueUsers = [...new Set(otherComments.map((c) => c.user_id))];
    for (const uid of uniqueUsers) {
      if (notifiedSet.has(uid)) continue;
      notifiedSet.add(uid);
      await createNotification({
        userId: uid,
        type: 'reply',
        body: preview,
        capsuleId,
        fromUserId: commenterId,
      });
    }
  }
}

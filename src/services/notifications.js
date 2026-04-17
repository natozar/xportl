import { supabase } from './supabase';

/**
 * Fetch notifications for a user, newest first.
 */
export async function getNotifications(userId, limit = 50) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, body, capsule_id, from_user_id, read, created_at, user_profiles!notifications_from_user_id_fkey(display_name, avatar_url)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[XPortl] getNotifications failed:', error.message);
    return [];
  }

  return (data || []).map((n) => ({
    id: n.id,
    type: n.type,
    body: n.body,
    capsuleId: n.capsule_id,
    fromUserId: n.from_user_id,
    fromName: n.user_profiles?.display_name || 'Portal Walker',
    fromAvatar: n.user_profiles?.avatar_url || null,
    read: n.read,
    createdAt: n.created_at,
  }));
}

/**
 * Mark all notifications as read.
 */
export async function markAllRead(userId) {
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);
}

/**
 * Get count of unread notifications.
 */
export async function getUnreadCount(userId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) return 0;
  return count || 0;
}

/**
 * Create a notification (called after commenting).
 */
export async function createNotification({ userId, type, body, capsuleId, fromUserId }) {
  // Don't notify yourself
  if (userId === fromUserId) return;

  await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type,
      body,
      capsule_id: capsuleId || null,
      from_user_id: fromUserId,
    });
}

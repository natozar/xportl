// Friendships service.
//
// Directional rows: `from_id` sends a request to `to_id`. Status goes
// pending → accepted on the recipient's write. RLS enforces both the
// direction (only from_id can INSERT) and the transition (only to_id
// can UPDATE, and only to 'accepted').
//
// Schema: migration_015_friendships.sql

import { supabase } from './supabase';
import { createNotification } from './notifications';

/**
 * Return the user-visible friendship state between me and another user.
 *
 * One of:
 *   'none'             — no row
 *   'pending_sent'     — I sent a request, still pending
 *   'pending_received' — they sent a request to me, I can accept
 *   'friends'          — mutually accepted
 */
export async function getFriendshipState(otherUserId) {
  const { data: sess } = await supabase.auth.getSession();
  const me = sess?.session?.user?.id;
  if (!me || !otherUserId || me === otherUserId) return 'none';

  const { data, error } = await supabase
    .from('friendships')
    .select('from_id, to_id, status')
    .or(`and(from_id.eq.${me},to_id.eq.${otherUserId}),and(from_id.eq.${otherUserId},to_id.eq.${me})`)
    .limit(1);

  if (error || !data || data.length === 0) return 'none';

  const row = data[0];
  if (row.status === 'accepted') return 'friends';
  // status is 'pending' → who sent it?
  return row.from_id === me ? 'pending_sent' : 'pending_received';
}

/**
 * Send a friend request. No-op (returns 'exists') if one already exists
 * in either direction. Fires a 'system' notification at the target.
 */
export async function sendFriendRequest(toUserId) {
  const { data: sess } = await supabase.auth.getSession();
  const me = sess?.session?.user?.id;
  if (!me || !toUserId || me === toUserId) return { ok: false, reason: 'invalid' };

  // Short-circuit — already connected / already pending
  const state = await getFriendshipState(toUserId);
  if (state === 'friends') return { ok: true, reason: 'already_friends' };
  if (state === 'pending_sent') return { ok: true, reason: 'already_pending' };
  if (state === 'pending_received') {
    // They already asked me — just accept instead of duplicating.
    return acceptFriendRequest(toUserId);
  }

  const { error } = await supabase
    .from('friendships')
    .insert({ from_id: me, to_id: toUserId, status: 'pending' });

  if (error) {
    console.warn('[XPortl Friendships] sendFriendRequest failed:', error.message);
    return { ok: false, reason: 'db_error', detail: error.message };
  }

  createNotification({
    userId: toUserId,
    type: 'system',
    body: 'Alguem quer ser seu amigo. Aceite em Perfil > Amigos.',
    capsuleId: null,
    fromUserId: me,
  }).catch(() => {});

  return { ok: true, reason: 'sent' };
}

/**
 * Accept a pending request. The request must have been sent BY
 * otherUserId TO me — RLS enforces this.
 */
export async function acceptFriendRequest(fromUserId) {
  const { data: sess } = await supabase.auth.getSession();
  const me = sess?.session?.user?.id;
  if (!me || !fromUserId) return { ok: false, reason: 'invalid' };

  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('from_id', fromUserId)
    .eq('to_id', me)
    .eq('status', 'pending');

  if (error) {
    console.warn('[XPortl Friendships] acceptFriendRequest failed:', error.message);
    return { ok: false, reason: 'db_error', detail: error.message };
  }

  createNotification({
    userId: fromUserId,
    type: 'system',
    body: 'Sua solicitacao de amizade foi aceita.',
    capsuleId: null,
    fromUserId: me,
  }).catch(() => {});

  return { ok: true, reason: 'accepted' };
}

/**
 * Remove the friendship row — either party can do this. Works for:
 *   - requester cancelling their own pending request
 *   - recipient rejecting a pending request
 *   - either party unfriending
 */
export async function removeFriendship(otherUserId) {
  const { data: sess } = await supabase.auth.getSession();
  const me = sess?.session?.user?.id;
  if (!me || !otherUserId) return { ok: false, reason: 'invalid' };

  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(`and(from_id.eq.${me},to_id.eq.${otherUserId}),and(from_id.eq.${otherUserId},to_id.eq.${me})`);

  if (error) {
    console.warn('[XPortl Friendships] removeFriendship failed:', error.message);
    return { ok: false, reason: 'db_error', detail: error.message };
  }
  return { ok: true };
}

/**
 * Accepted friends + minimal profile for rendering. Returns a flat list
 * of { userId, displayName, avatarUrl, friendedAt }.
 */
export async function listFriends() {
  const { data: sess } = await supabase.auth.getSession();
  const me = sess?.session?.user?.id;
  if (!me) return [];

  const { data, error } = await supabase
    .from('friendships')
    .select('from_id, to_id, updated_at, status')
    .eq('status', 'accepted')
    .or(`from_id.eq.${me},to_id.eq.${me}`);

  if (error || !data) return [];

  // Resolve the "other" user id per row, then hydrate display_name/avatar.
  const otherIds = [...new Set(data.map((r) => (r.from_id === me ? r.to_id : r.from_id)))];
  if (otherIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, display_name, avatar_url')
    .in('id', otherIds);

  const byId = new Map((profiles || []).map((p) => [p.id, p]));

  return data.map((r) => {
    const otherId = r.from_id === me ? r.to_id : r.from_id;
    const p = byId.get(otherId);
    return {
      userId: otherId,
      displayName: p?.display_name || 'Portal Walker',
      avatarUrl: p?.avatar_url || null,
      friendedAt: r.updated_at,
    };
  });
}

/**
 * Count accepted friends — cheaper than listFriends when you only need
 * the number (e.g. profile badge).
 */
export async function countFriends() {
  const { data: sess } = await supabase.auth.getSession();
  const me = sess?.session?.user?.id;
  if (!me) return 0;

  const { count, error } = await supabase
    .from('friendships')
    .select('from_id', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .or(`from_id.eq.${me},to_id.eq.${me}`);

  if (error) return 0;
  return count || 0;
}

/**
 * Bulk state lookup for a list of user ids. Used by MyCapsulesPage to
 * decorate each interactor with their current friendship status.
 * Returns a Map<userId, state>.
 */
export async function getFriendshipStates(otherUserIds) {
  const map = new Map();
  if (!otherUserIds || otherUserIds.length === 0) return map;

  const { data: sess } = await supabase.auth.getSession();
  const me = sess?.session?.user?.id;
  if (!me) {
    otherUserIds.forEach((id) => map.set(id, 'none'));
    return map;
  }

  // Pull every row touching me in one query, then resolve per-id.
  const { data, error } = await supabase
    .from('friendships')
    .select('from_id, to_id, status')
    .or(`from_id.eq.${me},to_id.eq.${me}`);

  if (error || !data) {
    otherUserIds.forEach((id) => map.set(id, 'none'));
    return map;
  }

  const byOther = new Map();
  for (const r of data) {
    const other = r.from_id === me ? r.to_id : r.from_id;
    let state;
    if (r.status === 'accepted') state = 'friends';
    else state = r.from_id === me ? 'pending_sent' : 'pending_received';
    byOther.set(other, state);
  }

  for (const id of otherUserIds) {
    map.set(id, byOther.get(id) || 'none');
  }
  return map;
}

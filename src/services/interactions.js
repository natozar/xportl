import { supabase } from './supabase';
import { createNotification } from './notifications';

/**
 * ── Echo: re-plant a copy at the current user's location ──
 * Creates a new capsule with same content but at new coordinates.
 * Tracks the echo chain in capsule_interactions.
 */
export async function echoReplant(originalCapsule, userId, lat, lng) {
  // Record the interaction
  await supabase.from('capsule_interactions').insert({
    capsule_id: originalCapsule.id,
    user_id: userId,
    interaction_type: 'echo_replant',
    content: { lat, lng },
  });

  // Create the echo copy
  const { data, error } = await supabase
    .from('capsules')
    .insert({
      lat,
      lng,
      content: originalCapsule.content,
      visibility_layer: originalCapsule.visibility_layer,
      media_url: originalCapsule.media_url,
      media_type: originalCapsule.media_type,
      rarity: originalCapsule.rarity,
      capsule_type: 'echo',
      created_by: originalCapsule.created_by, // original creator stays credited
    })
    .select('id')
    .single();

  if (error) throw error;

  // Notify original creator
  createNotification({
    userId: originalCapsule.created_by,
    type: 'system',
    body: `Seu portal Eco foi re-plantado em um novo local!`,
    capsuleId: originalCapsule.id,
    fromUserId: userId,
  }).catch(() => {});

  return data;
}

/**
 * ── Chain: check if user has left a capsule nearby before opening ──
 * Returns true if the user has a capsule within 50m.
 */
export async function checkChainEligibility(userId, lat, lng) {
  const { data } = await supabase
    .rpc('get_nearby_capsules', { user_lat: lat, user_lng: lng, radius_meters: 50 });

  if (!data) return false;
  return data.some((c) => c.created_by === userId);
}

/**
 * ── Challenge: mark challenge as completed ──
 */
export async function completeChallenge(capsuleId, userId, proofBlob, proofType) {
  const { error } = await supabase.from('capsule_interactions').insert({
    capsule_id: capsuleId,
    user_id: userId,
    interaction_type: 'challenge_complete',
    content: { completed_at: new Date().toISOString() },
  });

  if (error) throw error;

  // Notify capsule owner
  const { data: cap } = await supabase.from('capsules').select('created_by').eq('id', capsuleId).single();
  if (cap?.created_by) {
    createNotification({
      userId: cap.created_by,
      type: 'system',
      body: 'Alguem completou seu Desafio!',
      capsuleId,
      fromUserId: userId,
    }).catch(() => {});
  }

  return true;
}

/**
 * ── Collab: add content to a collaborative capsule ──
 */
export async function addCollabEntry(capsuleId, userId, body) {
  const trimmed = (body || '').trim();
  if (!trimmed) return null;

  const { data, error } = await supabase.from('capsule_interactions').insert({
    capsule_id: capsuleId,
    user_id: userId,
    interaction_type: 'collab_add',
    content: { body: trimmed, added_at: new Date().toISOString() },
  }).select('id, content, created_at').single();

  if (error) throw error;
  return data;
}

/**
 * ── Collab: get all entries ──
 */
export async function getCollabEntries(capsuleId) {
  const { data } = await supabase
    .from('capsule_interactions')
    .select('id, user_id, content, created_at, user_profiles(display_name)')
    .eq('capsule_id', capsuleId)
    .eq('interaction_type', 'collab_add')
    .order('created_at', { ascending: true })
    .limit(100);

  return (data || []).map((e) => ({
    id: e.id,
    body: e.content?.body || '',
    userId: e.user_id,
    displayName: e.user_profiles?.display_name || 'Portal Walker',
    createdAt: e.created_at,
  }));
}

/**
 * ── Auction: bid XP to open ──
 * Returns { success, newCost } or throws.
 */
export async function auctionBid(capsuleId, userId) {
  // Count existing bids to calculate cost
  const { count } = await supabase
    .from('capsule_interactions')
    .select('id', { count: 'exact', head: true })
    .eq('capsule_id', capsuleId)
    .eq('interaction_type', 'auction_bid');

  const cost = 10 + (count || 0) * 5; // 10 XP base, +5 per previous bid

  // Check user XP
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('xp')
    .eq('id', userId)
    .single();

  if (!profile || profile.xp < cost) {
    return { success: false, cost, userXp: profile?.xp || 0 };
  }

  // Deduct XP
  await supabase
    .from('user_profiles')
    .update({ xp: profile.xp - cost })
    .eq('id', userId);

  // Record bid
  await supabase.from('capsule_interactions').insert({
    capsule_id: capsuleId,
    user_id: userId,
    interaction_type: 'auction_bid',
    content: { cost },
  });

  // Credit XP to capsule creator
  const { data: cap } = await supabase.from('capsules').select('created_by').eq('id', capsuleId).single();
  if (cap?.created_by && cap.created_by !== userId) {
    await supabase.rpc('award_xp', {
      p_user_id: cap.created_by,
      p_action: 'receive_view',
      p_xp: cost,
      p_capsule_id: capsuleId,
    }).catch(() => {});

    createNotification({
      userId: cap.created_by,
      type: 'xp',
      body: `+${cost} XP! Alguem abriu seu Leilao.`,
      capsuleId,
      fromUserId: userId,
    }).catch(() => {});
  }

  return { success: true, cost };
}

/**
 * Get the current auction cost for a capsule
 */
export async function getAuctionCost(capsuleId) {
  const { count } = await supabase
    .from('capsule_interactions')
    .select('id', { count: 'exact', head: true })
    .eq('capsule_id', capsuleId)
    .eq('interaction_type', 'auction_bid');

  return 10 + (count || 0) * 5;
}

/**
 * Check if user already interacted with a capsule (for echo/chain/challenge limits)
 */
export async function hasInteracted(capsuleId, userId, interactionType) {
  const { count } = await supabase
    .from('capsule_interactions')
    .select('id', { count: 'exact', head: true })
    .eq('capsule_id', capsuleId)
    .eq('user_id', userId)
    .eq('interaction_type', interactionType);

  return (count || 0) > 0;
}

/**
 * Get echo count for a capsule (how many times it was re-planted)
 */
export async function getEchoCount(capsuleId) {
  const { count } = await supabase
    .from('capsule_interactions')
    .select('id', { count: 'exact', head: true })
    .eq('capsule_id', capsuleId)
    .eq('interaction_type', 'echo_replant');

  return count || 0;
}

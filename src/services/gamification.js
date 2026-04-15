import { supabase } from './supabase';

// ── XP Rewards Table ──
const XP_RULES = {
  create_capsule:      25,
  create_ghost:        40,   // ghost capsules are rarer
  create_media:        35,   // photo/video/audio capsule
  discover_capsule:    15,
  receive_view:         5,   // someone viewed your capsule
  first_capsule:       100,  // one-time bonus
  streak_3d:           50,
  streak_7d:          150,
  streak_30d:         500,
  vortex_discovered:   75,   // found a vortex cluster
  ping_sent:            5,
};

// ── Level Formula: level = floor(sqrt(xp / 50)) + 1 ──
// Level 1:    0 XP       Level 6:  1250 XP     Level 15:  9800 XP
// Level 2:   50 XP       Level 7:  1800 XP     Level 20: 18050 XP
// Level 3:  200 XP       Level 8:  2450 XP     Level 30: 42050 XP
// Level 4:  450 XP       Level 9:  3200 XP     Level 50: 120050 XP
// Level 5:  800 XP       Level 10: 4050 XP     Level 99: 480200 XP

export function calculateLevel(xp) {
  return Math.max(1, Math.floor(Math.sqrt(xp / 50)) + 1);
}

export function xpForLevel(level) {
  return Math.pow(level - 1, 2) * 50;
}

export function xpProgress(totalXp) {
  const level = calculateLevel(totalXp);
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const range = nextLevelXp - currentLevelXp;
  const progress = range > 0 ? (totalXp - currentLevelXp) / range : 0;
  return { level, progress: Math.min(1, Math.max(0, progress)), xpToNext: Math.max(0, nextLevelXp - totalXp) };
}

// ── Badges ──
export const BADGES = {
  // Milestones
  first_portal:     { id: 'first_portal',     name: 'Primeiro Portal',      icon: '🌀', desc: 'Criou sua primeira capsula' },
  explorer_10:      { id: 'explorer_10',      name: 'Explorador',           icon: '🧭', desc: 'Descobriu 10 capsulas' },
  explorer_50:      { id: 'explorer_50',      name: 'Desbravador',          icon: '🗺️', desc: 'Descobriu 50 capsulas' },
  explorer_100:     { id: 'explorer_100',     name: 'Lendario',             icon: '⚡', desc: 'Descobriu 100 capsulas' },
  creator_10:       { id: 'creator_10',       name: 'Arquiteto',            icon: '🏗️', desc: 'Criou 10 capsulas' },
  creator_50:       { id: 'creator_50',       name: 'Mestre Portal',        icon: '🌌', desc: 'Criou 50 capsulas' },

  // Special
  ghost_master:     { id: 'ghost_master',     name: 'Fantasma',             icon: '👻', desc: 'Criou 10 capsulas Ghost' },
  time_lord:        { id: 'time_lord',        name: 'Senhor do Tempo',      icon: '⏳', desc: 'Criou capsula com trava temporal' },
  vortex_hunter:    { id: 'vortex_hunter',    name: 'Cacador de Vortex',    icon: '🌪️', desc: 'Descobriu um Vortex' },
  indoor_pioneer:   { id: 'indoor_pioneer',   name: 'Pioneiro Espacial',    icon: '🔬', desc: 'Usou o modo Indoor' },
  media_creator:    { id: 'media_creator',    name: 'Cineasta',             icon: '🎬', desc: 'Criou capsula com midia' },

  // Streaks
  streak_3:         { id: 'streak_3',         name: 'Habito',               icon: '🔥', desc: '3 dias consecutivos' },
  streak_7:         { id: 'streak_7',         name: 'Viciado',              icon: '💎', desc: '7 dias consecutivos' },
  streak_30:        { id: 'streak_30',        name: 'Imortal',              icon: '👑', desc: '30 dias consecutivos' },

  // Social
  popular_10:       { id: 'popular_10',       name: 'Popular',              icon: '🌟', desc: 'Suas capsulas tiveram 10+ views' },
  popular_100:      { id: 'popular_100',      name: 'Viral',                icon: '💫', desc: 'Suas capsulas tiveram 100+ views' },

  // Level
  level_5:          { id: 'level_5',          name: 'Nivel 5',              icon: '🔹', desc: 'Alcancou nivel 5' },
  level_10:         { id: 'level_10',         name: 'Nivel 10',             icon: '🔷', desc: 'Alcancou nivel 10' },
  level_25:         { id: 'level_25',         name: 'Nivel 25',             icon: '💠', desc: 'Alcancou nivel 25' },
  level_50:         { id: 'level_50',         name: 'Nivel 50',             icon: '🏆', desc: 'Alcancou nivel 50' },
};

// ── Level titles ──
export function getLevelTitle(level) {
  if (level >= 50) return 'Oraculo';
  if (level >= 40) return 'Arquimago';
  if (level >= 30) return 'Mestre dos Portais';
  if (level >= 25) return 'Sentinela';
  if (level >= 20) return 'Guardiao';
  if (level >= 15) return 'Desbravador';
  if (level >= 10) return 'Explorador';
  if (level >= 7) return 'Rastreador';
  if (level >= 5) return 'Aventureiro';
  if (level >= 3) return 'Iniciado';
  return 'Novato';
}

// ── API calls ──

function isConfigured() {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

/**
 * Award XP for an action. Returns { xp, newTotal, newLevel, leveledUp, badge }
 */
export async function awardXP(userId, action, capsuleId = null) {
  const xp = XP_RULES[action];
  if (!xp || !userId || !isConfigured()) return null;

  try {
    const { data, error } = await supabase.rpc('award_xp', {
      p_user_id: userId,
      p_action: action,
      p_xp: xp,
      p_capsule_id: capsuleId,
    });

    if (error) {
      console.warn('[XPortl XP] Award failed:', error.message);
      return null;
    }

    const row = data?.[0] || data;
    const result = {
      xp,
      action,
      newTotal: row?.new_total ?? 0,
      newLevel: row?.new_level ?? 1,
      leveledUp: row?.leveled_up ?? false,
    };

    // Check level badges
    if (result.leveledUp) {
      const lvl = result.newLevel;
      if (lvl >= 5) await tryGrantBadge(userId, 'level_5');
      if (lvl >= 10) await tryGrantBadge(userId, 'level_10');
      if (lvl >= 25) await tryGrantBadge(userId, 'level_25');
      if (lvl >= 50) await tryGrantBadge(userId, 'level_50');
    }

    return result;
  } catch (err) {
    console.error('[XPortl XP] Error:', err);
    return null;
  }
}

/**
 * Update daily streak. Returns new streak count.
 */
export async function updateStreak(userId) {
  if (!userId || !isConfigured()) return 0;

  try {
    const { data, error } = await supabase.rpc('update_streak', { p_user_id: userId });
    if (error) return 0;

    const streak = data ?? 0;

    // Streak badges + XP
    if (streak === 3) { await tryGrantBadge(userId, 'streak_3'); await awardXP(userId, 'streak_3d'); }
    if (streak === 7) { await tryGrantBadge(userId, 'streak_7'); await awardXP(userId, 'streak_7d'); }
    if (streak === 30) { await tryGrantBadge(userId, 'streak_30'); await awardXP(userId, 'streak_30d'); }

    return streak;
  } catch (_) {
    return 0;
  }
}

/**
 * Try to grant a badge (idempotent — skips if already has it).
 * Returns true if newly granted.
 */
export async function tryGrantBadge(userId, badgeId) {
  if (!userId || !isConfigured()) return false;

  try {
    const { data } = await supabase.rpc('grant_badge', {
      p_user_id: userId,
      p_badge_id: badgeId,
    });
    return data === true;
  } catch (_) {
    return false;
  }
}

/**
 * Get leaderboard (top 50).
 */
export async function getLeaderboard(limit = 50) {
  if (!isConfigured()) return [];

  const { data, error } = await supabase.rpc('get_leaderboard', { p_limit: limit });
  if (error) return [];
  return data || [];
}

/**
 * Get user's XP history (last 50 events).
 */
export async function getXPHistory(userId, limit = 50) {
  if (!userId || !isConfigured()) return [];

  const { data } = await supabase
    .from('xp_events')
    .select('action, xp_amount, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data || [];
}

import { isViewed } from '../services/viewedCapsules';
import { getRarity } from '../services/capsules';

/**
 * Return capsules the user can meaningfully hunt right now.
 *
 * Filters out:
 *   - pings (not real capsules)
 *   - capsules created by the user
 *   - capsules already opened in the last 30 days
 *   - capsules with no distance info
 *   - capsules beyond maxDistance (default 500m)
 *
 * Sorts by: rarity (rare first) → distance (close first).
 */
const RARITY_WEIGHT = { mythic: 4, legendary: 3, rare: 2, common: 1 };

export function getHuntableCapsules(capsules, currentUserId, maxDistance = 500) {
  if (!Array.isArray(capsules)) return [];
  return capsules
    .filter((c) => {
      if (!c || c.content?.type === 'ping') return false;
      if (c.distance_meters === undefined || c.distance_meters === null) return false;
      if (c.distance_meters > maxDistance) return false;
      if (currentUserId && c.created_by === currentUserId) return false;
      if (isViewed(c.id)) return false;
      return true;
    })
    .sort((a, b) => {
      const ra = RARITY_WEIGHT[getRarity(a).key] || 1;
      const rb = RARITY_WEIGHT[getRarity(b).key] || 1;
      if (rb !== ra) return rb - ra;
      return a.distance_meters - b.distance_meters;
    });
}

/**
 * Compass bearing A → B (0-360°, 0=North, 90=East).
 */
export function getBearing(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function bearingToCardinal(deg) {
  const dirs = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(deg / 45) % 8];
}

import { haversineDistance } from './capsules';

const CLUSTER_RADIUS = 5; // meters
const CLUSTER_MIN_SIZE = 3;

/**
 * Cluster capsules that are within CLUSTER_RADIUS of each other.
 * Returns { singles: [...], vortexes: [{ centroid, capsules }] }
 */
export function clusterCapsules(capsules) {
  if (capsules.length < CLUSTER_MIN_SIZE) {
    return { singles: capsules, vortexes: [] };
  }

  const assigned = new Set();
  const clusters = [];

  // Greedy clustering: for each unassigned capsule, find all neighbors within radius
  for (let i = 0; i < capsules.length; i++) {
    if (assigned.has(i)) continue;

    const group = [i];
    assigned.add(i);

    for (let j = i + 1; j < capsules.length; j++) {
      if (assigned.has(j)) continue;

      // Check distance to any member of the group
      const isNear = group.some((gi) => {
        const a = capsules[gi];
        const b = capsules[j];
        return haversineDistance(a.lat, a.lng, b.lat, b.lng) <= CLUSTER_RADIUS;
      });

      if (isNear) {
        group.push(j);
        assigned.add(j);
      }
    }

    clusters.push(group);
  }

  const singles = [];
  const vortexes = [];

  for (const group of clusters) {
    const items = group.map((i) => capsules[i]);

    if (items.length >= CLUSTER_MIN_SIZE) {
      // Compute centroid
      const lat = items.reduce((s, c) => s + c.lat, 0) / items.length;
      const lng = items.reduce((s, c) => s + c.lng, 0) / items.length;

      vortexes.push({
        id: `vortex_${items.map((c) => c.id).sort().join('_').slice(0, 32)}`,
        lat,
        lng,
        capsules: items,
        count: items.length,
      });
    } else {
      singles.push(...items);
    }
  }

  return { singles, vortexes };
}

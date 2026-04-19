import { useState, useEffect, useRef, useCallback } from 'react';
import { haversineDistance } from '../services/capsules';

// ── Config ──
const HIGH_SPEED_MS = 7;             // ~25 km/h → auto-pause (driving/biking)
const MAX_HUNT_DURATION = 5 * 60_000;// 5 min cap (no-progress safety)
const LOST_DISTANCE = 200;           // >200m from target = lost the trail
const LOST_GRACE_MS = 60_000;        // 60s buffer before declaring lost
const ARRIVED_RADIUS = 3;            // ≤3m → hand off to LockOn
const LOW_BATTERY = 0.20;            // 20%
const NIGHT_START = 22;              // 22h → softer sonar
const NIGHT_END = 7;

/**
 * Manages the "hunt" state: user actively pursuing ONE capsule.
 *
 * States:
 *   idle         → no target selected, sonar off
 *   hunting      → active guidance, sonar on, HUD visible
 *   paused       → auto-paused (high speed, app backgrounded, etc.)
 *   arrived      → target within 3m, hand off to LockOn
 */
export function useHuntMode({ capsules, userLat, userLng, currentUserId: _currentUserId }) {
  const [targetId, setTargetId] = useState(null);
  const [paused, setPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState(null);
  const [arrivedAt, setArrivedAt] = useState(null); // capsuleId when arrived
  const [battery, setBattery] = useState(1);
  const [isNight, setIsNight] = useState(false);

  // Derived target object (lookup in current capsule list)
  const target = targetId ? capsules?.find((c) => c.id === targetId) : null;

  // Speed tracking (EMA on position deltas)
  const lastPosRef = useRef(null);
  const speedRef = useRef(0);
  const [speedDisplay, setSpeedDisplay] = useState(0);

  // Lost-trail tracker (remembers when distance first exceeded LOST_DISTANCE)
  const lostSinceRef = useRef(null);
  // No-progress tracker
  const startedAtRef = useRef(null);
  const minDistRef = useRef(Infinity);
  const lastProgressAtRef = useRef(null);

  // ── Speed calculation from GPS deltas ──
  useEffect(() => {
    if (userLat == null || userLng == null) return;
    const now = Date.now();
    const prev = lastPosRef.current;
    if (prev) {
      const dt = (now - prev.t) / 1000;
      if (dt > 0.3 && dt < 30) {
        const d = haversineDistance(prev.lat, prev.lng, userLat, userLng);
        const s = d / dt;
        speedRef.current = speedRef.current * 0.7 + s * 0.3;
        setSpeedDisplay(speedRef.current);
      }
    }
    lastPosRef.current = { lat: userLat, lng: userLng, t: now };
  }, [userLat, userLng]);

  // ── Battery awareness ──
  useEffect(() => {
    if (!('getBattery' in navigator)) return;
    let battRef = null;
    const sync = (b) => setBattery(b.level ?? 1);
    navigator.getBattery().then((b) => {
      battRef = b;
      sync(b);
      b.addEventListener('levelchange', () => sync(b));
    }).catch(() => {});
    return () => { if (battRef) battRef.removeEventListener?.('levelchange', sync); };
  }, []);

  // ── Night mode check (runs every 5min) ──
  useEffect(() => {
    const check = () => {
      const h = new Date().getHours();
      setIsNight(h >= NIGHT_START || h < NIGHT_END);
    };
    check();
    const id = setInterval(check, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  // ── App backgrounded → pause ──
  useEffect(() => {
    if (!targetId) return;
    const onVis = () => {
      if (document.hidden) {
        setPaused(true);
        setPauseReason('background');
      } else if (pauseReason === 'background') {
        setPaused(false);
        setPauseReason(null);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [targetId, pauseReason]);

  // ── High-speed → auto-pause ──
  useEffect(() => {
    if (!targetId) return;
    if (speedRef.current > HIGH_SPEED_MS && !paused) {
      setPaused(true);
      setPauseReason('speed');
    } else if (paused && pauseReason === 'speed' && speedRef.current < HIGH_SPEED_MS * 0.6) {
      setPaused(false);
      setPauseReason(null);
    }
  }, [speedDisplay, targetId, paused, pauseReason]);

  // ── Arrived / lost / no-progress checks ──
  useEffect(() => {
    if (!targetId || !target || userLat == null || userLng == null) return;
    const now = Date.now();
    const dist = haversineDistance(userLat, userLng, target.lat, target.lng);

    // Arrived → hand-off
    if (dist <= ARRIVED_RADIUS && !arrivedAt) {
      setArrivedAt(targetId);
      return;
    }

    // Progress tracking
    if (dist < minDistRef.current) {
      minDistRef.current = dist;
      lastProgressAtRef.current = now;
    }

    // Lost trail: >LOST_DISTANCE for LOST_GRACE_MS continuously
    if (dist > LOST_DISTANCE) {
      if (lostSinceRef.current == null) lostSinceRef.current = now;
      if (now - lostSinceRef.current > LOST_GRACE_MS) {
        stopHunt('lost');
        return;
      }
    } else {
      lostSinceRef.current = null;
    }

    // No-progress for 5min → auto-stop
    if (startedAtRef.current && now - (lastProgressAtRef.current || startedAtRef.current) > MAX_HUNT_DURATION) {
      stopHunt('stale');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, target?.id, userLat, userLng, arrivedAt]);

  // ── Start / stop ──
  const startHunt = useCallback((capsuleId) => {
    if (!capsuleId) return;
    setTargetId(capsuleId);
    setPaused(false);
    setPauseReason(null);
    setArrivedAt(null);
    startedAtRef.current = Date.now();
    lastProgressAtRef.current = Date.now();
    minDistRef.current = Infinity;
    lostSinceRef.current = null;
    if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
  }, []);

  const stopHunt = useCallback((reason = 'user') => {
    setTargetId(null);
    setPaused(false);
    setPauseReason(null);
    setArrivedAt(null);
    startedAtRef.current = null;
    lastProgressAtRef.current = null;
    minDistRef.current = Infinity;
    lostSinceRef.current = null;
    if (reason === 'user' && navigator.vibrate) navigator.vibrate(15);
  }, []);

  // Clear target when it disappears from capsule list (moderated, deleted)
  useEffect(() => {
    if (targetId && capsules && !capsules.some((c) => c.id === targetId)) {
      stopHunt('gone');
    }
  }, [targetId, capsules, stopHunt]);

  // Current distance to target (derived)
  const distanceToTarget = (target && userLat != null && userLng != null)
    ? haversineDistance(userLat, userLng, target.lat, target.lng)
    : null;

  return {
    // state
    target,
    targetId,
    paused,
    pauseReason,
    arrivedAt,
    distanceToTarget,
    speed: speedDisplay,
    lowBattery: battery < LOW_BATTERY,
    isNight,
    // actions
    startHunt,
    stopHunt,
    clearArrived: () => setArrivedAt(null),
  };
}

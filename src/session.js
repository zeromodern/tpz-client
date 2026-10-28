/**
 * session.js — Anonymous first-party identity, sessionization, and visibility dwell tracking.
 */

export const VISITOR_KEY = 'tpz_vid';
export const SESSION_KEY = 'tpz_session';
export const PREV_PATH_KEY = 'tpz_prev_path';
export const SESSION_IDLE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Generate an opaque, random, URL-safe ID with no PII.
 */
export function generateRandomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Get or create the anonymous first-party visitor token.
 * Never fingerprints; stored strictly in localStorage.
 */
export function getOrCreateVisitorId(storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
  if (!storage) return generateRandomId();
  try {
    let vid = storage.getItem(VISITOR_KEY);
    if (!vid || typeof vid !== 'string' || vid.length < 8) {
      vid = generateRandomId();
      storage.setItem(VISITOR_KEY, vid);
    }
    return vid;
  } catch {
    return generateRandomId();
  }
}

/**
 * Manages the current browser session, tracking inactivity and landing UTMs.
 */
export function getOrCreateSession(storage = (typeof window !== 'undefined' ? window.sessionStorage : null)) {
  const now = Date.now();
  if (!storage) {
    return { id: generateRandomId(), ts: now, isNew: true };
  }

  try {
    const raw = storage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.id === 'string' && typeof parsed.ts === 'number') {
        if (now - parsed.ts <= SESSION_IDLE_MS) {
          parsed.ts = now;
          storage.setItem(SESSION_KEY, JSON.stringify(parsed));
          return { id: parsed.id, ts: now, isNew: false, utm: parsed.utm || null };
        }
      }
    }

    // New session
    const id = generateRandomId();
    const landingUtm = parseLandingUtm();
    const session = { id, ts: now, utm: landingUtm };
    storage.setItem(SESSION_KEY, JSON.stringify(session));
    return { id, ts: now, isNew: true, utm: landingUtm };
  } catch {
    return { id: generateRandomId(), ts: now, isNew: true, utm: null };
  }
}

/**
 * Reads standard UTM campaign parameters from the current URL query string.
 */
export function parseLandingUtm(search = (typeof window !== 'undefined' ? window.location.search : '')) {
  if (!search || typeof search !== 'string') return null;
  try {
    const params = new URLSearchParams(search);
    const utm = {};
    let found = false;
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
      const val = params.get(key);
      if (val) {
        utm[key] = val.slice(0, 100);
        found = true;
      }
    }
    return found ? utm : null;
  } catch {
    return null;
  }
}

/**
 * Tracks previous internal route across client-side SPA navigations.
 */
export function resolveNavigationHistory(
  currentPath,
  storage = (typeof window !== 'undefined' ? window.sessionStorage : null),
  externalReferrer = (typeof document !== 'undefined' ? document.referrer : '')
) {
  let prevPath = '';
  if (storage) {
    try {
      const last = storage.getItem(PREV_PATH_KEY);
      if (last && last !== currentPath) {
        prevPath = last;
      }
      storage.setItem(PREV_PATH_KEY, currentPath);
    } catch {
      // ignore private storage quota
    }
  }

  if (!prevPath && externalReferrer) {
    try {
      const refUrl = new URL(externalReferrer);
      const isInternal = typeof window !== 'undefined' && refUrl.host === window.location.host;
      if (isInternal) {
        prevPath = `${refUrl.pathname}${refUrl.search}`;
      } else {
        prevPath = `external:${refUrl.host}`;
      }
    } catch {
      prevPath = 'external:unknown';
    }
  }

  return prevPath || 'direct';
}

/**
 * Visibility-aware dwell time accumulator. Only advances when tab is visible.
 */
export class ActiveDwellClock {
  constructor() {
    this.activeMs = 0;
    this.lastVisibleTs = (typeof document !== 'undefined' && document.visibilityState === 'visible') ? Date.now() : 0;
    this.milestonesFired = new Set();
  }

  onVisibilityChange() {
    if (typeof document === 'undefined') return;
    const now = Date.now();
    if (document.visibilityState === 'visible') {
      this.lastVisibleTs = now;
    } else {
      if (this.lastVisibleTs > 0) {
        this.activeMs += Math.max(0, now - this.lastVisibleTs);
        this.lastVisibleTs = 0;
      }
    }
  }

  getElapsedMs() {
    let current = this.activeMs;
    if (typeof document !== 'undefined' && document.visibilityState === 'visible' && this.lastVisibleTs > 0) {
      current += Math.max(0, Date.now() - this.lastVisibleTs);
    }
    return current;
  }

  checkMilestone(thresholdMs) {
    if (this.milestonesFired.has(thresholdMs)) return false;
    if (this.getElapsedMs() >= thresholdMs) {
      this.milestonesFired.add(thresholdMs);
      return true;
    }
    return false;
  }

  reset() {
    this.activeMs = 0;
    this.lastVisibleTs = (typeof document !== 'undefined' && document.visibilityState === 'visible') ? Date.now() : 0;
    this.milestonesFired.clear();
  }
}

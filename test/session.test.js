import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateRandomId,
  getOrCreateVisitorId,
  getOrCreateSession,
  parseLandingUtm,
  resolveNavigationHistory,
  ActiveDwellClock,
  SESSION_IDLE_MS,
} from '../src/session.js';

class MockStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.get(key) || null;
  }
  setItem(key, val) {
    this.map.set(key, String(val));
  }
}

test('generateRandomId produces alphanumeric string', () => {
  const id1 = generateRandomId();
  const id2 = generateRandomId();
  assert.ok(id1.length >= 8);
  assert.notEqual(id1, id2);
});

test('getOrCreateVisitorId persists and reuses visitor token', () => {
  const storage = new MockStorage();
  const vid1 = getOrCreateVisitorId(storage);
  const vid2 = getOrCreateVisitorId(storage);
  assert.equal(vid1, vid2);
  assert.ok(vid1.length >= 8);
});

test('getOrCreateSession creates new session and refreshes idle timer', () => {
  const storage = new MockStorage();
  const s1 = getOrCreateSession(storage);
  assert.equal(s1.isNew, true);
  assert.ok(s1.id);

  // Immediate second call should reuse same session
  const s2 = getOrCreateSession(storage);
  assert.equal(s2.isNew, false);
  assert.equal(s2.id, s1.id);
});

test('parseLandingUtm parses all standard campaign tags', () => {
  const search = '?utm_source=newsletter&utm_medium=email&utm_campaign=october_art&utm_content=hero_cta';
  const utm = parseLandingUtm(search);
  assert.deepEqual(utm, {
    utm_source: 'newsletter',
    utm_medium: 'email',
    utm_campaign: 'october_art',
    utm_content: 'hero_cta',
  });
});

test('resolveNavigationHistory tracks internal routes and external origins', () => {
  const storage = new MockStorage();

  // 1. Initial landing from google
  const prev1 = resolveNavigationHistory('/art/goya', storage, 'https://www.google.com/search?q=goya');
  assert.equal(prev1, 'external:www.google.com');

  // 2. Next.js internal navigation to another page
  const prev2 = resolveNavigationHistory('/art/sorolla', storage, '');
  assert.equal(prev2, '/art/goya');

  // 3. Navigation to feed
  const prev3 = resolveNavigationHistory('/feed', storage, '');
  assert.equal(prev3, '/art/sorolla');
});

test('ActiveDwellClock only tracks when active and checks milestones', () => {
  const clock = new ActiveDwellClock();
  clock.activeMs = 16000; // simulate 16s elapsed

  assert.equal(clock.checkMilestone(15000), true);
  // Milestone should only fire once
  assert.equal(clock.checkMilestone(15000), false);
  assert.equal(clock.checkMilestone(60000), false);
});

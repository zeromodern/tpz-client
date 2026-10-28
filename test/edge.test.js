import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isBotUserAgent,
  classifyDeviceType,
  classifyBrowser,
  handleTpzEdgeRequest,
} from '../src/edge.js';

test('isBotUserAgent flags crawlers and bots accurately', () => {
  assert.equal(isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true);
  assert.equal(isBotUserAgent('Applebot/0.1'), true);
  assert.equal(isBotUserAgent('facebookexternalhit/1.1'), true);
  assert.equal(isBotUserAgent('curl/8.5.0'), true);
  assert.equal(isBotUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'), false);
  assert.equal(isBotUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'), false);
});

test('classifyDeviceType detects mobile, tablet, and desktop', () => {
  assert.equal(classifyDeviceType('Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X)'), 'tablet');
  assert.equal(classifyDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'mobile');
  assert.equal(classifyDeviceType('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0'), 'desktop');
});

test('classifyBrowser categorizes standard browser engines', () => {
  assert.equal(classifyBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0'), 'chrome');
  assert.equal(classifyBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X) Version/17.0 Safari/605.1.15'), 'safari');
  assert.equal(classifyBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'), 'firefox');
  assert.equal(classifyBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/120.0.0.0'), 'edge');
});

test('handleTpzEdgeRequest drops privacy opt-outs with 204', async () => {
  const req = new Request('https://publicark.com/api/tpz', {
    method: 'POST',
    headers: { 'DNT': '1', 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: [{ eventType: 'pageview' }] }),
  });
  const res = await handleTpzEdgeRequest(req, {});
  assert.equal(res.status, 204);
});

test('handleTpzEdgeRequest enriches and writes data points to Analytics Engine', async () => {
  const writtenPoints = [];
  const mockAE = {
    writeDataPoint: (point) => writtenPoints.push(point),
  };

  const req = new Request('https://publicark.com/api/tpz', {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'CF-IPCountry': 'US',
      'CF-RegionCode': 'CA',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      events: [
        {
          siteId: 'publicark.com',
          eventType: 'pageview',
          visitorId: 'vid123',
          path: '/art/goya/men-reading',
          prevPath: 'external:google.com',
          target: '',
          trigger: '',
          entityType: 'artwork',
          entityId: 'Q3292190',
          customLabel: 'Men Reading',
          dwellMs: 25000,
          numericValue: 0,
        },
      ],
    }),
  });

  const res = await handleTpzEdgeRequest(req, { TELEMETRY_AE: mockAE });
  assert.equal(res.status, 204);
  assert.equal(writtenPoints.length, 1);

  const p = writtenPoints[0];
  assert.equal(p.blobs[0], 'publicark.com');         // blob1: site_id
  assert.equal(p.blobs[1], 'pageview');               // blob2: event_type
  assert.equal(p.blobs[2], 'vid123');                 // blob3: first_party_id
  assert.equal(p.blobs[3], '/art/goya/men-reading');  // blob4: path
  assert.equal(p.blobs[4], 'external:google.com');    // blob5: prev_path
  assert.equal(p.blobs[7], 'artwork');                // blob8: entity_type
  assert.equal(p.blobs[8], 'Q3292190');               // blob9: entity_id
  assert.equal(p.blobs[9], 'US');                     // blob10: country
  assert.equal(p.blobs[10], 'CA');                    // blob11: region
  assert.equal(p.blobs[11], 'desktop');               // blob12: device_type
  assert.equal(p.blobs[12], 'chrome');                // blob13: browser
  assert.equal(p.doubles[0], 25000);                  // double1: dwell_ms
  assert.equal(p.indexes[0], 'publicark.com');        // index1: site_id
});

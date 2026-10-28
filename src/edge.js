/**
 * edge.js — Universal first-party Cloudflare Pages / Worker ingest adapter for POST /api/tpz.
 */

export const KNOWN_BOT_TOKENS = [
  'bot', 'crawl', 'spider', 'slurp', 'mediapartners', 'feed', 'headless',
  'lighthouse', 'pagefind', 'semrush', 'ahrefs', 'applebot', 'bingbot',
  'googlebot', 'yandex', 'baidu', 'facebookexternalhit', 'pinterest', 'curl',
  'wget', 'python-requests', 'go-http-client', 'postman'
];

export function isBotUserAgent(ua) {
  if (!ua || typeof ua !== 'string') return false;
  const lower = ua.toLowerCase();
  return KNOWN_BOT_TOKENS.some((token) => lower.includes(token));
}

export function classifyDeviceType(ua) {
  if (!ua || typeof ua !== 'string') return 'desktop';
  const lower = ua.toLowerCase();
  if (lower.includes('tablet') || lower.includes('ipad')) return 'tablet';
  if (lower.includes('mobile') || lower.includes('iphone') || lower.includes('android')) return 'mobile';
  return 'desktop';
}

export function classifyBrowser(ua) {
  if (!ua || typeof ua !== 'string') return 'other';
  const lower = ua.toLowerCase();
  if (lower.includes('edg/')) return 'edge';
  if (lower.includes('opr/') || lower.includes('opera/')) return 'opera';
  if (lower.includes('samsungbrowser')) return 'samsung';
  if (lower.includes('chrome')) return 'chrome';
  if (lower.includes('safari') && !lower.includes('chrome')) return 'safari';
  if (lower.includes('firefox')) return 'firefox';
  return 'other';
}

/**
 * Universal edge request handler for Cloudflare Workers / Pages Functions.
 *
 * @param {Request} request
 * @param {{ TELEMETRY_AE?: any, ENGAGEMENT_AE?: any, metricsDataset?: any }} env
 * @returns {Promise<Response>}
 */
export async function handleTpzEdgeRequest(request, env = {}) {
  // CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // DNT / GPC Privacy Gate
  const dnt = request.headers.get('DNT');
  const gpc = request.headers.get('Sec-GPC');
  if (dnt === '1' || gpc === '1') {
    return new Response(null, { status: 204 });
  }

  // Bot Gate
  const ua = request.headers.get('User-Agent') || '';
  if (isBotUserAgent(ua)) {
    return new Response(null, { status: 204 });
  }

  // Parse payload (accepts application/json or text/plain from sendBeacon)
  let body = null;
  try {
    const raw = await request.text();
    if (!raw || raw.length > 64 * 1024) {
      return new Response('Payload Too Large', { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return new Response('Bad Request: Invalid JSON', { status: 400 });
  }

  const events = Array.isArray(body?.events) ? body.events : (body ? [body] : []);
  if (events.length === 0) {
    return new Response(null, { status: 204 });
  }

  // Edge Analytics Engine binding
  const ae = env.TELEMETRY_AE || env.ENGAGEMENT_AE || env.metricsDataset;
  if (!ae || typeof ae.writeDataPoint !== 'function') {
    // If running in development without AE binding, gracefully return 204
    return new Response(null, { status: 204 });
  }

  // Server-side enriched metadata
  const country = request.headers.get('CF-IPCountry') || 'XX';
  const region = request.headers.get('CF-RegionCode') || '';
  const deviceType = classifyDeviceType(ua);
  const browser = classifyBrowser(ua);

  for (const ev of events.slice(0, 50)) {
    const siteId = String(ev.siteId || 'unknown').slice(0, 50);
    const eventType = String(ev.eventType || 'unknown').slice(0, 50);

    const dataPoint = {
      blobs: [
        siteId,                                      // blob1:  site_id
        eventType,                                   // blob2:  event_type
        String(ev.visitorId || '').slice(0, 50),     // blob3:  first_party_id
        String(ev.path || '').slice(0, 200),         // blob4:  path
        String(ev.prevPath || '').slice(0, 200),     // blob5:  prev_path
        String(ev.target || '').slice(0, 200),       // blob6:  target
        String(ev.trigger || '').slice(0, 100),      // blob7:  trigger
        String(ev.entityType || '').slice(0, 50),    // blob8:  entity_type
        String(ev.entityId || '').slice(0, 100),     // blob9:  entity_id
        country,                                     // blob10: country
        region,                                      // blob11: region
        deviceType,                                  // blob12: device_type
        browser,                                     // blob13: browser
        String(ev.utm?.utm_source || '').slice(0, 50),    // blob14: utm_source
        String(ev.utm?.utm_campaign || '').slice(0, 50),  // blob15: utm_campaign
        String(ev.customLabel || '').slice(0, 200),  // blob16: custom_label
      ],
      doubles: [
        typeof ev.dwellMs === 'number' ? ev.dwellMs : 0,          // double1: dwell_ms
        typeof ev.numericValue === 'number' ? ev.numericValue : 0, // double2: numeric_value
        1,                                                         // double3: count
      ],
      indexes: [
        siteId.slice(0, 96),                                      // index1:  site_id
      ],
    };

    try {
      ae.writeDataPoint(dataPoint);
    } catch {
      // ignore single drop
    }
  }

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  });
}

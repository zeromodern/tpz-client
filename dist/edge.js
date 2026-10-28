// src/edge.js
var KNOWN_BOT_TOKENS = [
  "bot",
  "crawl",
  "spider",
  "slurp",
  "mediapartners",
  "feed",
  "headless",
  "lighthouse",
  "pagefind",
  "semrush",
  "ahrefs",
  "applebot",
  "bingbot",
  "googlebot",
  "yandex",
  "baidu",
  "facebookexternalhit",
  "pinterest",
  "curl",
  "wget",
  "python-requests",
  "go-http-client",
  "postman"
];
function isBotUserAgent(ua) {
  if (!ua || typeof ua !== "string")
    return false;
  const lower = ua.toLowerCase();
  return KNOWN_BOT_TOKENS.some((token) => lower.includes(token));
}
function classifyDeviceType(ua) {
  if (!ua || typeof ua !== "string")
    return "desktop";
  const lower = ua.toLowerCase();
  if (lower.includes("tablet") || lower.includes("ipad"))
    return "tablet";
  if (lower.includes("mobile") || lower.includes("iphone") || lower.includes("android"))
    return "mobile";
  return "desktop";
}
function classifyBrowser(ua) {
  if (!ua || typeof ua !== "string")
    return "other";
  const lower = ua.toLowerCase();
  if (lower.includes("edg/"))
    return "edge";
  if (lower.includes("opr/") || lower.includes("opera/"))
    return "opera";
  if (lower.includes("samsungbrowser"))
    return "samsung";
  if (lower.includes("chrome"))
    return "chrome";
  if (lower.includes("safari") && !lower.includes("chrome"))
    return "safari";
  if (lower.includes("firefox"))
    return "firefox";
  return "other";
}
async function handleTpzEdgeRequest(request, env = {}) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const dnt = request.headers.get("DNT");
  const gpc = request.headers.get("Sec-GPC");
  if (dnt === "1" || gpc === "1") {
    return new Response(null, { status: 204 });
  }
  const ua = request.headers.get("User-Agent") || "";
  if (isBotUserAgent(ua)) {
    return new Response(null, { status: 204 });
  }
  let body = null;
  try {
    const raw = await request.text();
    if (!raw || raw.length > 64 * 1024) {
      return new Response("Payload Too Large", { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad Request: Invalid JSON", { status: 400 });
  }
  const events = Array.isArray(body?.events) ? body.events : body ? [body] : [];
  if (events.length === 0) {
    return new Response(null, { status: 204 });
  }
  const ae = env.TELEMETRY_AE || env.ENGAGEMENT_AE || env.metricsDataset;
  if (!ae || typeof ae.writeDataPoint !== "function") {
    return new Response(null, { status: 204 });
  }
  const country = request.headers.get("CF-IPCountry") || "XX";
  const region = request.headers.get("CF-RegionCode") || "";
  const deviceType = classifyDeviceType(ua);
  const browser = classifyBrowser(ua);
  for (const ev of events.slice(0, 50)) {
    const siteId = String(ev.siteId || "unknown").slice(0, 50);
    const eventType = String(ev.eventType || "unknown").slice(0, 50);
    const dataPoint = {
      blobs: [
        siteId,
        eventType,
        String(ev.visitorId || "").slice(0, 50),
        String(ev.path || "").slice(0, 200),
        String(ev.prevPath || "").slice(0, 200),
        String(ev.target || "").slice(0, 200),
        String(ev.trigger || "").slice(0, 100),
        String(ev.entityType || "").slice(0, 50),
        String(ev.entityId || "").slice(0, 100),
        country,
        region,
        deviceType,
        browser,
        String(ev.utm?.utm_source || "").slice(0, 50),
        String(ev.utm?.utm_campaign || "").slice(0, 50),
        String(ev.customLabel || "").slice(0, 200)
      ],
      doubles: [
        typeof ev.dwellMs === "number" ? ev.dwellMs : 0,
        typeof ev.numericValue === "number" ? ev.numericValue : 0,
        1
      ],
      indexes: [
        siteId.slice(0, 96)
      ]
    };
    try {
      ae.writeDataPoint(dataPoint);
    } catch {}
  }
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*"
    }
  });
}
export {
  KNOWN_BOT_TOKENS,
  classifyBrowser,
  classifyDeviceType,
  handleTpzEdgeRequest,
  isBotUserAgent
};

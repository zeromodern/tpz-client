# @0mod/tpz

**TPZ Analytics (`tpz.js`)** is a standardized, privacy-first, adblock-resilient telemetry client with declarative HTML triggers and an edge-native Cloudflare Workers Analytics Engine backend.

---

## Features

- **Adblock Immune:** Designed to run 100% first-party. Bundle it directly into your app (ESM) or host it on your own domain, sending hits to your same-origin edge endpoint (`POST /api/tpz`).
- **Zero-Boilerplate Declarative Triggers:** Use HTML data attributes (`data-tpz-*`) to track clicks, outbound exits, file downloads, return-to-feed navigations, and element visibility without writing JavaScript in components.
- **Outbound & Exit Tracking:** Automatically detects when visitors click external links and logs destination domains.
- **Active Dwell Time:** Tab visibility-aware timer records active engagement milestones (15s, 60s, 3m, 10m) while automatically pausing on background tabs.
- **SPA Navigation History:** Hooks into `history.pushState` and `popstate` to record internal `prev_path` transitions across client-side routes.
- **Media Site Content Taxonomy:** Standards-aligned entity, category, creator, and action-layer classification.
- **Lightweight:** Zero dependencies, ~11KB uncompressed, ~3KB gzipped.

---

## 1. Quick Start

### Option A: Install via ESM (Recommended for Next.js / Astro / Vite)

```javascript
import { tpz } from '@0mod/tpz';

// Initialize in root layout or client app entry
tpz.init({
  siteId: 'publicark.com',
  endpoint: '/api/tpz',    // First-party same-origin endpoint
  autoPageview: true,      // Auto-hooks SPA route changes
  autoOutbound: true,      // Auto-captures external link clicks
  autoDwell: true,         // Auto-fires active dwell milestones (15s, 60s, 3m)
});
```

### Option B: Standalone Script Tag (HTML / Static Sites)

```html
<script 
  defer 
  src="/tpz.min.js" 
  data-site="0mod.com" 
  data-endpoint="/api/tpz"
  data-auto-outbound="true"
></script>
```

---

## 2. Declarative HTML Data Triggers

Add HTML data attributes to your DOM elements. The global delegated listener captures them automatically:

```html
<!-- 1. Custom Button Event with Metadata -->
<button 
  data-tpz-event="tool_executed" 
  data-tpz-prop-tool="jpeg-to-heic"
  data-tpz-prop-batch="true"
>
  Convert Images
</button>

<!-- 2. Outbound Authority Exit Link -->
<a href="https://museodelprado.es" data-tpz-outbound="museum_archive">
  View in Prado Collection
</a>

<!-- 3. Asset & File Downloads -->
<a href="/master.jpg" data-tpz-download="master_gigapixel">
  Download High-Res Master
</a>

<!-- 4. Return to Feed / Back Navigation -->
<button data-tpz-back="floating_pill">
  Back to Feed
</button>

<!-- 5. Viewport Section Dwell (Fires once after dwelling >= 1.0s in viewport) -->
<section id="curatorial-dossier" data-tpz-section="curatorial_dossier">
  <h2>Archival Provenance</h2>
</section>
```

---

## 3. JavaScript API (`window.tpz`)

When running in browser environments, the singleton instance is bound to `window.tpz`:

```javascript
// Track custom event with arbitrary properties
window.tpz.track('viewer_zoom', {
  scale: 4.5,
  trigger: 'pinch',
  entityType: 'artwork',
  entityId: 'men-reading-Q3292190',
});

// Manual SPA pageview transition
window.tpz.pageview({
  path: '/art/francisco-goya/men-reading-Q3292190',
  prevPath: '/feed',
  entityType: 'artwork',
  entityId: 'Q3292190',
  title: 'Men Reading — Francisco Goya',
});

// Force flush before immediate navigation
await window.tpz.flush();
```

---

## 4. Server-Side Edge Route (`/api/tpz`)

Drop the universal edge handler into your Cloudflare Worker or Pages Function:

```javascript
// Cloudflare Pages Function (functions/api/tpz.js)
// Or Next.js App Router route (src/app/api/tpz/route.js)
import { handleTpzEdgeRequest } from '@0mod/tpz/edge';

export async function POST(request, env) {
  return handleTpzEdgeRequest(request, env);
}

export async function OPTIONS(request, env) {
  return handleTpzEdgeRequest(request, env);
}
```

The edge handler automatically:
1. Rejects crawlers, scrapers, and bot User-Agents.
2. Respects DNT (Do Not Track) and GPC (Global Privacy Control) headers.
3. Derives Geo (`CF-IPCountry`, `CF-RegionCode`) and client form-factor (`desktop`, `mobile`, `tablet`) server-side.
4. Writes formatted 16-blob data points directly to Cloudflare Workers Analytics Engine (`env.TELEMETRY_AE` or `env.ENGAGEMENT_AE`).

---

## 5. Development & Testing

```bash
# Run unit tests
bun test
# or node --test test/*.test.js

# Build ESM, Edge, and browser bundles
bun run build
```

---

## License

MIT © 0mod / Topazly

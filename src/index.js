/**
 * index.js — Primary entry point for @0mod/tpz telemetry SDK.
 */

import { TpzClient } from './client.js';

// Singleton instance
export const tpz = new TpzClient();

export { TpzClient } from './client.js';
export {
  getOrCreateVisitorId,
  getOrCreateSession,
  resolveNavigationHistory,
  ActiveDwellClock,
} from './session.js';
export {
  initDelegatedClickListener,
  initSectionObserver,
  hookSpaNavigation,
} from './dom.js';
export { TransportQueue } from './transport.js';

// Browser global binding
if (typeof window !== 'undefined') {
  window.tpz = tpz;

  // Auto-init via script tag data attributes if present
  const currentScript = document.currentScript;
  if (currentScript && currentScript.hasAttribute('data-site')) {
    const siteId = currentScript.getAttribute('data-site');
    const endpoint = currentScript.getAttribute('data-endpoint') || '/api/tpz';
    const autoOutbound = currentScript.getAttribute('data-auto-outbound') !== 'false';
    const autoDwell = currentScript.getAttribute('data-auto-dwell') !== 'false';
    const autoPageview = currentScript.getAttribute('data-auto-pageview') !== 'false';

    tpz.init({
      siteId,
      endpoint,
      autoOutbound,
      autoDwell,
      autoPageview,
    });
  }
}

export default tpz;

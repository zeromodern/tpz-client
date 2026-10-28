/**
 * dom.js — Declarative data-tpz-* attribute parser, delegated event listeners, and IntersectionObserver.
 */

/**
 * Extracts arbitrary data-tpz-prop-* attributes from an element into a plain key-value object.
 */
export function extractPropsFromDataset(element) {
  const props = {};
  if (!element || !element.attributes) return props;

  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    if (attr.name.startsWith('data-tpz-prop-')) {
      const key = attr.name.slice('data-tpz-prop-'.length);
      const val = attr.value;
      // Auto-cast booleans and numbers
      if (val === 'true') props[key] = true;
      else if (val === 'false') props[key] = false;
      else if (!isNaN(Number(val)) && val.trim() !== '') props[key] = Number(val);
      else props[key] = val;
    }
  }
  return props;
}

/**
 * Traverses up the DOM tree to find an element with a specific data attribute.
 */
export function findClosestWithAttr(target, attrName) {
  let curr = target;
  while (curr && (typeof document === 'undefined' || curr !== document) && curr.nodeType === 1) {
    if (curr.hasAttribute(attrName)) return curr;
    curr = curr.parentElement;
  }
  return null;
}

/**
 * Initializes global click delegation for declarative tracking.
 */
export function initDelegatedClickListener(tpzInstance, options = {}) {
  if (typeof document === 'undefined') return () => {};

  const { autoOutbound = true } = options;

  const handleClick = (e) => {
    const target = e.target;
    if (!target) return;

    // 1. Explicit data-tpz-event
    const eventEl = findClosestWithAttr(target, 'data-tpz-event');
    if (eventEl) {
      const eventName = eventEl.getAttribute('data-tpz-event');
      const props = extractPropsFromDataset(eventEl);
      tpzInstance.track(eventName, props);
      return;
    }

    // 2. Declarative back / return button
    const backEl = findClosestWithAttr(target, 'data-tpz-back');
    if (backEl) {
      const trigger = backEl.getAttribute('data-tpz-back') || 'button';
      const props = extractPropsFromDataset(backEl);
      tpzInstance.track('return_to_feed_click', { trigger, ...props });
      return;
    }

    // 3. Declarative asset / file download
    const dlEl = findClosestWithAttr(target, 'data-tpz-download');
    if (dlEl) {
      const assetType = dlEl.getAttribute('data-tpz-download') || 'asset';
      const targetUrl = dlEl.getAttribute('href') || dlEl.getAttribute('data-tpz-url') || '';
      const props = extractPropsFromDataset(dlEl);
      tpzInstance.track('file_download', { assetType, target: targetUrl, ...props });
      return;
    }

    // 4. Outbound links: either explicit data-tpz-outbound or auto-detected external <a>
    const linkEl = findClosestWithAttr(target, 'href');
    if (linkEl && linkEl.tagName === 'A') {
      const href = linkEl.getAttribute('href');
      const hasOutboundFlag = linkEl.hasAttribute('data-tpz-outbound');

      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        try {
          const url = new URL(href);
          const isExternal = url.host !== window.location.host;

          if (isExternal && (autoOutbound || hasOutboundFlag)) {
            const label = linkEl.getAttribute('data-tpz-outbound') || 'outbound';
            const props = extractPropsFromDataset(linkEl);
            tpzInstance.track('outbound_click', {
              target: url.host,
              destUrl: href,
              trigger: label,
              ...props
            });
          }
        } catch {
          // ignore unparseable URL
        }
      }
    }
  };

  document.addEventListener('click', handleClick, { capture: true, passive: true });
  return () => document.removeEventListener('click', handleClick, { capture: true });
}

/**
 * Initializes IntersectionObserver for declarative [data-tpz-section] elements.
 * Emits 'section_seen' once the section dwells in the viewport for >= 1.0s.
 */
export function initSectionObserver(tpzInstance) {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return () => {};

  const activeTimers = new Map();
  const seenSections = new Set();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target;
        const sectionId = el.getAttribute('data-tpz-section') || el.id;
        if (!sectionId || seenSections.has(sectionId)) continue;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
          if (!activeTimers.has(el)) {
            const timer = setTimeout(() => {
              if (!seenSections.has(sectionId)) {
                seenSections.add(sectionId);
                const props = extractPropsFromDataset(el);
                tpzInstance.track('section_seen', { trigger: sectionId, ...props });
                observer.unobserve(el);
              }
            }, 1000);
            activeTimers.set(el, timer);
          }
        } else {
          if (activeTimers.has(el)) {
            clearTimeout(activeTimers.get(el));
            activeTimers.delete(el);
          }
        }
      }
    },
    { threshold: [0.25] }
  );

  const observeAll = () => {
    const elements = document.querySelectorAll('[data-tpz-section]');
    for (const el of elements) {
      const sectionId = el.getAttribute('data-tpz-section') || el.id;
      if (!seenSections.has(sectionId)) {
        observer.observe(el);
      }
    }
  };

  // Initial scan
  observeAll();

  // Watch for dynamic elements
  let mutObserver = null;
  if ('MutationObserver' in window) {
    mutObserver = new MutationObserver(() => observeAll());
    mutObserver.observe(document.body, { childList: true, subtree: true });
  }

  return () => {
    observer.disconnect();
    if (mutObserver) mutObserver.disconnect();
    for (const timer of activeTimers.values()) clearTimeout(timer);
    activeTimers.clear();
  };
}

/**
 * Hooks SPA route changes via History API (pushState, replaceState) and popstate.
 */
export function hookSpaNavigation(onNavigate) {
  if (typeof window === 'undefined') return () => {};

  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;

  history.pushState = function (...args) {
    origPushState.apply(this, args);
    onNavigate();
  };

  history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    onNavigate();
  };

  window.addEventListener('popstate', onNavigate);

  return () => {
    history.pushState = origPushState;
    history.replaceState = origReplaceState;
    window.removeEventListener('popstate', onNavigate);
  };
}

// src/session.js
var VISITOR_KEY = "tpz_vid";
var SESSION_KEY = "tpz_session";
var PREV_PATH_KEY = "tpz_prev_path";
var SESSION_IDLE_MS = 30 * 60 * 1000;
function generateRandomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
function getOrCreateVisitorId(storage = typeof window !== "undefined" ? window.localStorage : null) {
  if (!storage)
    return generateRandomId();
  try {
    let vid = storage.getItem(VISITOR_KEY);
    if (!vid || typeof vid !== "string" || vid.length < 8) {
      vid = generateRandomId();
      storage.setItem(VISITOR_KEY, vid);
    }
    return vid;
  } catch {
    return generateRandomId();
  }
}
function getOrCreateSession(storage = typeof window !== "undefined" ? window.sessionStorage : null) {
  const now = Date.now();
  if (!storage) {
    return { id: generateRandomId(), ts: now, isNew: true };
  }
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.id === "string" && typeof parsed.ts === "number") {
        if (now - parsed.ts <= SESSION_IDLE_MS) {
          parsed.ts = now;
          storage.setItem(SESSION_KEY, JSON.stringify(parsed));
          return { id: parsed.id, ts: now, isNew: false, utm: parsed.utm || null };
        }
      }
    }
    const id = generateRandomId();
    const landingUtm = parseLandingUtm();
    const session = { id, ts: now, utm: landingUtm };
    storage.setItem(SESSION_KEY, JSON.stringify(session));
    return { id, ts: now, isNew: true, utm: landingUtm };
  } catch {
    return { id: generateRandomId(), ts: now, isNew: true, utm: null };
  }
}
function parseLandingUtm(search = typeof window !== "undefined" ? window.location.search : "") {
  if (!search || typeof search !== "string")
    return null;
  try {
    const params = new URLSearchParams(search);
    const utm = {};
    let found = false;
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
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
function resolveNavigationHistory(currentPath, storage = typeof window !== "undefined" ? window.sessionStorage : null, externalReferrer = typeof document !== "undefined" ? document.referrer : "") {
  let prevPath = "";
  if (storage) {
    try {
      const last = storage.getItem(PREV_PATH_KEY);
      if (last && last !== currentPath) {
        prevPath = last;
      }
      storage.setItem(PREV_PATH_KEY, currentPath);
    } catch {}
  }
  if (!prevPath && externalReferrer) {
    try {
      const refUrl = new URL(externalReferrer);
      const isInternal = typeof window !== "undefined" && refUrl.host === window.location.host;
      if (isInternal) {
        prevPath = `${refUrl.pathname}${refUrl.search}`;
      } else {
        prevPath = `external:${refUrl.host}`;
      }
    } catch {
      prevPath = "external:unknown";
    }
  }
  return prevPath || "direct";
}

class ActiveDwellClock {
  constructor() {
    this.activeMs = 0;
    this.lastVisibleTs = typeof document !== "undefined" && document.visibilityState === "visible" ? Date.now() : 0;
    this.milestonesFired = new Set;
  }
  onVisibilityChange() {
    if (typeof document === "undefined")
      return;
    const now = Date.now();
    if (document.visibilityState === "visible") {
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
    if (typeof document !== "undefined" && document.visibilityState === "visible" && this.lastVisibleTs > 0) {
      current += Math.max(0, Date.now() - this.lastVisibleTs);
    }
    return current;
  }
  checkMilestone(thresholdMs) {
    if (this.milestonesFired.has(thresholdMs))
      return false;
    if (this.getElapsedMs() >= thresholdMs) {
      this.milestonesFired.add(thresholdMs);
      return true;
    }
    return false;
  }
  reset() {
    this.activeMs = 0;
    this.lastVisibleTs = typeof document !== "undefined" && document.visibilityState === "visible" ? Date.now() : 0;
    this.milestonesFired.clear();
  }
}

// src/dom.js
function extractPropsFromDataset(element) {
  const props = {};
  if (!element || !element.attributes)
    return props;
  for (let i = 0;i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    if (attr.name.startsWith("data-tpz-prop-")) {
      const key = attr.name.slice("data-tpz-prop-".length);
      const val = attr.value;
      if (val === "true")
        props[key] = true;
      else if (val === "false")
        props[key] = false;
      else if (!isNaN(Number(val)) && val.trim() !== "")
        props[key] = Number(val);
      else
        props[key] = val;
    }
  }
  return props;
}
function findClosestWithAttr(target, attrName) {
  let curr = target;
  while (curr && (typeof document === "undefined" || curr !== document) && curr.nodeType === 1) {
    if (curr.hasAttribute(attrName))
      return curr;
    curr = curr.parentElement;
  }
  return null;
}
function initDelegatedClickListener(tpzInstance, options = {}) {
  if (typeof document === "undefined")
    return () => {};
  const { autoOutbound = true } = options;
  const handleClick = (e) => {
    const target = e.target;
    if (!target)
      return;
    const eventEl = findClosestWithAttr(target, "data-tpz-event");
    if (eventEl) {
      const eventName = eventEl.getAttribute("data-tpz-event");
      const props = extractPropsFromDataset(eventEl);
      tpzInstance.track(eventName, props);
      return;
    }
    const backEl = findClosestWithAttr(target, "data-tpz-back");
    if (backEl) {
      const trigger = backEl.getAttribute("data-tpz-back") || "button";
      const props = extractPropsFromDataset(backEl);
      tpzInstance.track("return_to_feed_click", { trigger, ...props });
      return;
    }
    const dlEl = findClosestWithAttr(target, "data-tpz-download");
    if (dlEl) {
      const assetType = dlEl.getAttribute("data-tpz-download") || "asset";
      const targetUrl = dlEl.getAttribute("href") || dlEl.getAttribute("data-tpz-url") || "";
      const props = extractPropsFromDataset(dlEl);
      tpzInstance.track("file_download", { assetType, target: targetUrl, ...props });
      return;
    }
    const linkEl = findClosestWithAttr(target, "href");
    if (linkEl && linkEl.tagName === "A") {
      const href = linkEl.getAttribute("href");
      const hasOutboundFlag = linkEl.hasAttribute("data-tpz-outbound");
      if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
        try {
          const url = new URL(href);
          const isExternal = url.host !== window.location.host;
          if (isExternal && (autoOutbound || hasOutboundFlag)) {
            const label = linkEl.getAttribute("data-tpz-outbound") || "outbound";
            const props = extractPropsFromDataset(linkEl);
            tpzInstance.track("outbound_click", {
              target: url.host,
              destUrl: href,
              trigger: label,
              ...props
            });
          }
        } catch {}
      }
    }
  };
  document.addEventListener("click", handleClick, { capture: true, passive: true });
  return () => document.removeEventListener("click", handleClick, { capture: true });
}
function initSectionObserver(tpzInstance) {
  if (typeof window === "undefined" || !("IntersectionObserver" in window))
    return () => {};
  const activeTimers = new Map;
  const seenSections = new Set;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target;
      const sectionId = el.getAttribute("data-tpz-section") || el.id;
      if (!sectionId || seenSections.has(sectionId))
        continue;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
        if (!activeTimers.has(el)) {
          const timer = setTimeout(() => {
            if (!seenSections.has(sectionId)) {
              seenSections.add(sectionId);
              const props = extractPropsFromDataset(el);
              tpzInstance.track("section_seen", { trigger: sectionId, ...props });
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
  }, { threshold: [0.25] });
  const observeAll = () => {
    const elements = document.querySelectorAll("[data-tpz-section]");
    for (const el of elements) {
      const sectionId = el.getAttribute("data-tpz-section") || el.id;
      if (!seenSections.has(sectionId)) {
        observer.observe(el);
      }
    }
  };
  observeAll();
  let mutObserver = null;
  if ("MutationObserver" in window) {
    mutObserver = new MutationObserver(() => observeAll());
    mutObserver.observe(document.body, { childList: true, subtree: true });
  }
  return () => {
    observer.disconnect();
    if (mutObserver)
      mutObserver.disconnect();
    for (const timer of activeTimers.values())
      clearTimeout(timer);
    activeTimers.clear();
  };
}
function hookSpaNavigation(onNavigate) {
  if (typeof window === "undefined")
    return () => {};
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;
  history.pushState = function(...args) {
    origPushState.apply(this, args);
    onNavigate();
  };
  history.replaceState = function(...args) {
    origReplaceState.apply(this, args);
    onNavigate();
  };
  window.addEventListener("popstate", onNavigate);
  return () => {
    history.pushState = origPushState;
    history.replaceState = origReplaceState;
    window.removeEventListener("popstate", onNavigate);
  };
}

// src/transport.js
var DEFAULT_FLUSH_INTERVAL_MS = 15000;
var DEFAULT_FLUSH_THRESHOLD = 20;

class TransportQueue {
  constructor(endpoint, options = {}) {
    this.endpoint = endpoint || "/api/tpz";
    this.flushIntervalMs = options.flushIntervalMs || DEFAULT_FLUSH_INTERVAL_MS;
    this.flushThreshold = options.flushThreshold || DEFAULT_FLUSH_THRESHOLD;
    this.queue = [];
    this.timer = null;
    this.isFlushing = false;
    this.debug = Boolean(options.debug);
    this.startTimer();
  }
  enqueue(event) {
    if (this._isPrivacyOptedOut())
      return;
    this.queue.push(event);
    if (this.queue.length >= this.flushThreshold) {
      this.flush();
    }
  }
  startTimer() {
    if (typeof window === "undefined")
      return;
    this.stopTimer();
    this.timer = setInterval(() => {
      if (this.queue.length > 0) {
        this.flush();
      }
    }, this.flushIntervalMs);
  }
  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  async flush() {
    if (this.queue.length === 0 || this.isFlushing)
      return;
    if (typeof navigator !== "undefined" && !navigator.onLine)
      return;
    this.isFlushing = true;
    const batch = this.queue.splice(0, 50);
    try {
      if (this.debug) {
        console.debug(`[TPZ] Flushing ${batch.length} event(s) to ${this.endpoint}`, batch);
      }
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: batch }),
        keepalive: true
      });
      if (!res.ok && res.status >= 500) {
        this.queue.unshift(...batch);
      }
    } catch (err) {
      if (this.debug)
        console.warn("[TPZ] Flush failed, restoring queue:", err);
      this.queue.unshift(...batch);
    } finally {
      this.isFlushing = false;
    }
  }
  flushBeacon() {
    if (this.queue.length === 0)
      return;
    if (typeof navigator === "undefined" || !navigator.sendBeacon) {
      this.flush();
      return;
    }
    const batch = this.queue.splice(0, 50);
    try {
      const payload = JSON.stringify({ events: batch });
      const sent = navigator.sendBeacon(this.endpoint, payload);
      if (!sent && this.debug) {
        console.warn("[TPZ] sendBeacon failed to queue");
      }
    } catch (err) {
      if (this.debug)
        console.warn("[TPZ] sendBeacon error:", err);
    }
  }
  _isPrivacyOptedOut() {
    if (typeof navigator === "undefined")
      return false;
    return navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true;
  }
}

// src/client.js
var DWELL_MILESTONES = [15000, 60000, 180000, 600000];

class TpzClient {
  constructor() {
    this.siteId = "";
    this.endpoint = "/api/tpz";
    this.visitorId = "";
    this.session = null;
    this.currentPath = "";
    this.prevPath = "";
    this.transport = null;
    this.dwellClock = new ActiveDwellClock;
    this.dwellInterval = null;
    this.isInitialized = false;
    this.debug = false;
    this._unsubDom = [];
  }
  init(config = {}) {
    if (this.isInitialized)
      return;
    this.siteId = config.siteId || (typeof window !== "undefined" ? window.location.hostname : "unknown");
    this.endpoint = config.endpoint || "/api/tpz";
    this.debug = Boolean(config.debug);
    this.visitorId = getOrCreateVisitorId();
    this.session = getOrCreateSession();
    this.transport = new TransportQueue(this.endpoint, { debug: this.debug });
    this.currentPath = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/";
    this.prevPath = resolveNavigationHistory(this.currentPath);
    if (typeof document !== "undefined") {
      const handleVis = () => {
        this.dwellClock.onVisibilityChange();
        if (document.visibilityState === "hidden") {
          this.transport.flushBeacon();
        }
      };
      document.addEventListener("visibilitychange", handleVis);
      this._unsubDom.push(() => document.removeEventListener("visibilitychange", handleVis));
      const handleUnload = () => {
        this.dwellClock.onVisibilityChange();
        this.transport.flushBeacon();
      };
      window.addEventListener("pagehide", handleUnload);
      this._unsubDom.push(() => window.removeEventListener("pagehide", handleUnload));
      if (config.autoDwell !== false) {
        this.dwellInterval = setInterval(() => {
          this._checkDwellMilestones();
        }, 2500);
      }
    }
    if (typeof document !== "undefined") {
      const stopClicks = initDelegatedClickListener(this, {
        autoOutbound: config.autoOutbound !== false
      });
      const stopSections = initSectionObserver(this);
      this._unsubDom.push(stopClicks, stopSections);
      if (config.autoPageview !== false) {
        const stopSpa = hookSpaNavigation(() => {
          const newPath = `${window.location.pathname}${window.location.search}`;
          if (newPath !== this.currentPath) {
            this.pageview({ path: newPath });
          }
        });
        this._unsubDom.push(stopSpa);
      }
    }
    this.isInitialized = true;
    if (config.autoPageview !== false) {
      this.pageview({
        path: this.currentPath,
        prevPath: this.prevPath,
        entityType: config.entityType,
        entityId: config.entityId
      });
    }
    if (this.debug) {
      console.info(`[TPZ] Initialized for ${this.siteId} (visitor: ${this.visitorId})`);
    }
  }
  track(eventName, props = {}) {
    if (!this.isInitialized) {
      this.init();
    }
    const event = {
      siteId: this.siteId,
      eventType: eventName,
      visitorId: this.visitorId,
      sessionId: this.session?.id || "",
      path: props.path || this.currentPath,
      prevPath: props.prevPath || this.prevPath,
      target: props.target ? String(props.target).slice(0, 200) : "",
      trigger: props.trigger ? String(props.trigger).slice(0, 100) : "",
      entityType: props.entityType ? String(props.entityType).slice(0, 50) : "",
      entityId: props.entityId ? String(props.entityId).slice(0, 100) : "",
      customLabel: props.customLabel || props.label || "",
      dwellMs: typeof props.dwellMs === "number" ? props.dwellMs : this.dwellClock.getElapsedMs(),
      numericValue: typeof props.numericValue === "number" ? props.numericValue : typeof props.scale === "number" ? props.scale : typeof props.value === "number" ? props.value : 0,
      timestamp: Date.now(),
      utm: this.session?.utm || null
    };
    for (const [k, v] of Object.entries(props)) {
      if (["path", "prevPath", "target", "trigger", "entityType", "entityId", "customLabel", "label", "dwellMs", "numericValue", "scale", "value"].includes(k))
        continue;
      if (!event.customLabel && typeof v === "string") {
        event.customLabel = `${k}:${v}`.slice(0, 150);
      }
    }
    this.transport.enqueue(event);
  }
  pageview(opts = {}) {
    const nextPath = opts.path || (typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/");
    if (this.currentPath && nextPath !== this.currentPath) {
      this.prevPath = this.currentPath;
      this.currentPath = nextPath;
      resolveNavigationHistory(this.currentPath);
      this.dwellClock.reset();
    }
    this.track("pageview", {
      path: this.currentPath,
      prevPath: opts.prevPath || this.prevPath,
      entityType: opts.entityType || "",
      entityId: opts.entityId || "",
      customLabel: opts.title || (typeof document !== "undefined" ? document.title : "")
    });
  }
  _checkDwellMilestones() {
    for (const milestone of DWELL_MILESTONES) {
      if (this.dwellClock.checkMilestone(milestone)) {
        const label = milestone >= 60000 ? `${milestone / 60000}m` : `${milestone / 1000}s`;
        this.track(`dwell_${label}`, {
          dwellMs: milestone,
          trigger: `dwell_${label}`
        });
      }
    }
  }
  flush() {
    return this.transport ? this.transport.flush() : Promise.resolve();
  }
  destroy() {
    for (const unsub of this._unsubDom)
      unsub();
    this._unsubDom = [];
    if (this.dwellInterval)
      clearInterval(this.dwellInterval);
    if (this.transport)
      this.transport.stopTimer();
    this.isInitialized = false;
  }
}

// src/index.js
var tpz = new TpzClient;
if (typeof window !== "undefined") {
  window.tpz = tpz;
  const currentScript = document.currentScript;
  if (currentScript && currentScript.hasAttribute("data-site")) {
    const siteId = currentScript.getAttribute("data-site");
    const endpoint = currentScript.getAttribute("data-endpoint") || "/api/tpz";
    const autoOutbound = currentScript.getAttribute("data-auto-outbound") !== "false";
    const autoDwell = currentScript.getAttribute("data-auto-dwell") !== "false";
    const autoPageview = currentScript.getAttribute("data-auto-pageview") !== "false";
    tpz.init({
      siteId,
      endpoint,
      autoOutbound,
      autoDwell,
      autoPageview
    });
  }
}
var src_default = tpz;
export {
  ActiveDwellClock,
  TpzClient,
  TransportQueue,
  src_default as default,
  getOrCreateSession,
  getOrCreateVisitorId,
  hookSpaNavigation,
  initDelegatedClickListener,
  initSectionObserver,
  resolveNavigationHistory,
  tpz
};

/**
 * client.js — Central TpzClient runtime coordinator.
 */

import {
  getOrCreateVisitorId,
  getOrCreateSession,
  resolveNavigationHistory,
  ActiveDwellClock,
} from './session.js';
import {
  initDelegatedClickListener,
  initSectionObserver,
  hookSpaNavigation,
} from './dom.js';
import { TransportQueue } from './transport.js';

export const DWELL_MILESTONES = [15000, 60000, 180000, 600000]; // 15s, 60s, 3m, 10m

export class TpzClient {
  constructor() {
    this.siteId = '';
    this.endpoint = '/api/tpz';
    this.visitorId = '';
    this.session = null;
    this.currentPath = '';
    this.prevPath = '';
    this.transport = null;
    this.dwellClock = new ActiveDwellClock();
    this.dwellInterval = null;
    this.isInitialized = false;
    this.debug = false;

    this._unsubDom = [];
  }

  init(config = {}) {
    if (this.isInitialized) return;
    this.siteId = config.siteId || (typeof window !== 'undefined' ? window.location.hostname : 'unknown');
    this.endpoint = config.endpoint || '/api/tpz';
    this.debug = Boolean(config.debug);

    this.visitorId = getOrCreateVisitorId();
    this.session = getOrCreateSession();
    this.transport = new TransportQueue(this.endpoint, { debug: this.debug });

    this.currentPath = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/';
    this.prevPath = resolveNavigationHistory(this.currentPath);

    // Dwell clock & visibility listeners
    if (typeof document !== 'undefined') {
      const handleVis = () => {
        this.dwellClock.onVisibilityChange();
        if (document.visibilityState === 'hidden') {
          this.transport.flushBeacon();
        }
      };
      document.addEventListener('visibilitychange', handleVis);
      this._unsubDom.push(() => document.removeEventListener('visibilitychange', handleVis));

      const handleUnload = () => {
        this.dwellClock.onVisibilityChange();
        this.transport.flushBeacon();
      };
      window.addEventListener('pagehide', handleUnload);
      this._unsubDom.push(() => window.removeEventListener('pagehide', handleUnload));

      // Dwell milestone checking ticker (every 2.5s)
      if (config.autoDwell !== false) {
        this.dwellInterval = setInterval(() => {
          this._checkDwellMilestones();
        }, 2500);
      }
    }

    // Auto-instrument DOM declarative data-tpz-* attributes
    if (typeof document !== 'undefined') {
      const stopClicks = initDelegatedClickListener(this, {
        autoOutbound: config.autoOutbound !== false,
      });
      const stopSections = initSectionObserver(this);
      this._unsubDom.push(stopClicks, stopSections);

      // Auto-hook SPA navigation
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

    // Automatic initial pageview
    if (config.autoPageview !== false) {
      this.pageview({
        path: this.currentPath,
        prevPath: this.prevPath,
        entityType: config.entityType,
        entityId: config.entityId,
      });
    }

    if (this.debug) {
      console.info(`[TPZ] Initialized for ${this.siteId} (visitor: ${this.visitorId})`);
    }
  }

  /**
   * Tracks an event into the transport queue.
   */
  track(eventName, props = {}) {
    if (!this.isInitialized) {
      this.init();
    }

    const event = {
      siteId: this.siteId,
      eventType: eventName,
      visitorId: this.visitorId,
      sessionId: this.session?.id || '',
      path: props.path || this.currentPath,
      prevPath: props.prevPath || this.prevPath,
      target: props.target ? String(props.target).slice(0, 200) : '',
      trigger: props.trigger ? String(props.trigger).slice(0, 100) : '',
      entityType: props.entityType ? String(props.entityType).slice(0, 50) : '',
      entityId: props.entityId ? String(props.entityId).slice(0, 100) : '',
      customLabel: props.customLabel || props.label || '',
      dwellMs: typeof props.dwellMs === 'number' ? props.dwellMs : this.dwellClock.getElapsedMs(),
      numericValue: typeof props.numericValue === 'number' ? props.numericValue : (typeof props.scale === 'number' ? props.scale : (typeof props.value === 'number' ? props.value : 0)),
      timestamp: Date.now(),
      utm: this.session?.utm || null,
    };

    // Merge any extra custom props into trigger/label if needed
    for (const [k, v] of Object.entries(props)) {
      if (['path', 'prevPath', 'target', 'trigger', 'entityType', 'entityId', 'customLabel', 'label', 'dwellMs', 'numericValue', 'scale', 'value'].includes(k)) continue;
      if (!event.customLabel && typeof v === 'string') {
        event.customLabel = `${k}:${v}`.slice(0, 150);
      }
    }

    this.transport.enqueue(event);
  }

  /**
   * Handles SPA or manual pageview transition.
   */
  pageview(opts = {}) {
    const nextPath = opts.path || (typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/');
    if (this.currentPath && nextPath !== this.currentPath) {
      this.prevPath = this.currentPath;
      this.currentPath = nextPath;
      resolveNavigationHistory(this.currentPath);
      this.dwellClock.reset();
    }

    this.track('pageview', {
      path: this.currentPath,
      prevPath: opts.prevPath || this.prevPath,
      entityType: opts.entityType || '',
      entityId: opts.entityId || '',
      customLabel: opts.title || (typeof document !== 'undefined' ? document.title : ''),
    });
  }

  _checkDwellMilestones() {
    for (const milestone of DWELL_MILESTONES) {
      if (this.dwellClock.checkMilestone(milestone)) {
        const label = milestone >= 60000 ? `${milestone / 60000}m` : `${milestone / 1000}s`;
        this.track(`dwell_${label}`, {
          dwellMs: milestone,
          trigger: `dwell_${label}`,
        });
      }
    }
  }

  flush() {
    return this.transport ? this.transport.flush() : Promise.resolve();
  }

  destroy() {
    for (const unsub of this._unsubDom) unsub();
    this._unsubDom = [];
    if (this.dwellInterval) clearInterval(this.dwellInterval);
    if (this.transport) this.transport.stopTimer();
    this.isInitialized = false;
  }
}

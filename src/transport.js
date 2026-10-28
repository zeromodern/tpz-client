/**
 * transport.js — In-memory batching queue, sendBeacon unload flushing, and offline safety.
 */

export const DEFAULT_FLUSH_INTERVAL_MS = 15000;
export const DEFAULT_FLUSH_THRESHOLD = 20;

export class TransportQueue {
  constructor(endpoint, options = {}) {
    this.endpoint = endpoint || '/api/tpz';
    this.flushIntervalMs = options.flushIntervalMs || DEFAULT_FLUSH_INTERVAL_MS;
    this.flushThreshold = options.flushThreshold || DEFAULT_FLUSH_THRESHOLD;
    this.queue = [];
    this.timer = null;
    this.isFlushing = false;
    this.debug = Boolean(options.debug);

    this.startTimer();
  }

  enqueue(event) {
    if (this._isPrivacyOptedOut()) return;
    this.queue.push(event);

    if (this.queue.length >= this.flushThreshold) {
      this.flush();
    }
  }

  startTimer() {
    if (typeof window === 'undefined') return;
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
    if (this.queue.length === 0 || this.isFlushing) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    this.isFlushing = true;
    const batch = this.queue.splice(0, 50);

    try {
      if (this.debug) {
        console.debug(`[TPZ] Flushing ${batch.length} event(s) to ${this.endpoint}`, batch);
      }

      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });

      if (!res.ok && res.status >= 500) {
        // Re-queue on temporary server error
        this.queue.unshift(...batch);
      }
    } catch (err) {
      if (this.debug) console.warn('[TPZ] Flush failed, restoring queue:', err);
      // Re-queue on network error
      this.queue.unshift(...batch);
    } finally {
      this.isFlushing = false;
    }
  }

  flushBeacon() {
    if (this.queue.length === 0) return;
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) {
      this.flush();
      return;
    }

    const batch = this.queue.splice(0, 50);
    try {
      const payload = JSON.stringify({ events: batch });
      const sent = navigator.sendBeacon(this.endpoint, payload);
      if (!sent && this.debug) {
        console.warn('[TPZ] sendBeacon failed to queue');
      }
    } catch (err) {
      if (this.debug) console.warn('[TPZ] sendBeacon error:', err);
    }
  }

  _isPrivacyOptedOut() {
    if (typeof navigator === 'undefined') return false;
    return navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  }
}

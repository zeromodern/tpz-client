/**
 * TypeScript definitions for @0mod/tpz
 */

export interface TpzInitOptions {
  siteId?: string;
  endpoint?: string;
  autoPageview?: boolean;
  autoOutbound?: boolean;
  autoDwell?: boolean;
  debug?: boolean;
  entityType?: string;
  entityId?: string;
}

export interface TpzTrackProps {
  path?: string;
  prevPath?: string;
  target?: string;
  trigger?: string;
  entityType?: string;
  entityId?: string;
  customLabel?: string;
  label?: string;
  dwellMs?: number;
  numericValue?: number;
  scale?: number;
  value?: number;
  [key: string]: unknown;
}

export interface TpzPageviewOptions {
  path?: string;
  prevPath?: string;
  entityType?: string;
  entityId?: string;
  title?: string;
}

export class TpzClient {
  siteId: string;
  endpoint: string;
  visitorId: string;
  isInitialized: boolean;

  init(config?: TpzInitOptions): void;
  track(eventName: string, props?: TpzTrackProps): void;
  pageview(opts?: TpzPageviewOptions): void;
  flush(): Promise<void>;
  destroy(): void;
}

export const tpz: TpzClient;
export default tpz;

declare global {
  interface Window {
    tpz?: TpzClient;
  }
}

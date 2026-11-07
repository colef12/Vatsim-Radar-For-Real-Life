/**
 * Public runtime config. Nothing here is secret (CLAUDE.md C2).
 *
 * PROXY_URL: the deployed Cloudflare Worker from proxy/ (e.g. https://rwr-proxy.<subdomain>.workers.dev).
 * Empty = traffic disabled, the header shows "Traffic relay not connected".
 * A build-time override is possible with VITE_PROXY_URL.
 */
export const PROXY_URL: string =
  (import.meta.env.VITE_PROXY_URL as string | undefined) || 'https://rwr-proxy.coleferraro.workers.dev';

/** Poll interval for live traffic (CLAUDE.md §4: default 5 s, never below 2 s). */
export const TRAFFIC_POLL_MS = 5_000;

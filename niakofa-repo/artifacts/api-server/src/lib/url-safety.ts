/**
 * SSRF guard for server-side fetches of user-supplied URLs.
 *
 * Any time server code fetches a URL that a non-admin user controlled
 * (e.g. griot_stories.audio_url, which is a free-form `z.string().url()`
 * set at story creation), it must go through assertSafeExternalUrl() first.
 * Without this, a user could point the field at an internal service or the
 * cloud metadata endpoint and have our server fetch it on their behalf.
 *
 * Checks:
 *   - scheme must be https (no file:, http:, data:, gopher:, etc.)
 *   - hostname must not be a raw IP literal, localhost, or .local/.internal
 *   - every resolved IP (A + AAAA) must be public — blocks loopback,
 *     link-local, RFC1918 private ranges, CGNAT, and the 169.254.169.254 /
 *     fd00:ec2::254 cloud metadata addresses
 *   - redirects are not followed automatically; safeFetch() re-validates
 *     the redirect target before following it, up to a small hop limit
 */

import dns from "node:dns/promises";
import net from "node:net";

const MAX_REDIRECTS = 3;

function isDisallowedIp(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 0) return true; // "this network"
    return false;
  }
  if (type === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true; // loopback
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("::ffff:")) {
      // IPv4-mapped IPv6 — re-check the embedded v4 address
      const v4 = lower.split(":").pop() ?? "";
      return net.isIP(v4) === 4 ? isDisallowedIp(v4) : true;
    }
    return false;
  }
  return true; // not a recognizable IP — treat as unsafe
}

/**
 * Throws if `urlString` is unsafe to fetch server-side. Resolves DNS to
 * catch hostnames that merely point at a private/internal address.
 */
export async function assertSafeExternalUrl(urlString: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error(`invalid URL: ${urlString}`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`unsafe URL scheme "${url.protocol}" — only https is allowed`);
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error(`unsafe hostname: ${hostname}`);
  }
  if (net.isIP(hostname) && isDisallowedIp(hostname)) {
    throw new Error(`unsafe IP literal in URL: ${hostname}`);
  }

  let addresses: string[];
  try {
    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new Error(`could not resolve hostname: ${hostname}`);
  }
  if (addresses.length === 0) {
    throw new Error(`hostname resolved to no addresses: ${hostname}`);
  }
  if (addresses.some(isDisallowedIp)) {
    throw new Error(`hostname resolves to a disallowed internal address: ${hostname}`);
  }

  return url;
}

/**
 * fetch() wrapper that re-validates every redirect hop against
 * assertSafeExternalUrl() instead of letting undici follow it blindly —
 * otherwise a validated public URL could 302 to an internal address.
 */
export async function safeFetch(urlString: string, init?: RequestInit): Promise<Response> {
  let current = urlString;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeExternalUrl(current);
    const resp = await fetch(current, { ...init, redirect: "manual" });
    if (resp.status >= 300 && resp.status < 400 && resp.headers.has("location")) {
      const next = new URL(resp.headers.get("location")!, current).toString();
      current = next;
      continue;
    }
    return resp;
  }
  throw new Error("too many redirects while fetching URL");
}

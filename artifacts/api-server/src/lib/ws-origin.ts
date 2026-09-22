function normalizeOrigin(value: string): string | null {
  const candidate = value.includes("://") ? value : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export interface WsOriginConfig {
  allowedOrigin?: string;
  nodeEnv?: string;
  replitDevDomain?: string;
}

/**
 * Build the WebSocket origin policy once at startup.
 *
 * An unset ALLOWED_ORIGIN intentionally preserves the open local-development
 * behavior. When a deployment supplies ALLOWED_ORIGIN, development previews
 * get only the explicitly known Replit domain and loopback origins; production
 * remains limited to the configured list.
 */
export function buildWsOriginAllowlist(config: WsOriginConfig = {}): Set<string> | null {
  const raw = config.allowedOrigin ?? process.env["ALLOWED_ORIGIN"];
  if (!raw?.trim()) return null;

  const origins = new Set(
    raw
      .split(",")
      .map((value) => normalizeOrigin(value.trim()))
      .filter((value): value is string => value !== null),
  );

  if ((config.nodeEnv ?? process.env["NODE_ENV"]) === "development") {
    const replitDevDomain = config.replitDevDomain ?? process.env["REPLIT_DEV_DOMAIN"];
    if (replitDevDomain) {
      const origin = normalizeOrigin(replitDevDomain);
      if (origin) origins.add(origin);
    }
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  return origins;
}

export function isWsOriginAllowed(
  origin: string | undefined,
  allowlist: Set<string> | null,
  allowDevelopmentLoopback = false,
): boolean {
  if (!allowlist) return true;
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  if (allowlist.has(normalized ?? origin.replace(/\/$/, ""))) return true;
  if (!allowDevelopmentLoopback || !normalized) return false;

  try {
    const hostname = new URL(normalized).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}
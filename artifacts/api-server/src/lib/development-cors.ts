type DevelopmentCorsEnvironment = {
  NODE_ENV?: string;
  REPLIT_DEV_DOMAIN?: string;
  REPLIT_DOMAINS?: string;
};

/** Only this workspace's runtime-assigned previews, never all Replit tenants. */
export function isDevelopmentCorsOrigin(origin: string, env: DevelopmentCorsEnvironment = process.env): boolean {
  if (env.NODE_ENV === "production") return false;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) return false;
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return true;
    const previewDomains = [env.REPLIT_DEV_DOMAIN ?? "", ...(env.REPLIT_DOMAINS ?? "").split(",")]
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean);
    return url.protocol === "https:" && !url.port && previewDomains.includes(url.hostname);
  } catch {
    return false;
  }
}

import { Request, Response, NextFunction } from "express";

export interface LocationContext {
  city?: string;
  region?: string;
  country?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
}

export async function injectLocation(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const forwarded = req.headers["x-forwarded-for"];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]) ||
      req.socket.remoteAddress ||
      "";

    const isPrivate =
      ip.startsWith("127.") ||
      ip.startsWith("192.168.") ||
      ip.startsWith("10.") ||
      ip === "::1" ||
      ip === "";

    if (!isPrivate && ip) {
      const geo = await fetch(
        `http://ip-api.com/json/${ip}?fields=status,city,regionName,country,zip,lat,lon,timezone`
      )
        .then((r) => r.json())
        .catch(() => null);

      if (geo?.status === "success") {
        (req as any).locationContext = {
          city: geo.city,
          region: geo.regionName,
          country: geo.country,
          zip: geo.zip,
          lat: geo.lat,
          lon: geo.lon,
          timezone: geo.timezone,
        } as LocationContext;
      }
    }
  } catch {
    // Location is best-effort — never block the request
  }
  next();
}

export function buildLocationPrefix(loc?: LocationContext): string {
  if (!loc?.city) return "";
  const parts = [loc.city, loc.region, loc.country].filter(Boolean);
  return `[User location: ${parts.join(", ")}${loc.zip ? ` ${loc.zip}` : ""}. Timezone: ${loc.timezone || "unknown"}. Lat/Lon: ${loc.lat},${loc.lon}. Use this to give hyper-local, immediately actionable resources.]\n\n`;
}

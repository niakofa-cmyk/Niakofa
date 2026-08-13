import type { Request, Response, NextFunction } from "express";

export interface LocationContext {
  city?: string;
  county?: string;
  region?: string;
  country?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  /** True when city/county/state came from client GPS reverse geocode (more accurate than server IP) */
  fromClientGPS?: boolean;
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
      // ipwho.is supports HTTPS on the free tier (unlike ip-api.com which
      // requires a paid plan for TLS). Response shape differs slightly.
      const geo = await fetch(
        `https://ipwho.is/${ip}`
      )
        .then((r) => r.json())
        .catch(() => null);

      if (geo?.success === true) {
        // ipwho.is returns lat/lon as `latitude`/`longitude` and timezone as
        // an object `{ id, abbreviation, ... }`.
        const [lat, lon] = [geo.latitude, geo.longitude];
        req.locationContext = {
          city: geo.city,
          region: geo.region,
          country: geo.country,
          zip: geo.postal,
          lat: typeof lat === "number" ? lat : undefined,
          lon: typeof lon === "number" ? lon : undefined,
          timezone: typeof geo.timezone?.id === "string" ? geo.timezone.id : undefined,
        } as LocationContext;
      }
    }
  } catch {
    // Location is best-effort — never block the request
  }
  next();
}

export function buildLocationPrefix(loc?: LocationContext): string {
  if (!loc?.city && !loc?.county && !loc?.region) return "";
  const city = loc.city ?? loc.county ?? null;
  const county = loc.county && loc.county !== city ? loc.county : null;
  const accuracy = loc.fromClientGPS ? "GPS-precise" : "approximate (IP-based)";
  const parts = [city, county ? `${county} County` : null, loc.region, loc.country]
    .filter(Boolean)
    .join(", ");
  const coords = (loc.lat != null && loc.lon != null)
    ? ` Coordinates: ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}.` : "";
  return `[User location (${accuracy}): ${parts}${loc.zip ? ` ${loc.zip}` : ""}.${coords} Timezone: ${loc.timezone || "unknown"}. Give hyper-local, immediately actionable resources.]\n\n`;
}

export interface AppContext {
  userName?: string | null;
  accountType?: string | null;
  helperModeActive?: boolean;
  activeRequest?: {
    title: string;
    description: string | null;
    category: string;
    urgency: string;
    status: string;
    neighborhood: string | null;
    viewerRole: "requester" | "helper";
  } | null;
}

export const CATEGORY_LABELS: Record<string, string> = {
  groceries: "groceries",
  transportation: "a ride",
  errands: "errands",
  home_repair: "a home repair",
  medical: "medical help",
  emergency: "an emergency",
  other: "general help",
  stock_shelves: "shelf stocking",
  event_setup: "event setup",
  delivery_run: "a delivery",
  tech_support: "tech support",
  local_farm: "a farm or CSA pickup",
  food_pantry: "a food pantry run",
};

const STATUS_LABELS: Record<string, string> = {
  open: "still open, not yet claimed",
  claimed: "claimed by a helper, not yet started",
  en_route: "in progress \u2014 the helper is on the way",
  arrived: "in progress \u2014 the helper has arrived",
  completed: "completed",
  pay_it_forward_pending: "completed, with a pay-it-forward pledge still pending",
  cancelled: "cancelled",
  expired: "expired",
};

const URGENCY_LABELS: Record<string, string> = {
  low: "low urgency",
  medium: "medium urgency",
  high: "high urgency",
  emergency: "an emergency, top priority",
};

function humanize(label: Record<string, string>, value: string): string {
  return label[value] ?? value.replace(/_/g, " ");
}

export function buildAppContextPrefix(ctx?: AppContext): string {
  if (!ctx) return "";
  const lines: string[] = [];

  if (ctx.userName) lines.push(`Name: ${ctx.userName}`);
  if (ctx.accountType) lines.push(`Account type: ${ctx.accountType}`);
  if (ctx.helperModeActive) lines.push(`Currently browsing in helper mode (looking to help others, not seeking help).`);

  if (ctx.activeRequest) {
    const r = ctx.activeRequest;
    const loc = r.neighborhood ? ` near ${r.neighborhood}` : "";
    const framing =
      r.viewerRole === "requester"
        ? `This user has an open help request they posted${loc}`
        : `This user is the helper assigned to a job${loc}`;
    lines.push(
      `${framing}: "${r.title}" \u2014 ${humanize(CATEGORY_LABELS, r.category)}, ${humanize(URGENCY_LABELS, r.urgency)}, currently ${humanize(STATUS_LABELS, r.status)}.` +
      (r.description ? ` Details: ${r.description}` : "")
    );
  }

  if (lines.length === 0) return "";

  return `[Niakofa platform context for this user — weave this in naturally, do not recite it as a list:\n${lines.join("\n")}]\n\n`;
}

/**
 * Local development can use the browser-visible token for server-side Mapbox
 * calls when the optional server token is stale. Production prefers the
 * server-only token and never changes its existing selection order.
 */
export function getMapboxToken(): string {
  const serverToken = process.env["MAPBOX_TOKEN"]?.trim() ?? "";
  const publicToken = process.env["VITE_MAPBOX_TOKEN"]?.trim() ?? "";

  return process.env["NODE_ENV"] === "development"
    ? publicToken || serverToken
    : serverToken || publicToken;
}

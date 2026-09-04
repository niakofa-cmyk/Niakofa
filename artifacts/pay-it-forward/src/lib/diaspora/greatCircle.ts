export interface GeoPoint {
  lat: number;
  lng: number;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

/** Build a dateline-safe great-circle path for Mapbox globe rendering. */
export function greatCirclePath(start: GeoPoint, end: GeoPoint, steps = 32): [number, number][] {
  const count = Math.max(2, Math.min(96, Math.floor(steps)));
  const lat1 = toRadians(start.lat);
  const lon1 = toRadians(start.lng);
  const lat2 = toRadians(end.lat);
  const lon2 = toRadians(end.lng);

  const a = Math.cos(lat1) * Math.cos(lon1);
  const b = Math.cos(lat1) * Math.sin(lon1);
  const c = Math.sin(lat1);
  const d = Math.cos(lat2) * Math.cos(lon2);
  const e = Math.cos(lat2) * Math.sin(lon2);
  const f = Math.sin(lat2);
  const dot = Math.max(-1, Math.min(1, a * d + b * e + c * f));
  const omega = Math.acos(dot);

  if (omega < 1e-8) return [[start.lng, start.lat], [end.lng, end.lat]];

  const sinOmega = Math.sin(omega);
  const points: [number, number][] = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const p = Math.sin((1 - t) * omega) / sinOmega;
    const q = Math.sin(t * omega) / sinOmega;
    const x = p * a + q * d;
    const y = p * b + q * e;
    const z = p * c + q * f;
    points.push([toDegrees(Math.atan2(y, x)), toDegrees(Math.atan2(z, Math.hypot(x, y)))]);
  }

  return points;
}

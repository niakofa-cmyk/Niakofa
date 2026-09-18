/**
 * Parse the human-readable ETA returned by the navigation proxy.
 *
 * Mapbox commonly returns values such as "12 min", "1h 5min", or
 * "1 hour 5 minutes". Keep this tolerant of all of those forms because the
 * text is also shown directly in the UI.
 */
export function parseEtaSeconds(etaText: string): number {
  const hourMatch = etaText.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)(?=\s|\d|$)/i);
  const minuteMatch = etaText.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)(?=\s|$)/i);
  const hours = hourMatch ? Number.parseFloat(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number.parseFloat(minuteMatch[1]) : 0;
  const seconds = Math.round(hours * 3600 + minutes * 60);
  return Number.isFinite(seconds) ? seconds : 0;
}
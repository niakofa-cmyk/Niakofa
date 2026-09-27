const NO_PRIVATE_CONTACT = /(?:https?:\/\/|www\.|@|(?:\+?[\d][\d\s().-]{6,}\d)|\b(?:text|call|email|venmo|cash\s*app|zelle|whatsapp|telegram)\b)/i;
// Match house numbers with optional letter suffixes and streets with ordinal
// numbers as well as words (e.g. "12B Main Street", "123 5th Avenue").
const EXACT_STREET_ADDRESS = /\b\d{1,6}[A-Za-z]?\s+(?:(?:[A-Za-z][\w.'-]*|\d+(?:st|nd|rd|th)?)\s+){0,5}(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|court|ct|parkway|pkwy|highway|hwy|terrace|ter|place|pl|circle|cir|trail|trl|route|rt)\b/i;
const PRIVATE_RESIDENCE = /\b(?:my|your|their|our)\s+(?:house|home|apartment|residence|place)\b|\b(?:apartment|apt|unit|suite|ste|front|back)\s*(?:#?\s*[a-z0-9-]+)?\b|\b(?:front|back)\s+(?:door|porch|yard)\b|\bdriveway\b/i;

/**
 * All displayed Exchange text must avoid contact details and precise private
 * locations, even if the field is labeled as a title, note or time window.
 */
export function sanitizePublicPickupArea(value: string): boolean {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  return !NO_PRIVATE_CONTACT.test(normalized)
    && !EXACT_STREET_ADDRESS.test(normalized)
    && !PRIVATE_RESIDENCE.test(normalized);
}
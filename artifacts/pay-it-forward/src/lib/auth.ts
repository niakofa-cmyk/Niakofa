// BUG-4-M12 / REC-4-03: Tokens are stored in sessionStorage instead of
// localStorage. sessionStorage is cleared when the browser tab/session ends,
// limiting the exposure window for XSS-to-token-theft attacks (XSS on a
// third-party script like Mapbox or Stripe.js could still read it during the
// session, but the token cannot be harvested across sessions or by extensions).
//
// Full mitigation requires migrating to HttpOnly; Secure; SameSite=Strict
// cookies with CSRF token validation on the API server — that is the target
// architecture (REC-4-03). This sessionStorage change is the interim step.
const TOKEN_KEY = "niakofa_token";

export function getToken(): string | null {
  try {
    // Try sessionStorage first; fall back to localStorage for backwards compat
    // with existing logged-in users (they still have the token in localStorage).
    return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    // Remove any legacy localStorage copy on next login to clean up old data.
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

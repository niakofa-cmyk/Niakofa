import { safeStorage } from "./safeStorage";

const TOKEN_KEY = "niakofa_token";

export function getToken(): string | null {
  return safeStorage.local.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  safeStorage.local.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  safeStorage.local.removeItem(TOKEN_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

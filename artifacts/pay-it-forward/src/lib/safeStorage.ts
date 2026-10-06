/**
 * Browser storage can be unavailable in private browsing, embedded contexts,
 * or when the browser denies persistence. Keep that expected boundary in one
 * place and return an explicit fallback to callers.
 */
type StorageArea = "localStorage" | "sessionStorage";

function getStorage(area: StorageArea): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window[area];
  } catch {
    return null;
  }
}

function getItem(area: StorageArea, key: string): string | null {
  const storage = getStorage(area);
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function setItem(area: StorageArea, key: string, value: string): boolean {
  const storage = getStorage(area);
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeItem(area: StorageArea, key: string): boolean {
  const storage = getStorage(area);
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export const safeStorage = {
  local: {
    getItem: (key: string) => getItem("localStorage", key),
    setItem: (key: string, value: string) => setItem("localStorage", key, value),
    removeItem: (key: string) => removeItem("localStorage", key),
  },
  session: {
    getItem: (key: string) => getItem("sessionStorage", key),
    setItem: (key: string, value: string) => setItem("sessionStorage", key, value),
    removeItem: (key: string) => removeItem("sessionStorage", key),
  },
};

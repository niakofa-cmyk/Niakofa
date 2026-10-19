export const NIAKOFA_PRODUCTION_ORIGIN = "https://niakofa.com";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function containsSensitiveKey(value) {
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!isRecord(current) && !Array.isArray(current)) continue;
    for (const [key, nested] of Object.entries(current)) {
      if (/password|passwd|secret|reset.?code/i.test(key)) return true;
      if (nested && typeof nested === "object") pending.push(nested);
    }
  }
  return false;
}

function inspectUserEntry(entry) {
  if (typeof entry?.value !== "string") return false;
  try {
    const user = JSON.parse(entry.value);
    return isRecord(user) &&
      Number.isInteger(Number(user.id)) &&
      Number(user.id) > 0 &&
      !containsSensitiveKey(user);
  } catch {
    return false;
  }
}

/**
 * Validate serialized Playwright storage state without returning or logging
 * any part of the input. Results contain booleans and fixed diagnostics only.
 */
export function validateUserAStateJson(raw) {
  let state;
  let jsonValid = false;
  if (typeof raw === "string") {
    try {
      state = JSON.parse(raw);
      jsonValid = true;
    } catch {
      // Never forward parser errors: some runtimes include source fragments.
    }
  }

  const rootIsRecord = isRecord(state);
  const cookiesValid = rootIsRecord &&
    Array.isArray(state.cookies) &&
    state.cookies.every((cookie) =>
      isRecord(cookie) &&
      !/password|passwd|secret|reset.?code/i.test(String(cookie.name ?? "")),
    );
  const originsArrayValid = rootIsRecord &&
    Array.isArray(state.origins) &&
    state.origins.length > 0 &&
    state.origins.every((origin) =>
      isRecord(origin) &&
      typeof origin.origin === "string" &&
      Array.isArray(origin.localStorage) &&
      origin.localStorage.every((entry) =>
        isRecord(entry) &&
        typeof entry.name === "string" &&
        typeof entry.value === "string" &&
        !/password|passwd|secret/i.test(entry.name),
      ),
    );
  const storageStateValid = cookiesValid && originsArrayValid;

  const originValues = originsArrayValid ? state.origins.map((origin) => origin.origin) : [];
  const originRestricted = originsArrayValid &&
    originValues.every((origin) => origin === NIAKOFA_PRODUCTION_ORIGIN) &&
    new Set(originValues).size === originValues.length;

  const niaOrigin = originsArrayValid
    ? state.origins.find((origin) => origin.origin === NIAKOFA_PRODUCTION_ORIGIN)
    : undefined;
  const localStorage = niaOrigin?.localStorage ?? [];
  const tokenEntries = localStorage.filter((entry) => entry.name === "niakofa_token");
  const userEntries = localStorage.filter((entry) => entry.name === "niakofa_user");
  const authKeys = {
    niakofa_token: tokenEntries.length > 0,
    niakofa_user: userEntries.length > 0,
  };
  const authKeysChecked = jsonValid && originsArrayValid;
  const authEntriesValid = tokenEntries.length === 1 &&
    typeof tokenEntries[0]?.value === "string" &&
    tokenEntries[0].value.length > 0 &&
    tokenEntries[0].value.split(".").length === 4 &&
    userEntries.length === 1 &&
    inspectUserEntry(userEntries[0]);
  const authEntriesChecked = jsonValid && originsArrayValid;

  return {
    jsonValid,
    storageStateValid,
    originRestricted,
    authKeys,
    authKeysChecked,
    authEntriesValid,
    authEntriesChecked,
    valid: jsonValid &&
      storageStateValid &&
      originRestricted &&
      authKeys.niakofa_token &&
      authKeys.niakofa_user &&
      authEntriesValid,
  };
}

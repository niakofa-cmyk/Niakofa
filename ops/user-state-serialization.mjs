const DEFAULT_MAX_BYTES = 16 * 1024;

export function serializeStorageState(state, configuredMaxBytes = process.env.USER_A_STATE_MAX_BYTES) {
  let maxBytes = DEFAULT_MAX_BYTES;
  if (configuredMaxBytes !== undefined) {
    const rawLimit = String(configuredMaxBytes).trim();
    if (!/^[1-9]\d*$/.test(rawLimit)) {
      throw new Error("USER_A_STATE_MAX_BYTES must be a positive whole number.");
    }

    maxBytes = Number(rawLimit);
    if (!Number.isSafeInteger(maxBytes)) {
      throw new Error("USER_A_STATE_MAX_BYTES must be a positive whole number.");
    }
  }

  const serialized = JSON.stringify(state);
  if (typeof serialized !== "string") {
    throw new Error("storage state could not be serialized as JSON.");
  }

  const byteLength = Buffer.byteLength(serialized, "utf8");
  if (byteLength > maxBytes) {
    throw new Error(
      `generated storage state is ${byteLength} bytes; configured limit is ${maxBytes} bytes, so it was not written.`,
    );
  }

  return serialized;
}

export function serializeStorageStateJson(json, configuredMaxBytes = process.env.USER_A_STATE_MAX_BYTES) {
  if (typeof json !== "string") {
    throw new Error("storage state input must be a JSON string.");
  }

  let state;
  try {
    state = JSON.parse(json);
  } catch {
    throw new Error("storage state input is not valid JSON.");
  }

  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("storage state JSON must contain an object.");
  }

  return serializeStorageState(state, configuredMaxBytes);
}

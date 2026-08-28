import { isValidLiveKitUrl } from "./circleMediaConfig";

export type LiveKitConfigStatus = "ready" | "degraded";

export interface LiveKitConfigHealth {
  status: LiveKitConfigStatus;
  urlConfigured: boolean;
  secureWebSocket: boolean;
  apiKeyConfigured: boolean;
  apiSecretConfigured: boolean;
  detail: string;
}

export function inspectLiveKitConfig(env: NodeJS.ProcessEnv = process.env): LiveKitConfigHealth {
  const url = env.LIVEKIT_URL?.trim() ?? "";
  const apiKeyConfigured = Boolean(env.LIVEKIT_API_KEY?.trim());
  const apiSecretConfigured = Boolean(env.LIVEKIT_API_SECRET?.trim());
  const urlConfigured = Boolean(url);
  const secureWebSocket = /^wss:\/\//i.test(url);
  const validUrl = isValidLiveKitUrl(url, {
    allowLocalWs: env.NODE_ENV !== "production",
  });

  const ready = urlConfigured && validUrl && apiKeyConfigured && apiSecretConfigured &&
    (env.NODE_ENV !== "production" || secureWebSocket);

  return {
    status: ready ? "ready" : "degraded",
    urlConfigured,
    secureWebSocket,
    apiKeyConfigured,
    apiSecretConfigured,
    detail: ready
      ? "LiveKit endpoint and server credentials are configured"
      : "LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET must be configured; production requires wss://",
  };
}

/** Convert the browser-facing wss:// endpoint into the HTTPS host expected by the LiveKit server SDK. */
export function liveKitApiHost(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "wss:") url.protocol = "https:";
    else if (url.protocol === "ws:") url.protocol = "http:";
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

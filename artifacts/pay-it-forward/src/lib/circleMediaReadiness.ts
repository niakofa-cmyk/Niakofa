export type MediaDeviceKind = "microphone" | "camera";

export type MediaReadinessCode =
  | "secure_context_required"
  | "api_unavailable"
  | "permission_denied"
  | "device_not_found"
  | "device_busy"
  | "constraint_failed"
  | "connectivity_error"
  | "unknown";

export interface MediaReadiness {
  secureContext: boolean;
  mediaDevicesAvailable: boolean;
  hasMicrophone: boolean;
  hasCamera: boolean;
  microphonePermission: PermissionState | "unknown";
  cameraPermission: PermissionState | "unknown";
}

export interface MediaReadinessFailure {
  ok: false;
  device: MediaDeviceKind;
  code: MediaReadinessCode;
  message: string;
}

export interface MediaReadinessSuccess {
  ok: true;
  stream: MediaStream;
}

export type MediaAcquireResult = MediaReadinessSuccess | MediaReadinessFailure;

async function queryPermission(name: "microphone" | "camera"): Promise<PermissionState | "unknown"> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unknown";
    return (await navigator.permissions.query({ name } as PermissionDescriptor)).state;
  } catch {
    return "unknown";
  }
}

/**
 * Checks browser and hardware readiness without requesting permission.
 * Calling enumerateDevices and the Permissions API is safe on page load.
 */
export async function getCircleMediaReadiness(): Promise<MediaReadiness> {
  const secureContext = typeof window !== "undefined" && window.isSecureContext;
  const mediaDevicesAvailable =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.enumerateDevices === "function";

  if (!mediaDevicesAvailable) {
    return {
      secureContext,
      mediaDevicesAvailable: false,
      hasMicrophone: false,
      hasCamera: false,
      microphonePermission: "unknown",
      cameraPermission: "unknown",
    };
  }

  let devices: MediaDeviceInfo[] = [];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {
    // Some browsers expose mediaDevices but reject enumeration in restricted
    // embeds. Keep the API status truthful and let acquisition provide the
    // actionable error if the user continues.
  }

  return {
    secureContext,
    mediaDevicesAvailable,
    hasMicrophone: devices.some(d => d.kind === "audioinput"),
    hasCamera: devices.some(d => d.kind === "videoinput"),
    microphonePermission: await queryPermission("microphone"),
    cameraPermission: await queryPermission("camera"),
  };
}

/**
 * Shared classifier for both raw getUserMedia failures and transport publish
 * failures. In particular, an SFU/ICE/TURN failure is not a permission issue.
 */
export function classifyMediaError(error: unknown, device: MediaDeviceKind): MediaReadinessFailure {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return mapDomException(error, device);
  }

  const message = error instanceof Error ? error.message : "";
  if (/livekit|sfu|ice|turn|publish|connect|token/i.test(message)) {
    return {
      ok: false,
      device,
      code: "connectivity_error",
      message: `Your ${device} opened, but the live connection to the Spiral failed. Check your network and try again.`,
    };
  }

  return {
    ok: false,
    device,
    code: "unknown",
    message: `Niakofa could not access the ${device}. Check browser permissions and device availability.`,
  };
}

function mapDomException(error: DOMException, device: MediaDeviceKind): MediaReadinessFailure {
  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return {
      ok: false,
      device,
      code: "permission_denied",
      message: `Allow ${device} access for Niakofa in your browser/site settings, then try again.`,
    };
  }
  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return {
      ok: false,
      device,
      code: "device_not_found",
      message: `No ${device} was found. Connect or enable a ${device} and try again.`,
    };
  }
  if (error.name === "NotReadableError" || error.name === "TrackStartError") {
    return {
      ok: false,
      device,
      code: "device_busy",
      message: `The ${device} appears to be busy or unavailable. Close other apps/tabs using it and retry.`,
    };
  }
  if (error.name === "OverconstrainedError") {
    return {
      ok: false,
      device,
      code: "constraint_failed",
      message: `The selected ${device} does not support the requested settings.`,
    };
  }
  return {
    ok: false,
    device,
    code: "unknown",
    message: `Niakofa could not access the ${device}. Check browser permissions and device availability.`,
  };
}

/** Acquires only the requested device after non-prompting readiness checks. */
export async function acquireCircleDevice(device: MediaDeviceKind): Promise<MediaAcquireResult> {
  const readiness = await getCircleMediaReadiness();

  if (!readiness.secureContext) {
    return {
      ok: false,
      device,
      code: "secure_context_required",
      message: "Live camera/microphone access requires HTTPS (or localhost during development).",
    };
  }
  if (!readiness.mediaDevicesAvailable) {
    return {
      ok: false,
      device,
      code: "api_unavailable",
      message: "This browser does not expose the required media APIs.",
    };
  }
  if (device === "camera" && !readiness.hasCamera) {
    return {
      ok: false,
      device,
      code: "device_not_found",
      message: "No camera is available to this browser/device.",
    };
  }
  if (device === "microphone" && !readiness.hasMicrophone) {
    return {
      ok: false,
      device,
      code: "device_not_found",
      message: "No microphone is available to this browser/device.",
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      device === "camera"
        ? {
            video: {
              width: { ideal: 1280, max: 1280 },
              height: { ideal: 720, max: 720 },
              frameRate: { ideal: 30, max: 30 },
              facingMode: "user",
            },
            audio: false,
          }
        : {
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          },
    );
    return { ok: true, stream };
  } catch (error) {
    return typeof DOMException !== "undefined" && error instanceof DOMException
      ? mapDomException(error, device)
      : classifyMediaError(error, device);
  }
}
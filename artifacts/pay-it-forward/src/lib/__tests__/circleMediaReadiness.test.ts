import test from "node:test";
import assert from "node:assert/strict";
import {
  acquireCircleDevice,
  classifyMediaError,
  getCircleMediaReadiness,
} from "../circleMediaReadiness";

function withGlobals<T>(
  overrides: {
    isSecureContext?: boolean;
    mediaDevices?: any;
    permissionsQuery?: (desc: { name: string }) => Promise<{ state: string }>;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const g = globalThis as any;
  const previousWindow = Object.getOwnPropertyDescriptor(g, "window");
  const previousNavigator = Object.getOwnPropertyDescriptor(g, "navigator");
  Object.defineProperty(g, "window", {
    value: { isSecureContext: overrides.isSecureContext ?? true },
    configurable: true,
  });
  Object.defineProperty(g, "navigator", {
    value: {
      mediaDevices: overrides.mediaDevices,
      permissions: overrides.permissionsQuery ? { query: overrides.permissionsQuery } : undefined,
    },
    configurable: true,
  });
  return fn().finally(() => {
    if (previousWindow) Object.defineProperty(g, "window", previousWindow);
    else delete g.window;
    if (previousNavigator) Object.defineProperty(g, "navigator", previousNavigator);
    else delete g.navigator;
  });
}

test("readiness reports an insecure context without probing devices", async () => {
  const result = await withGlobals({ isSecureContext: false, mediaDevices: undefined }, () =>
    getCircleMediaReadiness(),
  );
  assert.equal(result.secureContext, false);
  assert.equal(result.mediaDevicesAvailable, false);
});

test("readiness detects microphone and camera hardware independently", async () => {
  const result = await withGlobals(
    {
      mediaDevices: {
        enumerateDevices: async () => [{ kind: "audioinput" }],
      },
      permissionsQuery: async () => ({ state: "prompt" }),
    },
    () => getCircleMediaReadiness(),
  );
  assert.equal(result.hasMicrophone, true);
  assert.equal(result.hasCamera, false);
  assert.equal(result.microphonePermission, "prompt");
});

test("acquisition refuses an insecure context before getUserMedia", async () => {
  let called = false;
  const result = await withGlobals(
    {
      isSecureContext: false,
      mediaDevices: {
        enumerateDevices: async () => [{ kind: "videoinput" }],
        getUserMedia: async () => {
          called = true;
          return {};
        },
      },
    },
    () => acquireCircleDevice("camera"),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "secure_context_required");
  assert.equal(called, false);
});

test("camera acquisition never requests audio", async () => {
  let constraints: any = null;
  const result = await withGlobals(
    {
      mediaDevices: {
        enumerateDevices: async () => [{ kind: "videoinput" }],
        getUserMedia: async (value: any) => {
          constraints = value;
          return { id: "fake-stream", getTracks: () => [] };
        },
      },
    },
    () => acquireCircleDevice("camera"),
  );
  assert.equal(result.ok, true);
  assert.equal(constraints.audio, false);
  assert.ok(constraints.video);
});

test("acquisition maps permission and busy errors", async () => {
  for (const [name, expected] of [
    ["NotAllowedError", "permission_denied"],
    ["NotReadableError", "device_busy"],
  ] as const) {
    const result = await withGlobals(
      {
        mediaDevices: {
          enumerateDevices: async () => [{ kind: "videoinput" }],
          getUserMedia: async () => {
            throw new DOMException("failure", name);
          },
        },
      },
      () => acquireCircleDevice("camera"),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, expected);
  }
});

test("acquisition reports missing hardware without prompting", async () => {
  let called = false;
  const result = await withGlobals(
    {
      mediaDevices: {
        enumerateDevices: async () => [{ kind: "audioinput" }],
        getUserMedia: async () => {
          called = true;
          return {};
        },
      },
    },
    () => acquireCircleDevice("camera"),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "device_not_found");
  assert.equal(called, false);
});

test("classifier distinguishes SFU connectivity from permission failure", () => {
  const connectivity = classifyMediaError(
    new Error("LiveKit media session ended while publishing the camera"),
    "camera",
  );
  assert.equal(connectivity.ok, false);
  if (!connectivity.ok) assert.equal(connectivity.code, "connectivity_error");

  const missing = classifyMediaError(new DOMException("x", "NotFoundError"), "microphone");
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "device_not_found");
});
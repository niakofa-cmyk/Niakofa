import assert from "node:assert/strict";
import { test } from "node:test";
import { reportClientSideEffectFailure } from "../client-error-reporting.ts";

test("reports only static operation and sanitized error type", () => {
  const warnings: Parameters<typeof console.warn>[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: Parameters<typeof console.warn>) => {
    warnings.push(args);
  };

  try {
    reportClientSideEffectFailure("pages.messages")(
      Object.assign(new Error("message body must not be logged"), {
        name: "TypeError",
      }),
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(warnings, [
    ["[Niakofa] pages.messages failed (TypeError)"],
  ]);
  assert.equal(
    JSON.stringify(warnings).includes("message body must not be logged"),
    false,
  );
});

test("does not report expected abort cancellations", () => {
  const warnings: Parameters<typeof console.warn>[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: Parameters<typeof console.warn>) => {
    warnings.push(args);
  };

  try {
    reportClientSideEffectFailure("community.story-share")(
      Object.assign(new Error("share dismissed"), { name: "AbortError" }),
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(warnings, []);
});

test("does not include untrusted operation or error names in logs", () => {
  const warnings: Parameters<typeof console.warn>[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: Parameters<typeof console.warn>) => {
    warnings.push(args);
  };

  try {
    reportClientSideEffectFailure("operation\nwith user data")({
      name: "TypeError\nprivate detail",
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(warnings, [
    ["[Niakofa] unknown-operation failed (Error)"],
  ]);
});

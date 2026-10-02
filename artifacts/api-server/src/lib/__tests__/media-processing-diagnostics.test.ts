import { describe, expect, it } from "@jest/globals";
import { mediaProcessingErrorDetails } from "../media-processing-diagnostics";

describe("media processing error diagnostics", () => {
  it("keeps bounded provider codes and numeric status without logging error messages", () => {
    const error = Object.assign(new Error("signed URL and secret"), {
      code: "NoSuchKey",
      $metadata: { httpStatusCode: 404 },
      requestUrl: "https://private.example/signed?token=secret",
    });

    expect(mediaProcessingErrorDetails(error)).toEqual({
      errorType: "Error",
      errorCode: "NoSuchKey",
      httpStatus: 404,
    });
  });

  it("reports process exit and signal while omitting stderr and paths", () => {
    expect(mediaProcessingErrorDetails({
      name: "Error",
      code: 1,
      signal: "SIGTERM",
      stderr: "private stderr",
      path: "/private/tmp/original",
    })).toEqual({
      errorType: "Error",
      exitCode: 1,
      signal: "SIGTERM",
    });
  });

  it("drops unrecognized codes and unsafe error names", () => {
    expect(mediaProcessingErrorDetails({
      name: "private path /tmp/key",
      code: "secret-value",
      message: "never include this",
    })).toEqual({ errorType: "Error" });
  });

  it("does not expose non-Error thrown values", () => {
    expect(mediaProcessingErrorDetails("storage key and credentials"))
      .toEqual({ errorType: "NonError" });
  });
});
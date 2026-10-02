export type MediaProcessingErrorDetails = {
  errorType: string;
  errorCode?: string;
  httpStatus?: number;
  exitCode?: number;
  signal?: string;
};

const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9]{0,47}$/;
const SAFE_ERROR_CODE =
  /^(?:E[A-Z0-9_]{1,31}|ERR_[A-Z0-9_]{1,40}|[A-Z0-9]{5}|NoSuchKey|NoSuchBucket|AccessDenied|InvalidAccessKeyId|SignatureDoesNotMatch|RequestTimeTooSkewed|SlowDown|RequestTimeout|ServiceUnavailable|InternalError|BadDigest|InvalidRequest|EntityTooLarge|InvalidRange)$/;
const SAFE_SIGNALS = new Set(["SIGABRT", "SIGINT", "SIGKILL", "SIGSEGV", "SIGTERM"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function mediaProcessingErrorDetails(error: unknown): MediaProcessingErrorDetails {
  if (!isRecord(error)) {
    return { errorType: error instanceof Error ? "Error" : "NonError" };
  }

  const rawName = error.name;
  const errorType = typeof rawName === "string" && SAFE_ERROR_NAME.test(rawName)
    ? rawName
    : "Error";
  const rawCode = error.code;
  const errorCode = typeof rawCode === "string" && SAFE_ERROR_CODE.test(rawCode)
    ? rawCode
    : undefined;
  const exitCode = typeof rawCode === "number" && Number.isInteger(rawCode)
    && rawCode >= 0 && rawCode <= 255
    ? rawCode
    : undefined;
  const metadata = isRecord(error.$metadata) ? error.$metadata : undefined;
  const candidateStatus = [error.statusCode, error.status, metadata?.httpStatusCode]
    .find((value) => typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599);
  const signal = typeof error.signal === "string" && SAFE_SIGNALS.has(error.signal)
    ? error.signal
    : undefined;

  return {
    errorType,
    ...(errorCode ? { errorCode } : {}),
    ...(typeof candidateStatus === "number" ? { httpStatus: candidateStatus } : {}),
    ...(exitCode !== undefined ? { exitCode } : {}),
    ...(signal ? { signal } : {}),
  };
}
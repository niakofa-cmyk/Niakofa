import { logger } from "./logger";

const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const SAFE_OPERATION_NAME = /^[A-Za-z0-9_.:-]{1,80}$/;

function safeErrorName(error: unknown): string {
  const name =
    error instanceof Error
      ? error.name
      : typeof error === "object" &&
          error !== null &&
          "name" in error &&
          typeof error.name === "string"
        ? error.name
        : "NonErrorRejection";

  return SAFE_ERROR_NAME.test(name) ? name : "Error";
}

export function logHandledFailure(
  operation: string,
  error: unknown,
  level: "warn" | "error" = "warn",
): void {
  const safeOperation = SAFE_OPERATION_NAME.test(operation)
    ? operation
    : "unknown-operation";
  const errorType = safeErrorName(error);
  if (errorType === "AbortError") return;

  const context = { operation: safeOperation, error_type: errorType };
  if (level === "error") {
    logger.error(context, "Handled non-fatal failure");
  } else {
    logger.warn(context, "Handled non-fatal failure");
  }
}

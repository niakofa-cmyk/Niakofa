const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const SAFE_OPERATION_NAME = /^[A-Za-z0-9_.:-]{1,80}$/;

function safeErrorName(error: unknown): string {
  const candidate =
    error instanceof Error
      ? error.name
      : typeof error === "object" &&
          error !== null &&
          "name" in error &&
          typeof error.name === "string"
        ? error.name
        : "NonErrorRejection";

  return SAFE_ERROR_NAME.test(candidate) ? candidate : "Error";
}

export function reportClientSideEffectFailure(operation: string) {
  const safeOperation = SAFE_OPERATION_NAME.test(operation)
    ? operation
    : "unknown-operation";

  return (error: unknown): void => {
    const name = safeErrorName(error);
    if (name === "AbortError") return;

    console.warn(`[Niakofa] ${safeOperation} failed (${name})`);
  };
}

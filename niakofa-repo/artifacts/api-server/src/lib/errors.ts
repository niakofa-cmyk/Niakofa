/**
 * Standardized application error class and error codes.
 *
 * Every route should throw/next() an AppError instead of constructing
 * ad-hoc { status, message } objects. The global error handler in app.ts
 * reads .status and .code to produce a consistent { error, code, requestId }
 * JSON response.
 */

export const ErrorCode = {
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  UNPROCESSABLE: "UNPROCESSABLE",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  NIA_DISABLED: "NIA_DISABLED",
  NIA_UNAVAILABLE: "NIA_UNAVAILABLE",
  VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCodeValue;
  readonly expose: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: ErrorCodeValue,
    message: string,
    options?: { expose?: boolean; details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.expose = options?.expose ?? status < 500;
    this.details = options?.details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(400, ErrorCode.BAD_REQUEST, message, { details });
  }

  static unauthorized(message = "Unauthorized — valid Bearer token required"): AppError {
    return new AppError(401, ErrorCode.UNAUTHORIZED, message);
  }

  static forbidden(message: string): AppError {
    return new AppError(403, ErrorCode.FORBIDDEN, message);
  }

  static notFound(message: string): AppError {
    return new AppError(404, ErrorCode.NOT_FOUND, message);
  }

  static conflict(message: string): AppError {
    return new AppError(409, ErrorCode.CONFLICT, message);
  }

  static unprocessable(message: string): AppError {
    return new AppError(422, ErrorCode.UNPROCESSABLE, message);
  }

  static rateLimited(message: string): AppError {
    return new AppError(429, ErrorCode.RATE_LIMITED, message);
  }

  static internal(message = "An unexpected error occurred", cause?: unknown): AppError {
    return new AppError(500, ErrorCode.INTERNAL_ERROR, message, { cause, expose: false });
  }

  static serviceUnavailable(message: string): AppError {
    return new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, message, { expose: true });
  }

  static validationError(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(422, ErrorCode.VALIDATION_ERROR, message, { details, expose: true });
  }
}

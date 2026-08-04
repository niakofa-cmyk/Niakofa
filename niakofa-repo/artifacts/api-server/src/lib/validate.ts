/**
 * Standardized Zod request validation middleware.
 *
 * Usage:
 *   router.post("/things", validateBody(CreateThingSchema), handler);
 *   router.get("/things/:id", validateParams(IdSchema), handler);
 *
 * On failure, calls next() with an AppError(422, VALIDATION_ERROR) so the
 * global error handler produces a consistent { error, code, requestId } body.
 */
import type { NextFunction, Request, Response } from "express";
import type { ZodType, ZodError } from "zod";
import { AppError, ErrorCode } from "./errors";

export function validateBody<T>(schema: ZodType<T>): (req: Request, _res: Response, next: NextFunction) => void {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(zodToAppError(result.error, "body"));
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateParams<T>(schema: ZodType<T>): (req: Request, _res: Response, next: NextFunction) => void {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(zodToAppError(result.error, "path parameters"));
      return;
    }
    req.params = result.data as unknown as Record<string, string>;
    next();
  };
}

export function validateQuery<T>(schema: ZodType<T>): (req: Request, _res: Response, next: NextFunction) => void {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(zodToAppError(result.error, "query parameters"));
      return;
    }
    req.query = result.data as unknown as Record<string, string>;
    next();
  };
}

function zodToAppError(error: ZodError, location: string): AppError {
  const issues = error.issues.map((i) => ({
    path: i.path.join(".") || "(root)",
    message: i.message,
  }));
  return new AppError(
    422,
    ErrorCode.VALIDATION_ERROR,
    `Invalid ${location}: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
    { expose: true, details: { issues } },
  );
}

declare global {
  namespace Express {
    interface Request {
      authenticatedUserId?: number;
      // token_version embedded in the presented Bearer token, if valid.
      // Compared against the DB's current token_version in requireApproved()
      // to reject tokens invalidated by logout/password-change.
      authenticatedTokenVersion?: number;
      // pino-http attaches a request ID for log correlation.
      id?: string;
    }
  }
}

export {};

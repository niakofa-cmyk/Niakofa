declare global {
  namespace Express {
    interface Request {
      authenticatedUserId?: number;
    }
  }
}

export {};

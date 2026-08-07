declare global {
  namespace Express {
    interface Request {
      authenticatedUserId?: number;
      locationContext?: import("../middleware/location").LocationContext;
    }
  }
}

export {};

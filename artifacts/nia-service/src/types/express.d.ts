import type { LocationContext } from "../middleware/location";

declare global {
  namespace Express {
    interface Request {
      authenticatedUserId?: number;
      locationContext?: LocationContext;
    }
  }
}

export {};

import { Router, type IRouter } from "express";

const router: IRouter = Router();

// Build time is captured once at module load — stable within a single process
// lifetime but always reflects the actual start time of THIS deployment, not a
// hardcoded constant that never changes between releases.
const BUILD_TIME = Math.floor(Date.now() / 1000);
const VERSION =
  process.env.npm_package_version ??
  process.env.APP_VERSION ??
  "dev";

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok", version: VERSION, built: BUILD_TIME });
});

router.get("/version", (_req, res) => {
  res.json({ version: VERSION, built: BUILD_TIME });
});

export default router;

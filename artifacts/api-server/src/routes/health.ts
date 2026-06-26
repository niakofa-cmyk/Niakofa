import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok", version: "chat-v2", built: 1781660646 });
});

router.get("/version", (_req, res) => {
  res.json({ version: "chat-v2", built: 1781660646 });
});

export default router;

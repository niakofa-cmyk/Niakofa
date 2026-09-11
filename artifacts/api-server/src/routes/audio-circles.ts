/**
 * TEMP: loading full content
 * See commit history ceeca77 for prior version
 */
import { Router } from "express";
const router = Router();
router.get("/audio-circles", (_req, res) => res.status(503).json({ error: "Spirals route temporarily restoring — retry in a moment" }));
export default router;

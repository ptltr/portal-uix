import { Router } from "express";
import conversationsRouter from "./conversations";

const router = Router();

router.use("/openai", conversationsRouter);

export default router;

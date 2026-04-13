import { Router, type IRouter } from "express";
import healthRouter from "./health";
import openaiRouter from "./openai/index";
import remindersRouter from "./reminders";
import chatSessionsRouter from "./chatSessions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(openaiRouter);
router.use(remindersRouter);
router.use(chatSessionsRouter);

export default router;

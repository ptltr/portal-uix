import { Router, type IRouter } from "express";
import healthRouter from "./health";
import openaiRouter from "./openai/index";
import remindersRouter from "./reminders";

const router: IRouter = Router();

router.use(healthRouter);
router.use(openaiRouter);
router.use(remindersRouter);

export default router;

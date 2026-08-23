import { Router, type IRouter } from "express";
import healthRouter from "./health";
import budgetRouter from "./budget";
import transactionsRouter from "./transactions";
import insightsRouter from "./insights";
import exportRouter from "./exportWorkbook";
import investmentsRouter from "./investments";
import { requireUser } from "../middlewares/requireUser";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireUser);
router.use(budgetRouter);
router.use(transactionsRouter);
router.use(insightsRouter);
router.use(investmentsRouter);
router.use(exportRouter);

export default router;

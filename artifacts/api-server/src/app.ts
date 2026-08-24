import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { apiSecurityHeaders } from "./middlewares/apiSafety";

const app: Express = express();

app.disable("x-powered-by");
app.use(apiSecurityHeaders);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Ledger is same-origin only; financial API responses are never exposed to
// cross-origin browser requests.
app.use(cors({ origin: false }));
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
  if (status === 413) {
    res.status(413).json({ error: "Request is too large." });
    return;
  }
  res.status(500).json({ error: "Unexpected server error." });
});

export default app;

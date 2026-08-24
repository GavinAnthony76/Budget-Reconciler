import type { NextFunction, Request, Response } from "express";
import { currentUserId } from "./requireUser";

const writeRateBuckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Applies browser-facing API headers to every response, including health
 * checks and authentication failures.
 */
export function apiSecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

/**
 * Runs after requireUser so one reverse-proxy IP cannot throttle every
 * household sharing that proxy.
 */
export function apiWriteRateLimit(req: Request, res: Response, next: NextFunction): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    next();
    return;
  }

  const now = Date.now();
  const key = currentUserId(req);
  const bucket = writeRateBuckets.get(key);
  const active = bucket && bucket.resetAt > now ? bucket : { count: 0, resetAt: now + 10 * 60 * 1000 };
  active.count += 1;
  writeRateBuckets.set(key, active);
  if (writeRateBuckets.size > 10_000) writeRateBuckets.clear();
  if (active.count > 120) {
    res.status(429).json({ error: "Too many changes. Please wait a few minutes and try again." });
    return;
  }
  next();
}
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ERROR_CODES } from "@studio/shared";
import { z } from "zod";
import type { Env } from "../../env.js";
import { AppError, forbidden, unauthenticated, validationError } from "../../app-error.js";
import type { AuditRepository } from "../audit/audit-repository.js";
import { verifyPassword } from "./password.js";
import { accessDecision, originAllowed, readCookie, type AccessMode } from "./request-guard.js";
import { createSessionToken, sessionKey, verifySessionToken } from "./session-token.js";
import { SignInLimiter } from "./sign-in-limiter.js";

export const SESSION_COOKIE = "jh_session";

declare module "fastify" {
  interface FastifyRequest {
    signedIn: boolean;
  }
  interface FastifyContextConfig {
    // Routes only the signed-in user may call, even when no password is configured.
    signedIn?: boolean;
  }
}

const signInSchema = z.object({ password: z.string().min(1).max(1024) });

export type AuthConfig = {
  mode: AccessMode;
  key: string;
  passwordHash: string;
  ttlMs: number;
  secureCookie: boolean;
  allowedOrigins: string[];
};

export function authConfigFromEnv(env: Env): AuthConfig {
  const mode: AccessMode = env.APP_PASSWORD_HASH ? "SIGN_IN" : "OPEN";
  return {
    mode,
    key: mode === "SIGN_IN" ? sessionKey(env.SESSION_SECRET, env.APP_PASSWORD_HASH) : "",
    passwordHash: env.APP_PASSWORD_HASH,
    ttlMs: env.SESSION_TTL_HOURS * 60 * 60 * 1000,
    secureCookie: env.SESSION_COOKIE_SECURE === "auto" ? env.NODE_ENV === "production" : env.SESSION_COOKIE_SECURE === "true",
    allowedOrigins: env.APP_ORIGINS,
  };
}

function cookie(config: AuthConfig, value: string, maxAgeSeconds: number): string {
  const parts = [`${SESSION_COOKIE}=${value}`, "HttpOnly", "SameSite=Strict", "Path=/", `Max-Age=${maxAgeSeconds}`];
  if (config.secureCookie) parts.push("Secure");
  return parts.join("; ");
}

function session(config: AuthConfig, request: FastifyRequest, now: Date) {
  if (config.mode !== "SIGN_IN") return null;
  const check = verifySessionToken(readCookie(request.headers.cookie, SESSION_COOKIE), config.key, now);
  return check.ok ? check : null;
}

export async function registerAuth(
  app: FastifyInstance,
  config: AuthConfig,
  audit: AuditRepository,
  options: { now?: () => Date; limiter?: SignInLimiter } = {},
) {
  const now = options.now ?? (() => new Date());
  const limiter = options.limiter ?? new SignInLimiter({ now });
  if (config.mode === "OPEN") {
    app.log.warn("No APP_PASSWORD_HASH is set: the app is open, and approving or submitting applications is refused.");
  }

  app.decorateRequest("signedIn", false);
  app.addHook("onRequest", async (request) => {
    const path = request.url.split("?")[0] ?? "";
    if (path.startsWith("/api/")) {
      const allowed = originAllowed({
        method: request.method,
        origin: request.headers.origin,
        host: request.headers.host,
        allowedOrigins: config.allowedOrigins,
      });
      if (!allowed) throw forbidden("This request came from another site.");
    }
    request.signedIn = session(config, request, now()) !== null;
    const decision = accessDecision({
      mode: config.mode,
      path,
      signedIn: request.signedIn,
      requiresSignIn: request.routeOptions.config?.signedIn === true,
    });
    if (decision === "UNAUTHENTICATED") throw unauthenticated();
    if (decision === "SIGN_IN_NOT_CONFIGURED") {
      throw forbidden("Approving and submitting need sign-in. Set APP_PASSWORD_HASH and SESSION_SECRET, then sign in.");
    }
  });

  app.get("/api/auth/session", async (request) => {
    const current = session(config, request, now());
    return { required: config.mode === "SIGN_IN", signedIn: current !== null, expiresAt: current?.expiresAt.toISOString() ?? null };
  });

  app.post("/api/auth/sign-in", async (request, reply) => {
    if (config.mode !== "SIGN_IN") throw forbidden("No sign-in password is configured.");
    const parsed = signInSchema.safeParse(request.body);
    if (!parsed.success) throw validationError("Enter your password.");
    const gate = limiter.check();
    if (!gate.allowed) {
      reply.header("Retry-After", String(Math.ceil(gate.retryAfterMs / 1000)));
      throw new AppError(ERROR_CODES.RATE_LIMITED, "Too many failed attempts. Try again later.", 429);
    }
    if (!(await verifyPassword(parsed.data.password, config.passwordHash))) {
      limiter.recordFailure();
      await audit.record({ eventType: "SIGN_IN_FAILED", actor: "USER", entityType: "session", entityId: "user" });
      throw unauthenticated("That password is not right.");
    }
    limiter.reset();
    const issuedAt = now();
    reply.header("Set-Cookie", cookie(config, createSessionToken(config.key, issuedAt, config.ttlMs), Math.floor(config.ttlMs / 1000)));
    await audit.record({ eventType: "SIGNED_IN", actor: "USER", entityType: "session", entityId: "user" });
    return { required: true, signedIn: true, expiresAt: new Date(issuedAt.getTime() + config.ttlMs).toISOString() };
  });

  app.post("/api/auth/sign-out", async (_request, reply) => {
    reply.header("Set-Cookie", cookie(config, "", 0));
    return { required: config.mode === "SIGN_IN", signedIn: false, expiresAt: null };
  });
}

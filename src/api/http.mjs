import { FeatherLabError } from "../core/errors.mjs";

export class MethodNotAllowedError extends FeatherLabError {
  constructor(method, allowed) {
    super("METHOD_NOT_ALLOWED", `Method ${method} is not allowed here.`, { details: { allowed } });
  }
}

export function reply(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}

export function originAllowed(req, port) {
  const origin = req.headers.origin;
  return !origin || origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

/**
 * DNS-rebinding defence. The server only listens on loopback, so a legitimate request
 * always names the loopback address or `localhost` with the server's own port. A page on
 * `evil.example` that rebinds its DNS to 127.0.0.1 still sends `Host: evil.example:port`.
 */
export function hostAllowed(req, port) {
  const host = req.headers.host;
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

const STATUS_BY_CODE = {
  FORBIDDEN_HOST: 403,
  EXERCISE_LOCKED: 403,
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  OPERATION_IN_PROGRESS: 409,
  ENVIRONMENT_UNAVAILABLE: 503,
  LIFECYCLE_FAILED: 500,
  METHOD_NOT_ALLOWED: 405,
};

// Only these detail keys are safe to show a learner; stderr and the like stay in the logs.
const PUBLIC_DETAIL_KEYS = ["operation", "step", "completed", "reason", "unmetPrerequisites"];

/**
 * Map any thrown value to `{status, body}`. `error` stays a string for compatibility with
 * earlier clients; `code` is the stable machine-readable identifier.
 */
export function toErrorResponse(error, logger = console) {
  if (error instanceof FeatherLabError) {
    const status = error.reason === "timeout" ? 504 : (STATUS_BY_CODE[error.code] ?? 500);
    const details = Object.fromEntries(
      Object.entries(error.details ?? {}).filter(([key]) => PUBLIC_DETAIL_KEYS.includes(key)),
    );
    return {
      status,
      body: {
        error: error.message,
        code: error.code,
        ...(Object.keys(details).length > 0 ? { details } : {}),
      },
    };
  }
  logger.error(error);
  return { status: 500, body: { error: "Internal error.", code: "INTERNAL_ERROR" } };
}

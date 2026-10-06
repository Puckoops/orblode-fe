export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface Envelope<T> {
  status?: number;
  error: boolean;
  data?: T;
  message?: string;
}

function isEnvelope(body: unknown): body is Envelope<unknown> {
  return !!body && typeof body === "object" && !Array.isArray(body) && typeof (body as { error?: unknown }).error === "boolean";
}

/**
 * The payload of a response from either backend. Both answer with common-pkg-svc's
 * `{status, data, error, message}` envelope; anything else is passed through as-is so a
 * proxy-generated error page still surfaces its status.
 */
export function readBody<T>(status: number, ok: boolean, text: string): T {
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (isEnvelope(body)) {
    if (!ok || body.error) throw new ApiError(status, body.message || `Request failed (${status})`);
    return body.data as T;
  }
  if (!ok) {
    const b = body as { error?: unknown; message?: unknown } | null;
    const message = (typeof b?.error === "string" && b.error) || (typeof b?.message === "string" && b.message) || `Request failed (${status})`;
    throw new ApiError(status, message);
  }
  return body as T;
}

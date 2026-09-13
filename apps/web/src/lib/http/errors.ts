import { isProduction, type Env } from "./env";

export type ErrorCode =
  | "invalid_request"
  | "rate_limited"
  | "provider_unconfigured"
  | "upstream_failure"
  | "unauthorized"
  | "endpoint_unconfigured";

/** Opaque, client-safe messages. Provider and transport details never leave the server log. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  invalid_request: "The request is not valid.",
  rate_limited: "Too many requests. Please wait a moment and try again.",
  provider_unconfigured: "The assistant is not configured yet. Check the server logs.",
  upstream_failure: "The assistant could not complete the request. Please try again.",
  unauthorized: "Unauthorized.",
  endpoint_unconfigured: "This endpoint is not configured. Check the server logs.",
};

export interface ClientErrorBody {
  error: string;
  code: ErrorCode;
  /** Present outside production only. */
  detail?: string;
}

export interface DescribeErrorOptions {
  code: ErrorCode;
  env?: Env;
}

/**
 * Builds the JSON body for an error response.
 *
 * `detail` is an explicit contract, not a raw caught error: pass `undefined`
 * when there is nothing safe to show (the body carries only the opaque
 * message), or a string message to surface outside production. Callers that
 * hold an `unknown` error must convert it to a string first with
 * {@link messageOf}.
 * This keeps a nullish value from ever being stringified into the response,
 * which previously shipped a literal `"detail": "null"`.
 */
export function describeError(detail: string | undefined, { code, env = process.env }: DescribeErrorOptions): ClientErrorBody {
  const body: ClientErrorBody = { error: ERROR_MESSAGES[code], code };
  if (!isProduction(env) && detail !== undefined) body.detail = detail;
  return body;
}

/** Text streamed to the UI when the model or a tool fails mid-response. */
export function clientErrorMessage(error: unknown, env: Env = process.env): string {
  return isProduction(env) ? ERROR_MESSAGES.upstream_failure : `${ERROR_MESSAGES.upstream_failure} (${messageOf(error)})`;
}

/**
 * Converts a caught `unknown` error to a string.
 *
 * Used both to build a {@link describeError} detail and to interpolate into
 * a streamed message, so it is deliberately tied to neither call shape.
 */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

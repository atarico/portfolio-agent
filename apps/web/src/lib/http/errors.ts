type Env = Record<string, string | undefined>;

export type ErrorCode = "invalid_request" | "rate_limited" | "provider_unconfigured" | "upstream_failure";

/** Opaque, client-safe messages. Provider and transport details never leave the server log. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  invalid_request: "The request is not valid.",
  rate_limited: "Too many requests. Please wait a moment and try again.",
  provider_unconfigured: "The assistant is not configured yet. Check the server logs.",
  upstream_failure: "The assistant could not complete the request. Please try again.",
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

export function isProduction(env: Env = process.env): boolean {
  return env.NODE_ENV === "production";
}

/** Builds the JSON body for an error response. */
export function describeError(error: unknown, { code, env = process.env }: DescribeErrorOptions): ClientErrorBody {
  const body: ClientErrorBody = { error: ERROR_MESSAGES[code], code };
  if (!isProduction(env)) body.detail = messageOf(error);
  return body;
}

/** Text streamed to the UI when the model or a tool fails mid-response. */
export function clientErrorMessage(error: unknown, env: Env = process.env): string {
  return isProduction(env) ? ERROR_MESSAGES.upstream_failure : `${ERROR_MESSAGES.upstream_failure} (${messageOf(error)})`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

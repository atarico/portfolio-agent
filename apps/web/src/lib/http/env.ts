export type Env = Record<string, string | undefined>;

export function isProduction(env: Env = process.env): boolean {
  return env.NODE_ENV === "production";
}

/** Whether `x-forwarded-for`/`x-real-ip` may be trusted for rate-limit identity. */
export function trustsProxyHeaders(env: Env = process.env): boolean {
  return env.TRUST_PROXY_HEADERS === "1";
}

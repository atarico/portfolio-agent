import { describe, expect, it } from "vitest";

import { isProduction, trustsProxyHeaders } from "./env";

describe("isProduction", () => {
  it("is true only when NODE_ENV is exactly \"production\"", () => {
    expect(isProduction({ NODE_ENV: "production" })).toBe(true);
    expect(isProduction({ NODE_ENV: "development" })).toBe(false);
    expect(isProduction({})).toBe(false);
  });
});

describe("trustsProxyHeaders", () => {
  it("is true only when TRUST_PROXY_HEADERS is exactly \"1\"", () => {
    expect(trustsProxyHeaders({ TRUST_PROXY_HEADERS: "1" })).toBe(true);
    expect(trustsProxyHeaders({ TRUST_PROXY_HEADERS: "true" })).toBe(false);
    expect(trustsProxyHeaders({ TRUST_PROXY_HEADERS: "0" })).toBe(false);
    expect(trustsProxyHeaders({})).toBe(false);
  });
});

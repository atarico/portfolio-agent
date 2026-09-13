import { describe, expect, it } from "vitest";

import { authorizeMcpRequest } from "./auth";

describe("authorizeMcpRequest", () => {
  it("allows every request when MCP_AUTH_TOKEN is unset or blank", () => {
    expect(authorizeMcpRequest(new Headers(), {})).toEqual({ ok: true });
    expect(authorizeMcpRequest(new Headers(), { MCP_AUTH_TOKEN: "  " })).toEqual({ ok: true });
  });

  it("rejects a missing bearer token with 401 and a WWW-Authenticate challenge", () => {
    const result = authorizeMcpRequest(new Headers(), { MCP_AUTH_TOKEN: "secret" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    expect(result.response.headers.get("www-authenticate")).toMatch(/^Bearer/);
  });

  it("rejects a wrong token and a non-bearer scheme", () => {
    const wrong = authorizeMcpRequest(new Headers({ authorization: "Bearer nope" }), {
      MCP_AUTH_TOKEN: "secret",
    });
    const basic = authorizeMcpRequest(new Headers({ authorization: "Basic secret" }), {
      MCP_AUTH_TOKEN: "secret",
    });

    expect(wrong.ok).toBe(false);
    expect(basic.ok).toBe(false);
  });

  it("accepts the configured bearer token", () => {
    const result = authorizeMcpRequest(new Headers({ authorization: "Bearer secret" }), {
      MCP_AUTH_TOKEN: "secret",
    });

    expect(result).toEqual({ ok: true });
  });
});

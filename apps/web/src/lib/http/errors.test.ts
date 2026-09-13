import { describe, expect, it } from "vitest";

import { ERROR_MESSAGES, clientErrorMessage, describeError } from "./errors";

const boom = new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY at /srv/app/.env");

describe("describeError", () => {
  it("returns an opaque message and code in production, without detail", () => {
    const body = describeError(boom.message, { code: "provider_unconfigured", env: { NODE_ENV: "production" } });

    expect(body).toEqual({ error: ERROR_MESSAGES.provider_unconfigured, code: "provider_unconfigured" });
    expect(JSON.stringify(body)).not.toContain("GOOGLE_GENERATIVE_AI_API_KEY");
  });

  it("adds the given detail outside production to help the developer", () => {
    const body = describeError(boom.message, { code: "upstream_failure", env: { NODE_ENV: "development" } });

    expect(body).toMatchObject({ code: "upstream_failure", detail: boom.message });
  });

  it("treats an unset NODE_ENV as non-production", () => {
    expect(describeError(boom.message, { code: "upstream_failure", env: {} })).toHaveProperty("detail");
  });

  it("omits detail entirely when no error is given, never rendering a stringified null/undefined", () => {
    const body = describeError(undefined, { code: "rate_limited", env: {} });

    expect(body).toEqual({ error: ERROR_MESSAGES.rate_limited, code: "rate_limited" });
    expect(JSON.stringify(body)).not.toContain("null");
    expect(JSON.stringify(body)).not.toContain("undefined");
  });

  it("keeps an empty string detail outside production, since it is a real (if empty) message", () => {
    const body = describeError("", { code: "invalid_request", env: {} });

    expect(body).toEqual({ error: ERROR_MESSAGES.invalid_request, code: "invalid_request", detail: "" });
  });
});

describe("clientErrorMessage", () => {
  it("hides upstream text in production and shows it otherwise", () => {
    expect(clientErrorMessage(boom, { NODE_ENV: "production" })).toBe(ERROR_MESSAGES.upstream_failure);
    expect(clientErrorMessage(boom, { NODE_ENV: "test" })).toContain(boom.message);
    expect(clientErrorMessage("string error", { NODE_ENV: "test" })).toContain("string error");
  });
});

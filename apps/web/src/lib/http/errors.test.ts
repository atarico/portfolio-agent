import { describe, expect, it } from "vitest";

import { ERROR_MESSAGES, clientErrorMessage, describeError } from "./errors";

const boom = new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY at /srv/app/.env");

describe("describeError", () => {
  it("returns an opaque message and code in production, without detail", () => {
    const body = describeError(boom, { code: "provider_unconfigured", env: { NODE_ENV: "production" } });

    expect(body).toEqual({ error: ERROR_MESSAGES.provider_unconfigured, code: "provider_unconfigured" });
    expect(JSON.stringify(body)).not.toContain("GOOGLE_GENERATIVE_AI_API_KEY");
  });

  it("adds the underlying detail outside production to help the developer", () => {
    const body = describeError(boom, { code: "upstream_failure", env: { NODE_ENV: "development" } });

    expect(body).toMatchObject({ code: "upstream_failure", detail: boom.message });
  });

  it("treats an unset NODE_ENV as non-production", () => {
    expect(describeError(boom, { code: "upstream_failure", env: {} })).toHaveProperty("detail");
  });
});

describe("clientErrorMessage", () => {
  it("hides upstream text in production and shows it otherwise", () => {
    expect(clientErrorMessage(boom, { NODE_ENV: "production" })).toBe(ERROR_MESSAGES.upstream_failure);
    expect(clientErrorMessage(boom, { NODE_ENV: "test" })).toContain(boom.message);
    expect(clientErrorMessage("string error", { NODE_ENV: "test" })).toContain("string error");
  });
});

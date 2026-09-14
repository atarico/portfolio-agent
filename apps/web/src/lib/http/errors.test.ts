import { describe, expect, it } from "vitest";

import { ERROR_MESSAGES, clientErrorMessage, clientErrorText, describeError } from "./errors";

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

describe("clientErrorText", () => {
  it("renders the human message from a failed response body instead of the serialized envelope", () => {
    const body = JSON.stringify(describeError(undefined, { code: "upstream_failure", env: { NODE_ENV: "production" } }));

    const text = clientErrorText(body);

    expect(text).toBe(ERROR_MESSAGES.upstream_failure);
    // The envelope itself must never reach the reader: no braces, no quotes, no code.
    expect(text).not.toContain("{");
    expect(text).not.toContain('"');
    expect(text).not.toContain("upstream_failure");
  });

  it("appends the detail when the server chose to include one", () => {
    const body = JSON.stringify(
      describeError(boom.message, { code: "provider_unconfigured", env: { NODE_ENV: "development" } }),
    );

    const text = clientErrorText(body);

    // `detail` only reaches the body outside production, so honouring it here
    // surfaces the development hint without widening what production exposes.
    expect(text).toContain(ERROR_MESSAGES.provider_unconfigured);
    expect(text).toContain(boom.message);
    expect(text).not.toContain("\\");
  });

  it("passes through text that is not a contract body, rather than hiding it", () => {
    expect(clientErrorText("Failed to fetch")).toBe("Failed to fetch");
    expect(clientErrorText("")).toBe("");
    expect(clientErrorText("<html>502 Bad Gateway</html>")).toBe("<html>502 Bad Gateway</html>");
    // Valid JSON, but not this contract.
    expect(clientErrorText('["nope"]')).toBe('["nope"]');
    expect(clientErrorText('{"code":"upstream_failure"}')).toBe('{"code":"upstream_failure"}');
    expect(clientErrorText("null")).toBe("null");
  });
});

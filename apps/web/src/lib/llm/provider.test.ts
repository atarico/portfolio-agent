import { describe, expect, it } from "vitest";

import { DEFAULT_MODELS, resolveModel } from "./provider";

describe("resolveModel", () => {
  it("defaults to Google Gemini when LLM_PROVIDER is unset", () => {
    const resolved = resolveModel({ GOOGLE_GENERATIVE_AI_API_KEY: "test-key" });

    expect(resolved.provider).toBe("google");
    expect(resolved.modelId).toBe(DEFAULT_MODELS.google);
    expect(resolved.model.modelId).toBe(DEFAULT_MODELS.google);
  });

  it("switches to Groq when LLM_PROVIDER=groq", () => {
    const resolved = resolveModel({ LLM_PROVIDER: "groq", GROQ_API_KEY: "test-key" });

    expect(resolved.provider).toBe("groq");
    expect(resolved.modelId).toBe(DEFAULT_MODELS.groq);
    expect(resolved.model.modelId).toBe(DEFAULT_MODELS.groq);
  });

  it("honors an explicit LLM_MODEL override", () => {
    const resolved = resolveModel({
      LLM_PROVIDER: "groq",
      GROQ_API_KEY: "test-key",
      LLM_MODEL: "qwen/qwen3.6-27b",
    });

    expect(resolved.modelId).toBe("qwen/qwen3.6-27b");
  });

  it("names the missing API key variable in the error", () => {
    expect(() => resolveModel({})).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
    expect(() => resolveModel({ LLM_PROVIDER: "groq" })).toThrow(/GROQ_API_KEY/);
  });

  it("rejects an unknown provider and lists the supported ones", () => {
    expect(() => resolveModel({ LLM_PROVIDER: "openai" })).toThrow(/LLM_PROVIDER.*google.*groq/);
  });
});

import { PROVIDER_REGISTRY, providerNameForDisplay, resolveProviderName } from "./provider";

describe("resolveProviderName", () => {
  it("defaults to google and normalizes case and whitespace", () => {
    expect(resolveProviderName(undefined)).toBe("google");
    expect(resolveProviderName("  ")).toBe("google");
    expect(resolveProviderName(" Groq ")).toBe("groq");
  });

  it("throws on unsupported values", () => {
    expect(() => resolveProviderName("openai")).toThrow(/LLM_PROVIDER/);
  });
});

describe("providerNameForDisplay", () => {
  it("mirrors the resolver and never throws", () => {
    expect(providerNameForDisplay(" GROQ ")).toBe("groq");
    expect(providerNameForDisplay(undefined)).toBe("google");
    expect(providerNameForDisplay("openai")).toBe("unsupported");
  });
});

describe("PROVIDER_REGISTRY", () => {
  it("is the single table that defines a provider", () => {
    for (const name of Object.keys(PROVIDER_REGISTRY) as Array<keyof typeof PROVIDER_REGISTRY>) {
      const entry = PROVIDER_REGISTRY[name];
      expect(entry.defaultModel).toBeTruthy();
      expect(entry.apiKeyVar).toMatch(/_API_KEY$/);
      expect(typeof entry.create).toBe("function");
    }
  });
});

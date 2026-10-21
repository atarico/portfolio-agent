import { describe, expect, it } from "vitest";

import { DEFAULT_MODELS, describeModelChain, resolveModel } from "./provider";

describe("resolveModel", () => {
  it("defaults to Google Gemini when LLM_PROVIDER is unset", () => {
    const resolved = resolveModel({ GOOGLE_GENERATIVE_AI_API_KEY: "test-key" });

    expect(resolved.chain).toEqual([{ provider: "google", modelId: DEFAULT_MODELS.google }]);
    expect(resolved.model.modelId).toBe(DEFAULT_MODELS.google);
  });

  it("switches to Groq when LLM_PROVIDER=groq", () => {
    const resolved = resolveModel({ LLM_PROVIDER: "groq", GROQ_API_KEY: "test-key" });

    expect(resolved.chain).toEqual([{ provider: "groq", modelId: DEFAULT_MODELS.groq }]);
    expect(resolved.model.modelId).toBe(DEFAULT_MODELS.groq);
  });

  it("honors an explicit LLM_MODEL override", () => {
    const resolved = resolveModel({
      LLM_PROVIDER: "groq",
      GROQ_API_KEY: "test-key",
      LLM_MODEL: "qwen/qwen3.6-27b",
    });

    expect(resolved.chain[0]?.modelId).toBe("qwen/qwen3.6-27b");
  });

  it("builds an ordered fallback chain from a comma-separated LLM_PROVIDER", () => {
    const resolved = resolveModel({ LLM_PROVIDER: "groq,google", GROQ_API_KEY: "k1", GOOGLE_GENERATIVE_AI_API_KEY: "k2" });

    expect(resolved.chain).toEqual([
      { provider: "groq", modelId: DEFAULT_MODELS.groq },
      { provider: "google", modelId: DEFAULT_MODELS.google },
    ]);
    expect(resolved.model.provider).toBe("fallback");
    expect(resolved.model.modelId).toBe(`${DEFAULT_MODELS.groq},${DEFAULT_MODELS.google}`);
  });

  it("pins a model per entry with provider:model, and LLM_MODEL fills only a bare first entry", () => {
    const keys = { GROQ_API_KEY: "k1", GOOGLE_GENERATIVE_AI_API_KEY: "k2", LLM_MODEL: "override" };

    expect(
      resolveModel({ ...keys, LLM_PROVIDER: "groq:openai/gpt-oss-20b, google:gemini-3.5-flash-lite" }).chain,
    ).toEqual([
      { provider: "groq", modelId: "openai/gpt-oss-20b" },
      { provider: "google", modelId: "gemini-3.5-flash-lite" },
    ]);
    expect(resolveModel({ ...keys, LLM_PROVIDER: "groq,google" }).chain).toEqual([
      { provider: "groq", modelId: "override" },
      { provider: "google", modelId: DEFAULT_MODELS.google },
    ]);
  });

  it("ignores empty entries in the chain", () => {
    const resolved = resolveModel({ LLM_PROVIDER: " groq , ,Google,", GROQ_API_KEY: "k1", GOOGLE_GENERATIVE_AI_API_KEY: "k2" });

    expect(resolved.chain.map((choice) => choice.provider)).toEqual(["groq", "google"]);
  });

  it("names the missing API key of any entry in the chain", () => {
    expect(() => resolveModel({ LLM_PROVIDER: "groq,google", GROQ_API_KEY: "k1" })).toThrow(
      /GOOGLE_GENERATIVE_AI_API_KEY/,
    );
  });

  it("names the missing API key variable in the error", () => {
    expect(() => resolveModel({})).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
    expect(() => resolveModel({ LLM_PROVIDER: "groq" })).toThrow(/GROQ_API_KEY/);
  });

  it("rejects an unknown provider and lists the supported ones", () => {
    expect(() => resolveModel({ LLM_PROVIDER: "openai" })).toThrow(/LLM_PROVIDER.*google.*groq/);
  });
});

import { PROVIDER_REGISTRY, resolveProviderName } from "./provider";

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

describe("describeModelChain", () => {
  it("lists the providers in fallback order and never throws", () => {
    expect(describeModelChain({ LLM_PROVIDER: " GROQ " })).toBe("groq");
    expect(describeModelChain({})).toBe("google");
    expect(describeModelChain({ LLM_PROVIDER: "groq:openai/gpt-oss-120b,google,google:gemini-3.5-flash-lite" })).toBe(
      "groq → google",
    );
    expect(describeModelChain({ LLM_PROVIDER: "openai" })).toBe("unsupported");
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

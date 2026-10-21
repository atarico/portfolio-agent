import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";

import type { Env } from "@/lib/http/env";

import { createFallbackModel, type FallbackModelOptions, type LanguageModelV4 } from "./fallback";

export type ModelFactory = (apiKey: string) => (modelId: string) => LanguageModelV4;

export interface ProviderEntry {
  /** Free-tier friendly default; override with LLM_MODEL. */
  defaultModel: string;
  /** Environment variable that holds the API key. */
  apiKeyVar: string;
  create: ModelFactory;
}

/**
 * Provider registry: the single table that defines a provider.
 * Adding one is adding one entry here (plus its `@ai-sdk/*` dependency).
 * Swapping the LLM behind the agent is then an environment change
 * (LLM_PROVIDER / LLM_MODEL), never a code change.
 *
 * The Google default is deliberately not the newest Flash: measured on the free
 * tier (2026-10-21), gemini-3.7-flash took 18-40 s per call or failed with 503
 * "high demand", while gemini-3.6-flash answered in 2-3.5 s.
 */
export const PROVIDER_REGISTRY = {
  google: {
    defaultModel: "gemini-3.6-flash",
    apiKeyVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    create: (apiKey) => createGoogleGenerativeAI({ apiKey }),
  },
  groq: {
    defaultModel: "openai/gpt-oss-120b",
    apiKeyVar: "GROQ_API_KEY",
    create: (apiKey) => createGroq({ apiKey }),
  },
} as const satisfies Record<string, ProviderEntry>;

export type ProviderName = keyof typeof PROVIDER_REGISTRY;

export const PROVIDERS = Object.keys(PROVIDER_REGISTRY) as readonly ProviderName[];

export const DEFAULT_PROVIDER: ProviderName = "google";

export const DEFAULT_MODELS: Record<ProviderName, string> = Object.fromEntries(
  PROVIDERS.map((name) => [name, PROVIDER_REGISTRY[name].defaultModel]),
) as Record<ProviderName, string>;

/** One link of the model chain: which provider, which model. */
export interface ModelChoice {
  provider: ProviderName;
  modelId: string;
}

export interface ResolvedModel {
  /** The configured chain, in fallback order. */
  chain: ModelChoice[];
  /** The first model alone, or a wrapper that fails over along the chain. */
  model: LanguageModelV4;
}

/**
 * Resolves `LLM_PROVIDER` into the model the agent calls.
 *
 * `LLM_PROVIDER` is an ordered, comma-separated chain of `provider` or
 * `provider:model` entries, e.g. `groq,google` or
 * `groq:openai/gpt-oss-120b,google:gemini-3.6-flash`. A single entry behaves
 * exactly as before: that provider's model, no wrapper and no timeout (with
 * nowhere to fail over to, abandoning a slow answer would only turn it into an
 * error). `LLM_MODEL` keeps its meaning: it sets the model of the first entry
 * when that entry does not name one.
 *
 * Throws on an unknown provider or a missing API key for any entry: a broken
 * chain is a configuration error to fix, not something to skip silently.
 */
export function resolveModel(env: Env = process.env, fallback: FallbackModelOptions = {}): ResolvedModel {
  const chain = parseModelChain(env);
  const models = chain.map(({ provider, modelId }) =>
    PROVIDER_REGISTRY[provider].create(requireApiKey(env, provider))(modelId),
  );

  return { chain, model: models.length === 1 ? models[0]! : createFallbackModel(models, fallback) };
}

/** Parses `LLM_PROVIDER` (see {@link resolveModel}). Empty entries are ignored. */
export function parseModelChain(env: Env): ModelChoice[] {
  const entries = (env.LLM_PROVIDER ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  if (entries.length === 0) entries.push(DEFAULT_PROVIDER);

  return entries.map((entry, index) => {
    const separator = entry.indexOf(":");
    const provider = resolveProviderName(separator === -1 ? entry : entry.slice(0, separator));
    const pinned = separator === -1 ? "" : entry.slice(separator + 1).trim();
    const override = index === 0 ? env.LLM_MODEL?.trim() : undefined;
    return { provider, modelId: pinned || override || PROVIDER_REGISTRY[provider].defaultModel };
  });
}

/** Normalizes one provider name (trim, lower-case, default) and rejects unknown values. */
export function resolveProviderName(raw: string | undefined): ProviderName {
  const value = (raw?.trim() || DEFAULT_PROVIDER).toLowerCase();
  if (!isProviderName(value)) {
    throw new Error(`Unsupported LLM_PROVIDER "${raw}". Supported values: ${PROVIDERS.join(", ")}.`);
  }
  return value;
}

/** The chain's providers in fallback order, e.g. "groq → google", for display. Never throws. */
export function describeModelChain(env: Env): string {
  try {
    return [...new Set(parseModelChain(env).map((choice) => choice.provider))].join(" → ");
  } catch {
    return "unsupported";
  }
}

function isProviderName(value: string): value is ProviderName {
  return (PROVIDERS as readonly string[]).includes(value);
}

function requireApiKey(env: Env, provider: ProviderName): string {
  const variable = PROVIDER_REGISTRY[provider].apiKeyVar;
  const apiKey = env[variable]?.trim();
  if (!apiKey) {
    throw new Error(`Missing ${variable}. Set it in apps/web/.env.local to use the "${provider}" provider.`);
  }
  return apiKey;
}

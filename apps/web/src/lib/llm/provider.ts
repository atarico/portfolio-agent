import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

type Env = Record<string, string | undefined>;

export type ModelFactory = (apiKey: string) => (modelId: string) => Exclude<LanguageModel, string>;

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
 */
export const PROVIDER_REGISTRY = {
  google: {
    defaultModel: "gemini-3.7-flash",
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

export interface ResolvedModel {
  provider: ProviderName;
  modelId: string;
  model: Exclude<LanguageModel, string>;
}

export function resolveModel(env: Env = process.env): ResolvedModel {
  const provider = resolveProviderName(env.LLM_PROVIDER);
  const entry = PROVIDER_REGISTRY[provider];
  const modelId = env.LLM_MODEL?.trim() || entry.defaultModel;
  const apiKey = requireApiKey(env, provider);

  return { provider, modelId, model: entry.create(apiKey)(modelId) };
}

/** Normalizes LLM_PROVIDER (trim, lower-case, default) and rejects unknown values. */
export function resolveProviderName(raw: string | undefined): ProviderName {
  const value = (raw?.trim() || DEFAULT_PROVIDER).toLowerCase();
  if (!isProviderName(value)) {
    throw new Error(`Unsupported LLM_PROVIDER "${raw}". Supported values: ${PROVIDERS.join(", ")}.`);
  }
  return value;
}

/** Same resolution as the agent, for display surfaces that must not throw. */
export function providerNameForDisplay(raw: string | undefined): ProviderName | "unsupported" {
  try {
    return resolveProviderName(raw);
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

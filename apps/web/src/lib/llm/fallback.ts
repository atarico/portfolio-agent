import type { LanguageModel } from "ai";

/** The provider-spec interface every `@ai-sdk/*` model in the registry implements. */
export type LanguageModelV4 = Extract<Exclude<LanguageModel, string>, { specificationVersion: "v4" }>;

type CallOptions = Parameters<LanguageModelV4["doStream"]>[0];
type StreamResult = Awaited<ReturnType<LanguageModelV4["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;
type GenerateResult = Awaited<ReturnType<LanguageModelV4["doGenerate"]>>;

/**
 * How long an attempt may take to produce its first stream part before the
 * next model gets the step.
 *
 * Measured on the free tiers (2026-10-21): a healthy model starts streaming in
 * 0.5 s (Groq) to 3.5 s (Gemini Flash), while an overloaded one queues the
 * request for 20-40 s or more. 8 s sits well above the first group and well
 * below the second, so a slow model is abandoned long before a visitor gives up.
 */
export const DEFAULT_FIRST_CHUNK_TIMEOUT_MS = 8_000;

export interface FallbackFailure {
  model: string;
  error: unknown;
}

export interface FallbackModelOptions {
  firstChunkTimeoutMs?: number;
  /** Called when a failed attempt hands the step to the next model. Meant for logging. */
  onFallback?: (failure: FallbackFailure, next: string) => void;
}

/** An attempt opened its response but produced no output in time. */
export class FirstChunkTimeoutError extends Error {
  constructor(model: string, timeoutMs: number) {
    super(`${model} produced no output within ${timeoutMs} ms`);
    this.name = "FirstChunkTimeoutError";
  }
}

/** Every model in the chain failed; the message names each one and its error. */
export class AllModelsFailedError extends Error {
  constructor(readonly failures: readonly FallbackFailure[]) {
    super(
      `All ${failures.length} models failed: ` +
        failures.map(({ model, error }) => `${model}: ${errorMessage(error)}`).join("; "),
    );
    this.name = "AllModelsFailedError";
  }
}

/**
 * Wraps an ordered chain of models into one model that fails over.
 *
 * The free tiers fail in ordinary ways - a 503 when a model is in high demand,
 * a 429 when the per-minute token budget is spent, or a request that just sits
 * in a queue - and with a single model each of those is an error in front of
 * the visitor. Here, each call (one agent step) goes to the first model; if it
 * fails before producing any output, the same call is replayed on the next one.
 *
 * Rules:
 * - Only failures before the first output fail over. Once text or a tool call
 *   has streamed, a retry would duplicate it, so a later error passes through.
 *   Reasoning is held back until then: Groq checks a tool call against the
 *   tool's schema only after the model has reasoned, and a mismatch must still
 *   fail over instead of ending the answer.
 * - The caller's abort (the Stop button) is never treated as a model failure.
 * - The model that last succeeded serves the next calls, so a failing model is
 *   not paid for again on every step of the same answer. Create one wrapper
 *   per request to keep that memory scoped to it.
 */
export function createFallbackModel(
  models: readonly LanguageModelV4[],
  { firstChunkTimeoutMs = DEFAULT_FIRST_CHUNK_TIMEOUT_MS, onFallback }: FallbackModelOptions = {},
): LanguageModelV4 {
  if (models.length === 0) throw new Error("createFallbackModel needs at least one model.");

  let current = 0;

  async function failOver<T>(
    callerSignal: AbortSignal | undefined,
    attempt: (model: LanguageModelV4) => Promise<T>,
  ): Promise<T> {
    const failures: FallbackFailure[] = [];
    for (let index = current; index < models.length; index++) {
      const model = models[index]!;
      try {
        const result = await attempt(model);
        current = index;
        return result;
      } catch (error) {
        if (callerSignal?.aborted) throw error;
        failures.push({ model: label(model), error });
        const next = models[index + 1];
        if (next) onFallback?.({ model: label(model), error }, label(next));
      }
    }
    throw new AllModelsFailedError(failures);
  }

  return {
    specificationVersion: "v4",
    provider: "fallback",
    modelId: models.map(label).join(","),
    get supportedUrls() {
      return models[current]!.supportedUrls;
    },
    doGenerate(options: CallOptions): Promise<GenerateResult> {
      return failOver(options.abortSignal, (model) => Promise.resolve(model.doGenerate(options)));
    },
    doStream(options: CallOptions): Promise<StreamResult> {
      return failOver(options.abortSignal, (model) => streamFirstChunk(model, options, firstChunkTimeoutMs));
    },
  };
}

/** Parts that come before a model's output: holding them back keeps a failure after them retryable. */
const BEFORE_OUTPUT = new Set<StreamPart["type"]>([
  "stream-start",
  "response-metadata",
  "reasoning-start",
  "reasoning-delta",
  "reasoning-end",
]);

/**
 * Starts a stream and waits for its first output part (text, a tool call or
 * the finish: anything not in BEFORE_OUTPUT), so a failure or a stall
 * surfaces here, while it can still fail over.
 *
 * The timeout only covers the wait for the model's first part of any kind
 * but `stream-start`, which arrives as soon as the response opens, before the
 * model has produced anything. A model that has started reasoning is alive,
 * so it gets the time it needs.
 */
async function streamFirstChunk(
  model: LanguageModelV4,
  options: CallOptions,
  timeoutMs: number,
): Promise<StreamResult> {
  const attempt = new AbortController();
  const signal = options.abortSignal ? AbortSignal.any([options.abortSignal, attempt.signal]) : attempt.signal;
  const timer = setTimeout(() => attempt.abort(new FirstChunkTimeoutError(label(model), timeoutMs)), timeoutMs);
  let reader: ReadableStreamDefaultReader<StreamPart> | undefined;

  try {
    const result = await untilAborted(Promise.resolve(model.doStream({ ...options, abortSignal: signal })), signal);
    reader = result.stream.getReader();

    const head: StreamPart[] = [];
    let started = false;
    for (;;) {
      const { value, done } = await untilAborted(reader.read(), signal);
      if (done) break;
      if (value.type === "error") throw value.error;
      if (!started && value.type !== "stream-start") {
        started = true;
        clearTimeout(timer);
        // Name the model that served this step. A provider that omits its model id
        // (Gemini does) would otherwise leave the SDK reporting the wrapper's id - the
        // whole chain. A provider that does send one simply restates the same id later.
        head.push({ type: "response-metadata", modelId: model.modelId });
      }
      head.push(value);
      if (!BEFORE_OUTPUT.has(value.type)) break;
    }

    return { ...result, stream: replay(head, reader) };
  } catch (error) {
    // Release the abandoned connection; a timeout is also the more useful error to report.
    if (!attempt.signal.aborted) attempt.abort(error);
    void reader?.cancel(error).catch(() => undefined);
    throw attempt.signal.reason instanceof FirstChunkTimeoutError ? attempt.signal.reason : error;
  } finally {
    clearTimeout(timer);
  }
}

/** Re-emits the parts already read, then the rest of the original stream. */
function replay(head: StreamPart[], reader: ReadableStreamDefaultReader<StreamPart>): ReadableStream<StreamPart> {
  return new ReadableStream<StreamPart>({
    start(controller) {
      for (const part of head) controller.enqueue(part);
    },
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/** Rejects as soon as `signal` aborts, even if `promise` itself ignores the signal. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    // The losing promise may still reject; leaving it unobserved would crash the process.
    promise.catch(() => undefined);
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function label(model: LanguageModelV4): string {
  return model.modelId;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

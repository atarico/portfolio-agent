import { describe, expect, it, vi } from "vitest";

import {
  AllModelsFailedError,
  FirstChunkTimeoutError,
  createFallbackModel,
  type LanguageModelV4,
} from "./fallback";

type CallOptions = Parameters<LanguageModelV4["doStream"]>[0];
type StreamResult = Awaited<ReturnType<LanguageModelV4["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;
type GenerateResult = Awaited<ReturnType<LanguageModelV4["doGenerate"]>>;

const CALL: CallOptions = { prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] };

const START = { type: "stream-start", warnings: [] } as StreamPart;
const answer = (text: string): StreamPart[] => [
  START,
  { type: "text-start", id: "t" } as StreamPart,
  { type: "text-delta", id: "t", delta: text } as StreamPart,
  { type: "text-end", id: "t" } as StreamPart,
];

function streamOf(parts: StreamPart[], { close = true } = {}): ReadableStream<StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      if (close) controller.close();
    },
  });
}

interface FakeModel extends LanguageModelV4 {
  calls: CallOptions[];
}

function fakeModel(
  modelId: string,
  stream: (options: CallOptions) => Promise<StreamResult> | StreamResult,
  generate?: (options: CallOptions) => Promise<GenerateResult>,
): FakeModel {
  const calls: CallOptions[] = [];
  return {
    specificationVersion: "v4",
    provider: `fake.${modelId}`,
    modelId,
    supportedUrls: {},
    calls,
    async doStream(options) {
      calls.push(options);
      return stream(options);
    },
    async doGenerate(options) {
      calls.push(options);
      if (!generate) throw new Error("not implemented");
      return generate(options);
    },
  };
}

const answering = (id: string, text = `from ${id}`) => fakeModel(id, () => ({ stream: streamOf(answer(text)) }));
const throwing = (id: string, message = "503 high demand") =>
  fakeModel(id, () => {
    throw new Error(message);
  });

async function readAll(stream: ReadableStream<StreamPart>): Promise<StreamPart[]> {
  const parts: StreamPart[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return parts;
    parts.push(value);
  }
}

const served = (modelId: string) => ({ type: "response-metadata", modelId }) as StreamPart;

const textOf = (parts: StreamPart[]) =>
  parts.map((part) => (part.type === "text-delta" ? part.delta : "")).join("");

describe("createFallbackModel", () => {
  it("serves the first model and passes its stream through, tagged with the serving model", async () => {
    const primary = answering("primary");
    const secondary = answering("secondary");

    const { stream } = await createFallbackModel([primary, secondary]).doStream(CALL);

    const [start, ...rest] = answer("from primary");
    expect(await readAll(stream)).toEqual([start, served("primary"), ...rest]);
    expect(secondary.calls).toHaveLength(0);
  });

  it("reports the model that actually served the step, not the chain", async () => {
    // Without this, a provider that omits its model id (Gemini does) leaves the SDK
    // reporting the wrapper's id - the whole chain - as the model that answered.
    const { stream } = await createFallbackModel([throwing("primary"), answering("secondary")]).doStream(CALL);

    expect(await readAll(stream)).toContainEqual(served("secondary"));
  });

  it("falls back when the first model fails before streaming (an HTTP error)", async () => {
    const secondary = answering("secondary");

    const { stream } = await createFallbackModel([throwing("primary"), secondary]).doStream(CALL);

    expect(textOf(await readAll(stream))).toBe("from secondary");
  });

  it("falls back when the first model's stream opens with an error part", async () => {
    const primary = fakeModel("primary", () => ({
      stream: streamOf([START, { type: "error", error: new Error("429 rate limited") } as StreamPart]),
    }));

    const { stream } = await createFallbackModel([primary, answering("secondary")]).doStream(CALL);

    expect(textOf(await readAll(stream))).toBe("from secondary");
  });

  it("falls back when the first model produces nothing within the first-chunk budget", async () => {
    // Opens the response and then hangs, like an overloaded model queueing the request.
    const primary = fakeModel("primary", () => ({ stream: streamOf([START], { close: false }) }));
    const onFallback = vi.fn();

    const model = createFallbackModel([primary, answering("secondary")], { firstChunkTimeoutMs: 20, onFallback });
    const { stream } = await model.doStream(CALL);

    expect(textOf(await readAll(stream))).toBe("from secondary");
    expect(onFallback.mock.calls[0]?.[0].error).toBeInstanceOf(FirstChunkTimeoutError);
    // The abandoned attempt's request is cancelled, not left running.
    expect(primary.calls[0]?.abortSignal?.aborted).toBe(true);
  });

  it("never turns the caller's abort (the Stop button) into a fallback", async () => {
    const caller = new AbortController();
    const primary = fakeModel("primary", () => {
      caller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    const secondary = answering("secondary");

    await expect(
      createFallbackModel([primary, secondary]).doStream({ ...CALL, abortSignal: caller.signal }),
    ).rejects.toThrow(/aborted/);
    expect(secondary.calls).toHaveLength(0);
  });

  it("starts later calls at the model that last succeeded", async () => {
    const primary = throwing("primary");
    const secondary = answering("secondary");
    const model = createFallbackModel([primary, secondary]);

    await readAll((await model.doStream(CALL)).stream);
    await readAll((await model.doStream(CALL)).stream);

    expect(primary.calls).toHaveLength(1);
    expect(secondary.calls).toHaveLength(2);
  });

  it("reports every attempt when all models fail", async () => {
    const model = createFallbackModel([throwing("primary", "503 high demand"), throwing("secondary", "429 TPM")]);

    const failure = await Promise.resolve(model.doStream(CALL)).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AllModelsFailedError);
    expect((failure as Error).message).toMatch(/primary: 503 high demand.*secondary: 429 TPM/);
  });

  it("does not retry an error that arrives after the answer started", async () => {
    const midStreamError = { type: "error", error: new Error("connection reset") } as StreamPart;
    const primary = fakeModel("primary", () => ({ stream: streamOf([...answer("partial"), midStreamError]) }));
    const secondary = answering("secondary");

    const { stream } = await createFallbackModel([primary, secondary]).doStream(CALL);

    const [start, ...rest] = answer("partial");
    expect(await readAll(stream)).toEqual([start, served("primary"), ...rest, midStreamError]);
    expect(secondary.calls).toHaveLength(0);
  });

  it("falls back in doGenerate too", async () => {
    const result = { content: [{ type: "text", text: "generated" }] } as unknown as GenerateResult;
    const secondary = fakeModel("secondary", () => ({ stream: streamOf([]) }), async () => result);

    await expect(createFallbackModel([throwing("primary"), secondary]).doGenerate(CALL)).resolves.toBe(result);
  });

  it("requires at least one model", () => {
    expect(() => createFallbackModel([])).toThrow(/at least one model/);
  });
});

import { resolveOwner } from "@portfolio-agent/mcp-server";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  pruneMessages,
  streamText,
  toUIMessageStream,
} from "ai";

import { MAX_AGENT_STEPS, MAX_OUTPUT_TOKENS, buildInstructions, stepSettings } from "@/lib/agent/instructions";
import { answerMetadata } from "@/lib/chat/metadata";
import { PUBLIC_ROUTE_BUDGET, createRateLimiter, type RateLimiter } from "@/lib/chat/rate-limit";
import { parseChatRequest } from "@/lib/chat/request";
import type { Env } from "@/lib/http/env";
import { clientErrorMessage, describeError, messageOf } from "@/lib/http/errors";
import { applyPublicGuards } from "@/lib/http/guards";
import { resolveModel } from "@/lib/llm/provider";
import { connectPortfolioMcp } from "@/lib/mcp/client";

/** Streaming plus a few tool round-trips can exceed the default 10s limit. */
export const maxDuration = 60;

export interface ChatRouteDeps {
  env?: Env;
  limiter?: RateLimiter;
}

/**
 * Dependency-injected route handler, mirroring `/api/mcp`: tests build their
 * own instance with an injected limiter and env; production binds one
 * default instance below. This is what makes the shared guard floor
 * (`applyPublicGuards`) assertable without mutating `process.env` or
 * sharing rate-limiter state across test cases.
 *
 * Agent loop: the model decides which MCP tools to call, the AI SDK executes
 * them through the MCP client and feeds results back, until the model
 * answers or the step budget is spent. Each step goes to the first healthy
 * model of the `LLM_PROVIDER` chain (see `resolveModel`).
 */
export function createChatRouteHandler(deps: ChatRouteDeps = {}): (request: Request) => Promise<Response> {
  const env = deps.env ?? process.env;
  const limiter = deps.limiter ?? createRateLimiter(PUBLIC_ROUTE_BUDGET);

  return async function POST(request: Request): Promise<Response> {
    const denied = applyPublicGuards(request, { limiter, env });
    if (denied) return denied;

    const parsed = parseChatRequest(await request.json().catch(() => null));
    if (!parsed.ok) {
      return Response.json(describeError(parsed.issues.join("; "), { code: "invalid_request", env }), {
        status: 400,
      });
    }

    let resolved: ReturnType<typeof resolveModel>;
    let owner: string;
    try {
      // One resolution per request: the fallback wrapper remembers which model last
      // answered, and that memory must not leak into another visitor's request.
      resolved = resolveModel(env, {
        onFallback: ({ model, error }, next) =>
          console.warn(`[chat] ${model} failed (${messageOf(error)}); falling back to ${next}.`),
      });
      owner = resolveOwner(env);
    } catch (error) {
      console.error("[chat] configuration error:", error);
      return Response.json(describeError(messageOf(error), { code: "provider_unconfigured", env }), {
        status: 500,
      });
    }

    let connection: Awaited<ReturnType<typeof connectPortfolioMcp>>;
    try {
      connection = await connectPortfolioMcp({ owner });
    } catch (error) {
      console.error("[chat] MCP connection failed:", error);
      return Response.json(describeError(messageOf(error), { code: "upstream_failure", env }), { status: 500 });
    }

    try {
      const tools = await connection.tools();

      const startedAt = Date.now();
      const result = streamText({
        model: resolved.model,
        instructions: buildInstructions(owner),
        // Trust boundary: `parsed.messages` is client-authored history, and
        // `convertToModelMessages` replays it unverified. Pruning narrows what that
        // history can carry into the model: every tool call, tool result and
        // reasoning part before the latest user message is dropped, so a "tool
        // result" fabricated by the client never reaches the model - only the
        // conversation's text does. A forged assistant *answer* still can, which is
        // acceptable only because the MCP tools reached from here are read-only and
        // pinned to the server-configured `owner` (see `resolveOwner`): forged text can
        // mislead the model, but it cannot widen what it may call or redirect a call
        // to another owner's data. If a tool ever becomes write-capable or accepts a
        // caller-supplied target, revisit this (server-side sessions or signed history).
        //
        // It is also the main token saving on long conversations: earlier answers
        // already summarize their tool results, and replaying those raw payloads on
        // every turn would spend the free tier's per-minute token budget on them.
        messages: pruneMessages({
          messages: await convertToModelMessages(parsed.messages),
          reasoning: "before-last-message",
          toolCalls: "before-last-message",
        }),
        tools,
        stopWhen: isStepCount(MAX_AGENT_STEPS),
        prepareStep: ({ stepNumber }) => stepSettings(stepNumber),
        // Per model call, so one answer costs at most MAX_AGENT_STEPS times this.
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // No retries. The SDK's default is 2, and its backoff only honours a
        // Retry-After *header*; the free tiers this runs on report their wait in
        // the error body instead, so the retries fire at 2s and 4s against a
        // window that needs 20+. They cannot succeed, and each attempt spends
        // another request from a per-minute budget of 20 - turning one failed
        // answer into three. Failing once, immediately, with a message the user
        // can act on beats stalling six seconds to fail anyway at triple cost.
        // Recovery from a failing model is the fallback chain's job instead: it
        // moves the step to the next model at once rather than retrying a model
        // that just said it is out of quota (see `createFallbackModel`).
        maxRetries: 0,
        // Deciding which tool to call does not need long deliberation, and reasoning
        // tokens are latency the visitor waits through on every step. Each provider
        // maps this to its own knob (Gemini thinkingLevel, Groq reasoning_effort).
        reasoning: "low",
        // Propagates the client's Stop button (and any client-side disconnect) to the
        // agent loop and the LLM stream, instead of letting server-side work (further
        // MCP/GitHub calls, further generation) run to completion or maxDuration on a
        // request the client already abandoned — both providers are free-tier and
        // rate-limited, so an unbounded abandoned request burns quota for nothing.
        abortSignal: request.signal,
        // Running out of steps is not an error: the agent stops and answers with
        // whatever it gathered so far. Nothing else in the pipeline can tell that
        // apart from a complete answer, so without this the operator learns about
        // a truncated reasoning chain only if a visitor happens to mention it.
        onFinish: ({ steps }) => {
          if (steps.length >= MAX_AGENT_STEPS) {
            console.warn(
              `[chat] step budget exhausted: answered after ${steps.length} of ${MAX_AGENT_STEPS} steps. ` +
                "The answer may be incomplete - the model still wanted to work.",
            );
          }
        },
        onEnd: connection.close,
        onError: ({ error }) => {
          console.error("[chat] stream error:", error);
          void connection.close();
        },
      });

      return createUIMessageStreamResponse({
        stream: toUIMessageStream({
          stream: result.stream,
          messageMetadata: ({ part }) => answerMetadata(part, startedAt),
          onError: (error) => clientErrorMessage(error, env),
        }),
      });
    } catch (error) {
      await connection.close();
      console.error("[chat] request failed:", error);
      return Response.json(describeError(messageOf(error), { code: "upstream_failure", env }), { status: 500 });
    }
  };
}

const defaultHandler = createChatRouteHandler();

export function POST(request: Request): Promise<Response> {
  return defaultHandler(request);
}

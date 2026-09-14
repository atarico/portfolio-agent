import { resolveOwner } from "@portfolio-agent/mcp-server";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";

import { MAX_AGENT_STEPS, buildInstructions } from "@/lib/agent/instructions";
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
 * answers or the step budget is spent.
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
      resolved = resolveModel();
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

      const result = streamText({
        model: resolved.model,
        instructions: buildInstructions(owner),
        // Trust boundary: `parsed.messages` is client-authored history. The client controls
        // the whole conversation it sends back, including assistant turns and tool-call
        // results (a caller can fabricate a "tool result" that the server never produced),
        // and `convertToModelMessages` replays all of it into the model context unverified.
        // This is acceptable only because the MCP tools reached from this context are
        // read-only and pinned to the server-configured `owner` above (see `resolveOwner`):
        // a fabricated tool result can mislead the model about what a tool returned, but it
        // cannot widen what the model is allowed to call or redirect a call to another
        // owner's data. If any tool ever becomes write-capable or accepts a caller-supplied
        // target (owner, repo, path, ...) instead of a server-pinned one, this trust boundary
        // must be revisited (e.g. with server-side session state or signed history).
        messages: await convertToModelMessages(parsed.messages),
        tools,
        stopWhen: isStepCount(MAX_AGENT_STEPS),
        // No retries. The SDK's default is 2, and its backoff only honours a
        // Retry-After *header*; the free tiers this runs on report their wait in
        // the error body instead, so the retries fire at 2s and 4s against a
        // window that needs 20+. They cannot succeed, and each attempt spends
        // another request from a per-minute budget of 20 - turning one failed
        // answer into three. Failing once, immediately, with a message the user
        // can act on beats stalling six seconds to fail anyway at triple cost.
        // The trade is losing automatic recovery from a transient 5xx; a person
        // watching a chat can press enter again, and that costs one unit.
        maxRetries: 0,
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

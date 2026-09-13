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
        messages: await convertToModelMessages(parsed.messages),
        tools,
        stopWhen: isStepCount(MAX_AGENT_STEPS),
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

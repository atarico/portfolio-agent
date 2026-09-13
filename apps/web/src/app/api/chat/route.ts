import { resolveOwner } from "@portfolio-agent/mcp-server";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";

import { MAX_AGENT_STEPS, buildInstructions } from "@/lib/agent/instructions";
import { clientKeyFromHeaders, createRateLimiter } from "@/lib/chat/rate-limit";
import { parseChatRequest } from "@/lib/chat/request";
import { clientErrorMessage, describeError } from "@/lib/http/errors";
import { resolveModel } from "@/lib/llm/provider";
import { connectPortfolioMcp } from "@/lib/mcp/client";

/** Streaming plus a few tool round-trips can exceed the default 10s limit. */
export const maxDuration = 60;

/** Per-client budget: 20 questions per 10 minutes (see rate-limit.ts for the caveats). */
const limiter = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 });

/**
 * Agent loop: the model decides which MCP tools to call, the AI SDK executes
 * them through the MCP client and feeds results back, until the model
 * answers or the step budget is spent.
 */
export async function POST(request: Request): Promise<Response> {
  const quota = limiter.check(clientKeyFromHeaders(request.headers));
  if (!quota.allowed) {
    return Response.json(describeError(null, { code: "rate_limited" }), {
      status: 429,
      headers: { "Retry-After": String(quota.retryAfterSeconds) },
    });
  }

  const parsed = parseChatRequest(await request.json().catch(() => null));
  if (!parsed.ok) {
    return Response.json(describeError(parsed.issues.join("; "), { code: "invalid_request" }), { status: 400 });
  }

  let resolved: ReturnType<typeof resolveModel>;
  let owner: string;
  try {
    resolved = resolveModel();
    owner = resolveOwner(process.env);
  } catch (error) {
    console.error("[chat] configuration error:", error);
    return Response.json(describeError(error, { code: "provider_unconfigured" }), { status: 500 });
  }

  let connection: Awaited<ReturnType<typeof connectPortfolioMcp>>;
  try {
    connection = await connectPortfolioMcp({ owner });
  } catch (error) {
    console.error("[chat] MCP connection failed:", error);
    return Response.json(describeError(error, { code: "upstream_failure" }), { status: 500 });
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
        onError: (error) => clientErrorMessage(error),
      }),
    });
  } catch (error) {
    await connection.close();
    console.error("[chat] request failed:", error);
    return Response.json(describeError(error, { code: "upstream_failure" }), { status: 500 });
  }
}

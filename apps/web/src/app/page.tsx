import { resolveOwner } from "@portfolio-agent/mcp-server";

import { Chat } from "@/components/chat/chat";
import { describeModelChain } from "@/lib/llm/provider";

export default function HomePage() {
  const owner = resolveOwner(process.env);
  const models = describeModelChain(process.env);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 sm:px-8">
      <header className="rise pt-8 sm:pt-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-signal-ink">
              Live agent · MCP tools · GitHub
            </p>
            <h1 className="mt-2 font-display text-[44px] leading-[0.95] tracking-[-0.02em] sm:text-6xl">
              Portfolio Agent
            </h1>
          </div>
          <dl className="flex flex-col gap-1 font-mono text-[11.5px] sm:items-end">
            <div className="flex gap-3">
              <dt className="text-ink-faint">models</dt>
              <dd className="text-ink">{models}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="text-ink-faint">mcp</dt>
              <dd className="text-ink">/api/mcp</dd>
            </div>
          </dl>
        </div>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-soft">
          An LLM agent that answers questions about{" "}
          <a
            className="font-medium text-ink underline decoration-signal/50 underline-offset-[3px] hover:decoration-signal"
            href={`https://github.com/${owner}`}
            target="_blank"
            rel="noreferrer"
          >
            github.com/{owner}
          </a>{" "}
          by reading the repositories live, and shows every tool it calls.
        </p>
        <div aria-hidden className="mt-6 border-t border-rule-strong" />
        <div aria-hidden className="mt-[3px] border-t border-rule" />
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <Chat owner={owner} />
      </main>
    </div>
  );
}

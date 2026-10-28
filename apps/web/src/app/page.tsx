import { resolveOwner } from "@portfolio-agent/mcp-server";
import type { Metadata } from "next";

import { Chat } from "@/components/chat/chat";
import { describeModelChain } from "@/lib/llm/provider";
import { ownerDisplayName } from "@/lib/owner-name";
import { riseDelay } from "@/lib/rise-delay";

export function generateMetadata(): Metadata {
  return { title: `${ownerDisplayName(resolveOwner(process.env))} · Portfolio Agent` };
}

export default function HomePage() {
  const owner = resolveOwner(process.env);
  const name = ownerDisplayName(owner);
  const models = describeModelChain(process.env);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 sm:px-8">
      <a
        href="#chat"
        className="sr-only rounded-md bg-signal font-mono text-[12px] text-on-signal focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-3 focus:py-2"
      >
        Skip to the chat
      </a>
      <header className="pt-8 sm:pt-14">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="rise text-[12px] tracking-[0.06em] text-ink-faint" style={riseDelay(0)} translate="no">
              {"// portfolio-agent.init()"}
            </p>
            {/* One heading, read as "Portfolio Agent for <name>": the name is the headline. */}
            <h1 className="mt-3">
              <span className="rise flex items-center text-[15px] text-ink sm:text-[17px]" style={riseDelay(120)}>
                <span aria-hidden className="glow font-bold text-signal">
                  &gt;&nbsp;
                </span>
                Portfolio Agent for
              </span>
              <span
                className="rise glow-lg mt-1 block text-[42px] leading-[1.02] font-bold tracking-[-0.025em] text-balance text-signal sm:text-[64px]"
                style={riseDelay(220)}
                translate="no"
              >
                {name}
              </span>
            </h1>
            <p aria-hidden className="rise mt-4 text-[13px] text-ink-soft" style={riseDelay(320)} translate="no">
              <span className="glow text-signal">$</span> ask --about <span className="text-ink">{owner}</span>
              <span className="cursor-blink ml-1 font-bold text-signal">_</span>
            </p>
          </div>
          <dl className="rise flex flex-col gap-1 text-[11.5px] sm:items-end" style={riseDelay(320)} translate="no">
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
        <p className="rise mt-6 max-w-xl text-[14px] leading-relaxed text-ink-soft" style={riseDelay(400)}>
          An LLM agent that answers questions about{" "}
          <a
            className="text-ink underline decoration-signal/50 underline-offset-[3px] hover:text-signal hover:decoration-signal"
            href={`https://github.com/${owner}`}
            target="_blank"
            rel="noreferrer"
            translate="no"
          >
            github.com/{owner}
          </a>{" "}
          and their CV, reading the repositories live, and shows every tool it calls.
        </p>
        <TerminalBar owner={owner} />
      </header>
      <main id="chat" className="flex min-h-0 flex-1 flex-col">
        <Chat owner={owner} />
      </main>
    </div>
  );
}

/** The window chrome the chat sits under, as on the portfolio's terminal panels. */
function TerminalBar({ owner }: { owner: string }) {
  return (
    <div
      aria-hidden
      className="rise mt-8 flex items-center gap-2 rounded-t-lg border border-rule bg-paper-raised px-3 py-2"
      style={riseDelay(460)}
    >
      <span className="size-[11px] rounded-full bg-[#ff5f56]" />
      <span className="size-[11px] rounded-full bg-[#ffbd2e]" />
      <span className="size-[11px] rounded-full bg-[#27c93f]" />
      <span className="ml-2 truncate text-[11.5px] text-ink-faint" translate="no">
        {owner}@portfolio-agent: ~
      </span>
    </div>
  );
}

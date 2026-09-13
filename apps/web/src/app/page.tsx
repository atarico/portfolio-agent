import { resolveOwner } from "@portfolio-agent/mcp-server";

import { Chat } from "@/components/chat/chat";
import { providerNameForDisplay } from "@/lib/llm/provider";

export default function HomePage() {
  const owner = resolveOwner(process.env);
  const provider = providerNameForDisplay(process.env.LLM_PROVIDER);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 sm:px-6">
      <header className="flex items-baseline justify-between gap-4 border-b border-zinc-200 py-5 dark:border-zinc-800">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Portfolio Agent</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            LLM agent + MCP server over{" "}
            <a
              className="underline underline-offset-2 hover:text-zinc-800 dark:hover:text-zinc-200"
              href={`https://github.com/${owner}`}
              target="_blank"
              rel="noreferrer"
            >
              github.com/{owner}
            </a>
          </p>
        </div>
        <dl className="hidden text-right font-mono text-xs text-zinc-500 sm:block dark:text-zinc-400">
          <div>
            <dt className="inline">llm </dt>
            <dd className="inline">{provider}</dd>
          </div>
          <div>
            <dt className="inline">mcp </dt>
            <dd className="inline">/api/mcp</dd>
          </div>
        </dl>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <Chat owner={owner} />
      </main>
    </div>
  );
}

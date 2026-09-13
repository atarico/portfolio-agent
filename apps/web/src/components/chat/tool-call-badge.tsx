import type { ToolPartState, ToolPartView } from "@/lib/chat/tool-parts";

interface ToolCallBadgeProps {
  tool: ToolPartView;
}

const STATE_LABEL: Record<ToolPartState, string> = {
  "input-streaming": "preparing",
  "input-available": "running",
  "output-available": "done",
  "output-error": "failed",
  "output-denied": "denied",
  "approval-requested": "awaiting approval",
  "approval-responded": "responded",
};

const STATE_DOT: Record<ToolPartState, string> = {
  "input-streaming": "bg-amber-400 animate-pulse",
  "input-available": "bg-amber-400 animate-pulse",
  "output-available": "bg-emerald-500",
  "output-error": "bg-red-500",
  "output-denied": "bg-zinc-400",
  "approval-requested": "bg-sky-500",
  "approval-responded": "bg-violet-500",
};

const MAX_PREVIEW_CHARS = 2_000;

/** Shows which MCP tool the agent called, its status, and the raw payloads on demand. */
export function ToolCallBadge({ tool }: ToolCallBadgeProps) {
  return (
    <details className="group rounded-lg border border-zinc-200 bg-zinc-50 text-xs dark:border-zinc-800 dark:bg-zinc-950">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 font-mono">
        <span className={`inline-block size-2 rounded-full ${STATE_DOT[tool.state]}`} aria-hidden />
        <span className="font-semibold">{tool.name}</span>
        <span className="text-zinc-500">{STATE_LABEL[tool.state]}</span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <Payload label="input" value={tool.input} />
        {tool.state === "output-error" ? (
          <Payload label="error" value={tool.errorText} />
        ) : (
          <Payload label="output" value={tool.output} />
        )}
      </div>
    </details>
  );
}

function Payload({ label, value }: { label: string; value: unknown }) {
  if (value === undefined) return null;

  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const preview = text.length > MAX_PREVIEW_CHARS ? `${text.slice(0, MAX_PREVIEW_CHARS)}\n…` : text;

  return (
    <div>
      <div className="mb-1 uppercase tracking-wide text-zinc-500">{label}</div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-snug">
        {preview}
      </pre>
    </div>
  );
}

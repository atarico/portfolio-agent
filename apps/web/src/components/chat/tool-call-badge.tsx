import { formatToolArgs, type ToolPartState, type ToolPartView } from "@/lib/chat/tool-parts";

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

const MAX_PREVIEW_CHARS = 2_000;

/**
 * One line of the agent's trace: the MCP tool it called, with its arguments,
 * and its status. The raw input and output open on demand.
 */
export function ToolCallBadge({ tool }: ToolCallBadgeProps) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 py-1.5 font-mono text-[12.5px] select-none [&::-webkit-details-marker]:hidden">
        <StatusGlyph state={tool.state} />
        <span className="min-w-0 truncate" translate="no">
          <span className="font-medium text-ink">{tool.name}</span>
          <span className="text-ink-faint">({formatToolArgs(tool.input)})</span>
        </span>
        <span className="ml-auto shrink-0 text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
          {STATE_LABEL[tool.state]}
        </span>
        <span aria-hidden className="shrink-0 text-ink-faint transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="mt-1 mb-2 flex flex-col gap-3 rounded-lg border border-rule bg-paper px-3 py-3">
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

function StatusGlyph({ state }: { state: ToolPartState }) {
  if (state === "input-streaming" || state === "input-available") {
    return (
      <span
        aria-hidden
        className="inline-block size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-signal border-t-transparent motion-reduce:animate-none"
      />
    );
  }
  if (state === "output-available") {
    return (
      <span aria-hidden className="w-3 shrink-0 text-center text-ok">
        ✓
      </span>
    );
  }
  if (state === "output-error") {
    return (
      <span aria-hidden className="w-3 shrink-0 text-center text-bad">
        ✕
      </span>
    );
  }
  return <span aria-hidden className="mx-[3px] inline-block size-1.5 shrink-0 rounded-full bg-ink-faint" />;
}

function Payload({ label, value }: { label: string; value: unknown }) {
  if (value === undefined) return null;

  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const preview = text.length > MAX_PREVIEW_CHARS ? `${text.slice(0, MAX_PREVIEW_CHARS)}\n…` : text;

  return (
    <div>
      <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-faint">{label}</div>
      <pre className="max-h-64 overflow-auto font-mono text-[11.5px] leading-snug break-words whitespace-pre-wrap text-ink-soft">
        {preview}
      </pre>
    </div>
  );
}

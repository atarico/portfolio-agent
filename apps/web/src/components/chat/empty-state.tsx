import type { CSSProperties } from "react";

interface EmptyStateProps {
  owner: string;
  onPick: (text: string) => void;
}

/** Questions verified against the live agent; the tag says what each one shows off. */
const suggestionsFor = (owner: string) => [
  { tag: "recent work", text: "Which projects are the most recent?" },
  { tag: "stack", text: "What stack does the portfolio-agent repo use?" },
  { tag: "collaboration", text: `Which other people's projects has ${owner} contributed to?` },
  { tag: "search", text: "Which repositories use Next.js?" },
  { tag: "cv, en español", text: `¿Qué experiencia laboral tiene ${owner}?` },
];

const STEPS = [
  { title: "You ask", body: "in plain language, in English or Spanish." },
  {
    title: "The agent picks tools",
    body: "list_repos, get_readme, detect_stack, list_contributions and get_profile, served over MCP.",
  },
  { title: "It answers from GitHub and the CV", body: "with live data, and shows every call it made." },
];

const delay = (ms: number) => ({ "--rise-delay": `${ms}ms` }) as CSSProperties;

export function EmptyState({ owner, onPick }: EmptyStateProps) {
  return (
    <section className="grid flex-1 content-center gap-10 py-10 sm:grid-cols-12 sm:gap-8 sm:py-14">
      <div className="rise sm:col-span-5" style={delay(80)}>
        <h2 className="font-display text-[34px] leading-[1.05] tracking-[-0.015em] text-balance sm:text-[40px]">
          What has{" "}
          <em className="text-signal-ink" translate="no">
            {owner}
          </em>{" "}
          been building?
        </h2>
        <ol className="mt-8 flex flex-col gap-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="grid grid-cols-[2rem_1fr]">
              <span className="pt-0.5 font-mono text-[11px] text-signal-ink">0{index + 1}</span>
              <span className="text-sm leading-snug text-ink-soft">
                <span className="font-medium text-ink">{step.title}</span> {step.body}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="sm:col-span-7">
        <p className="rise font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint" style={delay(140)}>
          Try asking
        </p>
        <ul className="mt-3 border-b border-rule">
          {suggestionsFor(owner).map((suggestion, index) => (
            <li key={suggestion.text} className="rise" style={delay(200 + index * 70)}>
              <button
                type="button"
                className="group flex w-full items-baseline gap-4 border-t border-rule py-4 text-left transition-colors hover:border-ink"
                onClick={() => onPick(suggestion.text)}
              >
                <span className="w-6 shrink-0 font-mono text-[11px] text-ink-faint">Q{index + 1}</span>
                <span className="flex-1 text-[16px] leading-snug text-ink transition-colors group-hover:text-signal-ink sm:text-[17px]">
                  {suggestion.text}
                </span>
                <span className="hidden font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-faint sm:inline">
                  {suggestion.tag}
                </span>
                <span
                  aria-hidden
                  className="text-ink-faint transition-transform group-hover:translate-x-1 group-hover:text-signal"
                >
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

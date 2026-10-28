import { riseDelay } from "@/lib/rise-delay";

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
    body: "list_repos, get_readme, detect_stack, list_contributions, list_activity and get_profile, served over MCP.",
  },
  { title: "It answers from GitHub and the CV", body: "with live data, and shows every call it made." },
];

export function EmptyState({ owner, onPick }: EmptyStateProps) {
  return (
    <section className="grid flex-1 content-center gap-10 py-10 sm:grid-cols-12 sm:gap-8 sm:py-14">
      <div className="rise sm:col-span-5" style={riseDelay(80)}>
        <h2 className="text-[26px] leading-[1.15] font-bold tracking-[-0.015em] text-balance sm:text-[30px]">
          What has{" "}
          <span className="glow text-signal" translate="no">
            {owner}
          </span>{" "}
          been building?
        </h2>
        <ol className="mt-8 flex flex-col gap-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="grid grid-cols-[2rem_1fr]">
              <span className="pt-0.5 text-[11px] text-signal">0{index + 1}</span>
              <span className="text-[13px] leading-snug text-ink-soft">
                <span className="font-medium text-ink">{step.title}</span> {step.body}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="sm:col-span-7">
        <p className="rise text-[12px] tracking-[0.06em] text-ink-faint" style={riseDelay(140)}>
          {"// try asking"}
        </p>
        <ul className="mt-3 border-b border-rule">
          {suggestionsFor(owner).map((suggestion, index) => (
            <li key={suggestion.text} className="rise" style={riseDelay(200 + index * 70)}>
              <button
                type="button"
                className="group flex w-full items-baseline gap-3 border-t border-rule py-4 text-left transition-colors hover:border-signal/40"
                onClick={() => onPick(suggestion.text)}
              >
                <span aria-hidden className="shrink-0 text-[13px] text-ink-faint transition-colors group-hover:text-signal">
                  $
                </span>
                <span className="flex-1 text-[15px] leading-snug text-ink transition-colors group-hover:text-signal sm:text-[16px]">
                  {suggestion.text}
                </span>
                <span className="hidden text-[11px] text-ink-faint sm:inline"># {suggestion.tag}</span>
                <span
                  aria-hidden
                  className="text-ink-faint transition-transform group-hover:translate-x-1 group-hover:text-signal"
                >
                  ↵
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

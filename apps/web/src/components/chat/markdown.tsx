import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Element renderers for model output.
 *
 * Styling is declared per element rather than through a typography plugin: the
 * answers use a small, known subset of Markdown (paragraphs, lists, links,
 * emphasis, code), and spelling that subset out keeps the bubble's own type
 * scale instead of inheriting a second one.
 */
const components: Components = {
  p: ({ children }) => <p className="text-[15px] leading-relaxed">{children}</p>,

  // Model-authored links point outward, so they open in a new tab and carry
  // rel="noopener noreferrer": the target must never reach window.opener.
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-signal-ink underline decoration-signal/40 underline-offset-[3px] hover:decoration-signal"
    >
      {children}
    </a>
  ),

  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,

  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 text-[15px] leading-relaxed marker:text-signal">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5 text-[15px] leading-relaxed marker:font-mono marker:text-[13px] marker:text-ink-faint">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,

  h1: ({ children }) => <h2 className="font-display text-lg tracking-[-0.01em]">{children}</h2>,
  h2: ({ children }) => <h2 className="font-display text-lg tracking-[-0.01em]">{children}</h2>,
  h3: ({ children }) => <h3 className="text-[15px] font-semibold">{children}</h3>,

  // Inline code is mostly repository and package names: identifiers a browser
  // translating the page must leave alone.
  code: ({ children }) => (
    <code translate="no" className="rounded border border-rule bg-paper px-1 py-0.5 font-mono text-[13px] text-ink">
      {children}
    </code>
  ),

  // Code blocks scroll on their own so a long line cannot widen the bubble.
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-lg border border-rule bg-paper p-3 font-mono text-[13px] leading-relaxed">
      {children}
    </pre>
  ),

  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-signal pl-3 text-ink-soft">
      {children}
    </blockquote>
  ),

  hr: () => <hr className="border-rule" />,

  // Tables come from remark-gfm; they scroll rather than stretch the bubble.
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-lg border border-rule">
      <table className="w-full border-collapse text-left text-sm tabular-nums">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-rule bg-paper px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink-soft">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b border-rule/60 px-3 py-2 align-top">{children}</td>,
};

interface MarkdownProps {
  children: string;
}

/**
 * Renders an assistant answer as Markdown.
 *
 * The model formats its answers in Markdown whether or not it is asked to, so
 * rendering it is what makes repository links clickable - the point of the
 * whole agent - instead of printing the link syntax as characters.
 *
 * Raw HTML is deliberately not enabled. README text reaches this component by
 * way of the model, so treating that text as markup would turn a third-party
 * README into an injection surface. Without `rehype-raw`, react-markdown emits
 * any embedded HTML as literal text, which is the safe default and stays that
 * way as long as nobody adds that plugin.
 */
export function Markdown({ children }: MarkdownProps) {
  return (
    <div className="flex flex-col gap-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

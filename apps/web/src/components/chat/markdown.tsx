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
      className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
    >
      {children}
    </a>
  ),

  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,

  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 text-[15px] leading-relaxed">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5 text-[15px] leading-relaxed">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,

  h1: ({ children }) => <h2 className="text-base font-semibold">{children}</h2>,
  h2: ({ children }) => <h2 className="text-base font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="text-[15px] font-semibold">{children}</h3>,

  code: ({ children }) => (
    <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[13px] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
      {children}
    </code>
  ),

  // Code blocks scroll on their own so a long line cannot widen the bubble.
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-lg bg-zinc-100 p-3 font-mono text-[13px] leading-relaxed dark:bg-zinc-800">
      {children}
    </pre>
  ),

  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-zinc-300 pl-3 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
      {children}
    </blockquote>
  ),

  hr: () => <hr className="border-zinc-200 dark:border-zinc-800" />,

  // Tables come from remark-gfm; they scroll rather than stretch the bubble.
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-zinc-200 py-1 pr-3 font-semibold dark:border-zinc-800">{children}</th>,
  td: ({ children }) => <td className="border-b border-zinc-100 py-1 pr-3 dark:border-zinc-900">{children}</td>,
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

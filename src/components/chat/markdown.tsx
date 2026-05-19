import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Markdown renderer for assistant messages.
 * Uses semantic tokens; no @tailwindcss/typography dependency.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("min-w-0 text-sm leading-relaxed text-foreground [overflow-wrap:anywhere] break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0 whitespace-pre-wrap">{children}</p>,
          h1: ({ children }) => <h1 className="mt-4 mb-2 text-lg font-semibold">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-4 mb-2 text-base font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-3 mb-1.5 text-sm font-semibold">{children}</h3>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="leading-snug">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-primary/40 pl-3 text-muted-foreground italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-white/10" />,
          code: ({ className, children, ...props }: any) => {
            const inline = !className?.includes("language-");
            if (inline) {
              return (
                <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[0.85em]" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={cn("font-mono text-[0.85em]", className)} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-3 overflow-x-auto rounded-lg border border-white/10 bg-muted/40 p-3 text-xs">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-white/10">
              <table className="min-w-full text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/40">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-white/5">{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => <th className="px-3 py-2 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 align-top">{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

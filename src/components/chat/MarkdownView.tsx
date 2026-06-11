"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  text: string;
}

export function MarkdownView({ text }: Props) {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: (props) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            />
          ),
          code: ({ children, className, ...rest }) => {
            const isBlock = /language-/.test(className ?? "");
            if (!isBlock) {
              return (
                <code
                  className="rounded-xs bg-ink-100 px-1 py-0.5 font-mono text-[0.85em] text-ink-800"
                  {...rest}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={`${className ?? ""} font-mono text-2xs`} {...rest}>
                {children}
              </code>
            );
          },
          pre: ({ children, ...rest }) => (
            <pre
              {...rest}
              className="my-2 overflow-x-auto rounded-md border border-ink-150 bg-ink-50 p-2.5 font-mono text-2xs leading-relaxed text-ink-800"
            >
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="min-w-full border-collapse text-2xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-ink-200 bg-ink-50 px-2 py-1 text-start font-medium text-ink-700">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-ink-100 px-2 py-1 align-top text-ink-700">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-s-2 border-accent/50 bg-accent/5 ps-3 py-0.5 text-ink-600">
              {children}
            </blockquote>
          ),
          ul: ({ children }) => <ul className="my-1.5 ms-4 list-disc space-y-0.5">{children}</ul>,
          ol: ({ children }) => (
            <ol className="my-1.5 ms-4 list-decimal space-y-0.5">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          h1: ({ children }) => (
            <h3 className="mt-2 mb-1 text-base font-semibold tracking-tight text-ink-900">
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h3 className="mt-2 mb-1 text-sm font-semibold tracking-tight text-ink-900">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-2 mb-1 text-sm font-semibold text-ink-900">{children}</h4>
          ),
          p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
          hr: () => <hr className="my-3 border-ink-100" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

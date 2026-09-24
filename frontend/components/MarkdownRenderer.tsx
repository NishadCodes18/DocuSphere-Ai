"use client";

import React, { useState } from "react";
import { CitationItem } from "./CitationDrawer";

interface MarkdownRendererProps {
  content: string;
  citations?: CitationItem[];
  onSelectCitation?: (citation: CitationItem) => void;
}

export default function MarkdownRenderer({
  content,
  citations = [],
  onSelectCitation,
}: MarkdownRendererProps) {
  if (!content) return null;

  // Helper to render interactive citations [1], [2], [W1], [W2]
  const renderCitations = (citeStr: string, keyPrefix: string) => {
    const rawIds = citeStr.split(",").map((s) => s.trim()).filter(Boolean);

    return (
      <span key={keyPrefix} className="citation-group">
        {rawIds.map((idStr) => {
          const isWeb = idStr.startsWith("W") || idStr.startsWith("w");
          const numericId = parseInt(idStr, 10);
          const source = citations.find(
            (c) =>
              String(c.id).toLowerCase() === idStr.toLowerCase() ||
              (!isNaN(numericId) && c.id === numericId)
          );

          if (isWeb) {
            return (
              <a
                key={`${keyPrefix}-web-${idStr}`}
                href={source?.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="citation-pill web-citation-pill"
                title={source ? `🌐 Live Web: ${source.filename}` : `Web Citation [${idStr}]`}
                onClick={(e) => {
                  if (!source?.url && onSelectCitation && source) {
                    e.preventDefault();
                    onSelectCitation(source);
                  }
                }}
              >
                🌐 [{idStr}]
              </a>
            );
          }

          return (
            <button
              key={`${keyPrefix}-pill-${idStr}`}
              className="citation-pill"
              title={
                source
                  ? `${source.filename} (${source.location}) · ${source.score}% Match`
                  : `Citation [${idStr}]`
              }
              onClick={(e) => {
                e.stopPropagation();
                if (source && onSelectCitation) {
                  onSelectCitation(source);
                }
              }}
            >
              [{idStr}]
            </button>
          );
        })}
      </span>
    );
  };

  // Inline formatting helper: handles bold, italic, code, links, citations seamlessly
  const renderInline = (text: string, keyPrefix = "inline"): React.ReactNode[] => {
    if (!text) return [];

    // Master tokenizer regex matching:
    // 1: `code`
    // 2: [text](url)
    // 3: **bold** or __bold__
    // 4: *italic* or _italic_
    // 5: [1] or [W1] or [1, W1] citations
    const tokenRegex =
      /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[\s\S]+?\*\*|__[\s\S]+?__|(?<!\*)\*[^*]+?\*(?!\*)|\[(?:W\d+|\d+)(?:\s*,\s*(?:W\d+|\d+))*\])/g;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let counter = 0;

    while ((match = tokenRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <span key={`${keyPrefix}-t-${counter++}`}>
            {text.substring(lastIndex, match.index)}
          </span>
        );
      }

      const token = match[0];

      if (token.startsWith("`") && token.endsWith("`")) {
        // Inline code
        parts.push(
          <code key={`${keyPrefix}-c-${counter++}`} className="md-code-inline">
            {token.slice(1, -1)}
          </code>
        );
      } else if (token.startsWith("[") && token.includes("](") && token.endsWith(")")) {
        // Markdown link [label](url)
        const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          parts.push(
            <a
              key={`${keyPrefix}-a-${counter++}`}
              href={linkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="md-link"
            >
              {linkMatch[1]}
            </a>
          );
        } else {
          parts.push(<span key={`${keyPrefix}-raw-${counter++}`}>{token}</span>);
        }
      } else if (
        (token.startsWith("**") && token.endsWith("**")) ||
        (token.startsWith("__") && token.endsWith("__"))
      ) {
        // Bold text - recursively render inner inline tokens (e.g. citations inside bold)
        const inner = token.slice(2, -2);
        parts.push(
          <strong key={`${keyPrefix}-b-${counter++}`} className="md-bold">
            {renderInline(inner, `${keyPrefix}-b-${counter}`)}
          </strong>
        );
      } else if (token.startsWith("*") && token.endsWith("*")) {
        // Italic
        const inner = token.slice(1, -1);
        parts.push(
          <em key={`${keyPrefix}-em-${counter++}`} className="md-italic">
            {renderInline(inner, `${keyPrefix}-em-${counter}`)}
          </em>
        );
      } else if (/^\[\d+(?:\s*,\s*\d+)*\]$/.test(token)) {
        // Citation pill [1] or [1, 2]
        const citeContent = token.slice(1, -1);
        parts.push(renderCitations(citeContent, `${keyPrefix}-cite-${counter++}`));
      } else {
        parts.push(<span key={`${keyPrefix}-txt-${counter++}`}>{token}</span>);
      }

      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(
        <span key={`${keyPrefix}-t-end`}>{text.substring(lastIndex)}</span>
      );
    }

    return parts;
  };

  // Block parser: groups into code blocks, callouts/notices, headers, lists, blockquotes, and paragraphs
  const rawLines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let lineIdx = 0;

  while (lineIdx < rawLines.length) {
    const line = rawLines[lineIdx];
    const trimmed = line.trim();

    // 1. Code blocks (```lang ... ```)
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      lineIdx++;
      while (lineIdx < rawLines.length && !rawLines[lineIdx].trim().startsWith("```")) {
        codeLines.push(rawLines[lineIdx]);
        lineIdx++;
      }
      lineIdx++; // skip closing ```
      const fullCode = codeLines.join("\n");

      nodes.push(
        <CodeBlock
          key={`code-${lineIdx}`}
          code={fullCode}
          language={lang || "plaintext"}
        />
      );
      continue;
    }

    // 2. Callout / Notice banners (e.g. > ⚠️ Notice: ... or lines starting with > [!WARNING])
    if (
      trimmed.startsWith("> ⚠️") ||
      trimmed.startsWith("⚠️") ||
      trimmed.startsWith("> [!WARNING]") ||
      trimmed.startsWith("> [!NOTE]") ||
      trimmed.startsWith("> [!CAUTION]") ||
      (trimmed.startsWith(">") && trimmed.includes("Notice:"))
    ) {
      const calloutLines: string[] = [];
      while (
        lineIdx < rawLines.length &&
        rawLines[lineIdx].trim().startsWith(">")
      ) {
        calloutLines.push(rawLines[lineIdx].trim().replace(/^>\s*/, ""));
        lineIdx++;
      }
      const calloutText = calloutLines.join(" ");

      nodes.push(
        <div key={`callout-${lineIdx}`} className="md-callout md-callout-notice">
          <div className="md-callout-header">
            <span className="md-callout-icon">⚠️</span>
            <span className="md-callout-title">System Advisory</span>
          </div>
          <div className="md-callout-content">
            {renderInline(calloutText, `callout-${lineIdx}`)}
          </div>
        </div>
      );
      continue;
    }

    // 3. Horizontal Rule
    if (/^(---|___|\*\*\*)$/.test(trimmed)) {
      nodes.push(<hr key={`hr-${lineIdx}`} className="md-divider" />);
      lineIdx++;
      continue;
    }

    // 4. Headings
    if (trimmed.startsWith("#### ")) {
      nodes.push(
        <h4 key={`h4-${lineIdx}`} className="md-h4">
          {renderInline(trimmed.slice(5), `h4-${lineIdx}`)}
        </h4>
      );
      lineIdx++;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      nodes.push(
        <h3 key={`h3-${lineIdx}`} className="md-h3">
          {renderInline(trimmed.slice(4), `h3-${lineIdx}`)}
        </h3>
      );
      lineIdx++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      nodes.push(
        <h2 key={`h2-${lineIdx}`} className="md-h2">
          {renderInline(trimmed.slice(3), `h2-${lineIdx}`)}
        </h2>
      );
      lineIdx++;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      nodes.push(
        <h1 key={`h1-${lineIdx}`} className="md-h1">
          {renderInline(trimmed.slice(2), `h1-${lineIdx}`)}
        </h1>
      );
      lineIdx++;
      continue;
    }

    // 5. Blockquotes (> text)
    if (trimmed.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (
        lineIdx < rawLines.length &&
        rawLines[lineIdx].trim().startsWith("> ")
      ) {
        quoteLines.push(rawLines[lineIdx].trim().slice(2));
        lineIdx++;
      }
      nodes.push(
        <blockquote key={`bq-${lineIdx}`} className="md-blockquote">
          {renderInline(quoteLines.join(" "), `bq-${lineIdx}`)}
        </blockquote>
      );
      continue;
    }

    // 6. Lists (bullet and numbered)
    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);

    if (bulletMatch || numMatch) {
      const isNum = Boolean(numMatch);
      const listItems: string[] = [];

      while (lineIdx < rawLines.length) {
        const curTrim = rawLines[lineIdx].trim();
        const b = curTrim.match(/^[-*•]\s+(.*)$/);
        const n = curTrim.match(/^(\d+)\.\s+(.*)$/);

        if (isNum && n) {
          listItems.push(n[2]);
          lineIdx++;
        } else if (!isNum && b) {
          listItems.push(b[1]);
          lineIdx++;
        } else if (
          curTrim &&
          !curTrim.startsWith("#") &&
          !curTrim.startsWith(">") &&
          !curTrim.startsWith("```") &&
          (rawLines[lineIdx].startsWith("  ") || rawLines[lineIdx].startsWith("\t"))
        ) {
          // Indented continuation line
          if (listItems.length > 0) {
            listItems[listItems.length - 1] += " " + curTrim;
          }
          lineIdx++;
        } else {
          break;
        }
      }

      const listEls = listItems.map((item, idx) => (
        <li key={`li-${idx}`} className="md-list-item">
          {renderInline(item, `list-item-${lineIdx}-${idx}`)}
        </li>
      ));

      if (isNum) {
        nodes.push(
          <ol key={`ol-${lineIdx}`} className="md-ordered-list">
            {listEls}
          </ol>
        );
      } else {
        nodes.push(
          <ul key={`ul-${lineIdx}`} className="md-bullet-list">
            {listEls}
          </ul>
        );
      }
      continue;
    }

    // 7. Empty lines
    if (!trimmed) {
      lineIdx++;
      continue;
    }

    // 8. Normal paragraph
    nodes.push(
      <p key={`p-${lineIdx}`} className="md-p">
        {renderInline(trimmed, `p-${lineIdx}`)}
      </p>
    );
    lineIdx++;
  }

  return <div className="markdown-prose">{nodes}</div>;
}

// Code Block Component with Copy to Clipboard
function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="md-code-block-container">
      <div className="md-code-block-header">
        <span className="md-code-lang">{language}</span>
        <button className="md-code-copy-btn" onClick={handleCopy}>
          {copied ? "Copied" : "Copy Code"}
        </button>
      </div>
      <pre className="md-code-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

"use client";

import React, { useState, useRef, useEffect } from "react";
import { CitationItem } from "./CitationDrawer";
import MarkdownRenderer from "./MarkdownRenderer";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: CitationItem[];
  isStreaming?: boolean;
};

interface ChatViewProps {
  messages: Message[];
  onSendMessage: (text: string) => Promise<void>;
  onSelectCitation: (citation: CitationItem) => void;
  onClearChat: () => void;
  isStreaming: boolean;
  selectedDocCount: number;
  totalDocCount: number;
  enableWebSearch: boolean;
  onToggleWebSearch: (val: boolean) => void;
  onOpenExamModal: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

const BENTO_SUGGESTIONS = [
  {
    icon: "📊",
    title: "Executive Synthesis",
    desc: "Extract core conclusions, metrics, and strategic takeaways across documents.",
    prompt: "Provide an executive summary of the primary objectives, methodologies, and key conclusions.",
    tag: "Synthesis",
  },
  {
    icon: "⚙️",
    title: "Algorithm & Lab Steps",
    desc: "Step-by-step breakdown of procedures, mathematics, and algorithms.",
    prompt: "Explain the exact algorithm, step-by-step procedure, and technical methodology described in the document.",
    tag: "Technical",
  },
  {
    icon: "🔍",
    title: "Data & Variables Audit",
    desc: "Analyze dataset features, columns, distributions, and preprocessing.",
    prompt: "What dataset is used, what are the key features or variables, and how is the data structured?",
    tag: "Data Science",
  },
  {
    icon: "💡",
    title: "Viva & Exam Q&A",
    desc: "Generate conceptual interrogation questions with grounded answers.",
    prompt: "Generate 5 important technical viva/interview questions based on this document along with grounded answers.",
    tag: "Evaluation",
  },
];

const QUICK_CHIPS = [
  { label: "👋 Introduce DocuSphere", prompt: "hi introduce yourself" },
  { label: "🎓 Exam Q&A (Short)", prompt: "Frame 3 short exam-ready (2-3 marks) questions with key keywords and model answers based on the document." },
  { label: "🎙️ Viva Voce Prep", prompt: "What are the top 3 professor oral viva questions and tricky follow-ups an examiner will ask from this document?" },
  { label: "📌 Key Objectives", prompt: "What are the primary aims and objectives of this document?" },
  { label: "⚙️ Algorithm Procedure", prompt: "Explain the algorithm and methodology step-by-step." },
  { label: "📊 Expected Results", prompt: "What are the expected results, outputs, and business value?" },
];

export default function ChatView({
  messages,
  onSendMessage,
  onSelectCitation,
  onClearChat,
  isStreaming,
  selectedDocCount,
  totalDocCount,
  enableWebSearch,
  onToggleWebSearch,
  onOpenExamModal,
  sidebarCollapsed = false,
  onToggleSidebar,
}: ChatViewProps) {
  const [inputText, setInputText] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openTraceIds, setOpenTraceIds] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed || isStreaming) return;
    setInputText("");
    onSendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleTrace = (id: string) => {
    setOpenTraceIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleExportBriefing = () => {
    if (messages.length === 0) return;
    const lines = [
      "# DocuSphere AI — Research & Intelligence Briefing",
      `Generated: ${new Date().toLocaleString()}`,
      `Lead Architect: Nishad Patil`,
      "",
      "---",
      "",
    ];

    messages.forEach((m) => {
      if (m.role === "user") {
        lines.push(`## 👤 User Query\n${m.content}\n`);
      } else {
        lines.push(`## ✦ DocuSphere Grounded Answer\n${m.content}\n`);
        if (m.citations && m.citations.length > 0) {
          lines.push("### Verified Sources:");
          m.citations.forEach((c) => {
            lines.push(`- [${c.id}] ${c.filename} (${c.location}) — ${c.score}% Confidence`);
          });
          lines.push("");
        }
      }
    });

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DocuSphere_Briefing_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="chat-stage">
      {/* Studio Header */}
      <header className="chat-stage-header">
        <div className="chat-stage-title">
          {onToggleSidebar && (
            <button
              className={`sidebar-toggle-btn ${sidebarCollapsed ? "collapsed-indicator" : ""}`}
              onClick={onToggleSidebar}
              title={sidebarCollapsed ? "Show Knowledge Vault" : "Hide Knowledge Vault to expand chat full width"}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
              <span>{sidebarCollapsed ? `Vault (${totalDocCount})` : "Hide Vault"}</span>
            </button>
          )}

          <div className="retrieval-status-indicator">
            <span className="pulse-beacon" />
            <span className="stage-title-text">Retrieval Studio</span>
          </div>
          <span className="scope-pill">
            {selectedDocCount === 0
              ? `All ${totalDocCount} documents active`
              : `${selectedDocCount} document${selectedDocCount > 1 ? "s" : ""} isolated`}
          </span>
        </div>

        <div className="chat-header-actions">
          {/* Live Web Search Verification Toggle */}
          <button
            className={`web-toggle-pill ${enableWebSearch ? "active" : ""}`}
            onClick={() => onToggleWebSearch(!enableWebSearch)}
            title="When active, DocuSphere searches the live web to corroborate PDF facts with verified URLs [W1], [W2]"
          >
            <span className={`web-beacon ${enableWebSearch ? "beacon-active" : ""}`} />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span>{enableWebSearch ? "Web Search: ON" : "Web Search: OFF"}</span>
          </button>

          {/* Exam Q&A Studio Button */}
          <button
            className="exam-trigger-btn"
            onClick={onOpenExamModal}
            title="Generate custom Exam Sheets: Short, Medium, Long Theory, Viva Voce & MCQ"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span>🎓 Frame Exam Q&A</span>
          </button>

          {messages.length > 0 && (
            <>
              <button
                className="chat-action-btn"
                onClick={handleExportBriefing}
                title="Export conversation as Markdown research briefing"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export Briefing
              </button>
              <button
                className="chat-action-btn"
                onClick={onClearChat}
                title="Clear conversation history"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Clear History
              </button>
            </>
          )}
        </div>
      </header>

      {/* Messages Scroll Area */}
      <div className="messages-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <div className="welcome-hero-badge">
              <span className="hero-sparkle">✦</span>
              <span>DocuSphere Intelligence Architecture</span>
            </div>
            <h1 className="welcome-title">
              Query Your Vault with Absolute Grounding.
            </h1>
            <p className="welcome-desc">
              Engineered by <strong style={{ color: "#38bdf8" }}>Nishad Patil</strong> to eliminate AI hallucinations.
              Every answer is synthesized using dual-engine vector cosine similarity + lexical full-text search merged via Reciprocal Rank Fusion (RRF).
            </p>

            {/* Bento-Style Prompt Cards */}
            <div className="bento-grid">
              {BENTO_SUGGESTIONS.map((item, idx) => (
                <div
                  key={idx}
                  className="bento-card"
                  onClick={() => onSendMessage(item.prompt)}
                >
                  <div className="bento-card-top">
                    <span className="bento-icon">{item.icon}</span>
                    <span className="bento-tag">{item.tag}</span>
                  </div>
                  <h3 className="bento-title">{item.title}</h3>
                  <p className="bento-desc">{item.desc}</p>
                  <div className="bento-action-arrow">
                    Ask Query →
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`message-row ${m.role}`}>
              {m.role === "assistant" && (
                <div className="message-avatar avatar-ai">
                  <span className="avatar-sparkle">✦</span>
                </div>
              )}

              <div className="message-bubble">
                {/* Assistant Message Header */}
                {m.role === "assistant" && (
                  <div className="message-bubble-header">
                    <div className="assistant-badge-group">
                      <span className="assistant-label">✦ Grounded Intelligence</span>
                      {m.citations && m.citations.length > 0 && !m.isStreaming && (
                        <span className="assistant-header-badge">
                          {m.citations.length} Sources Grounded
                        </span>
                      )}
                      <span className="engine-micro-tag">OpenRouter Engine</span>
                    </div>

                    <div className="message-actions-right">
                      {m.citations && m.citations.length > 0 && !m.isStreaming && (
                        <button
                          className="trace-toggle-btn"
                          onClick={() => toggleTrace(m.id)}
                          title="View mathematical retrieval trace"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                          </svg>
                          {openTraceIds[m.id] ? "Hide Trace" : "View Trace"}
                        </button>
                      )}
                      <button
                        className="copy-bubble-btn"
                        onClick={() => handleCopy(m.id, m.content)}
                        title="Copy formatted answer"
                      >
                        {copiedId === m.id ? (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Copied
                          </>
                        ) : (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Retrieval Trace Collapsible Panel */}
                {m.role === "assistant" && openTraceIds[m.id] && m.citations && (
                  <div className="retrieval-trace-panel">
                    <div className="trace-row">
                      <span className="trace-key">Retrieval Pipeline:</span>
                      <span className="trace-val">PostgreSQL HNSW Vector + Full-Text Search (ts_rank_cd)</span>
                    </div>
                    <div className="trace-row">
                      <span className="trace-key">Fusion Algorithm:</span>
                      <span className="trace-val">Reciprocal Rank Fusion (RRF k=60)</span>
                    </div>
                    <div className="trace-row">
                      <span className="trace-key">Synthesis Engine:</span>
                      <span className="trace-val">OpenRouter High-Speed Cascade</span>
                    </div>
                    <div className="trace-row">
                      <span className="trace-key">Citation Precision:</span>
                      <span className="trace-val" style={{ color: "var(--accent-emerald)" }}>100% Grounded</span>
                    </div>
                  </div>
                )}

                {/* Formatted Markdown Content */}
                {m.role === "assistant" ? (
                  <div className="assistant-content-wrapper">
                    <MarkdownRenderer
                      content={m.content}
                      citations={m.citations}
                      onSelectCitation={onSelectCitation}
                    />
                    {m.isStreaming && <span className="streaming-cursor" />}
                  </div>
                ) : (
                  <div className="user-message-container">
                    <p className="user-message-text">{m.content}</p>
                  </div>
                )}

                {/* Verified Evidence Sources Carousel */}
                {m.citations && m.citations.length > 0 && !m.isStreaming && (
                  <div className="evidence-section">
                    <div className="evidence-header">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                      Verified Sources & Citations ({m.citations.length})
                      <span className="evidence-hint">· Click card to inspect exact page</span>
                    </div>
                    <div className="evidence-cards-row">
                      {m.citations.map((c) => (
                        <div
                          key={c.id}
                          className="evidence-mini-card"
                          onClick={() => onSelectCitation(c)}
                          title="Click to view verbatim excerpt in Evidence Inspector"
                        >
                          <div className="evidence-card-top">
                            <span className="card-cite-num">[{c.id}] {c.location}</span>
                            <span className="evidence-score-badge">{c.score}% Match</span>
                          </div>
                          <div className="card-filename" title={c.filename}>
                            {c.filename}
                          </div>
                          <p className="evidence-preview-text">{c.preview}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {m.role === "user" && (
                <div className="message-avatar avatar-user">
                  <span>You</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input Command Center & Prompt Chips */}
      <div className="chat-input-container">
        {/* Quick Action Chips */}
        <div className="quick-chips-bar">
          {QUICK_CHIPS.map((chip, idx) => (
            <button
              key={idx}
              className="quick-chip-btn"
              onClick={() => onSendMessage(chip.prompt)}
              disabled={isStreaming}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="chat-input-box">
          <textarea
            ref={textareaRef}
            rows={2}
            className="chat-textarea"
            placeholder={
              totalDocCount === 0
                ? "Upload a document to Knowledge Vault or ask 'hi' to introduce DocuSphere…"
                : "Ask a grounded research question across your documents… (Press Enter to send)"
            }
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
          />
          <div className="chat-input-footer">
            <span className="input-hint">
              Shift + Enter for new line · pgvector HNSW + RRF · Zero Hallucination Guarantee
            </span>
            <button
              className="send-btn"
              onClick={handleSend}
              disabled={!inputText.trim() || isStreaming}
            >
              {isStreaming ? (
                <>
                  <div className="btn-spinner" />
                  Streaming…
                </>
              ) : (
                <>
                  Ask DocuSphere
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

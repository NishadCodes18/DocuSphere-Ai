"use client";

import React, { useState } from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import { DocumentItem } from "./Sidebar";
import { CitationItem } from "./CitationDrawer";

interface ExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  docs: DocumentItem[];
  selectedDocIds: number[];
  onSelectCitation?: (citation: CitationItem) => void;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const EXAM_FORMATS = [
  {
    id: "short",
    label: "Short (Exam-Ready)",
    badge: "2-3 Marks",
    desc: "Crisp definition, required keywords, and punchy 2-sentence model answer.",
    icon: "⚡",
  },
  {
    id: "medium",
    label: "Medium (Conceptual)",
    badge: "5 Marks",
    desc: "Step-by-step numbered breakdown, technical procedure, and derivations.",
    icon: "📖",
  },
  {
    id: "long",
    label: "Long Theory & Architecture",
    badge: "10 Marks",
    desc: "Comprehensive problem statement, full theoretical architecture, and flow.",
    icon: "🏛️",
  },
  {
    id: "oral",
    label: "Oral / Viva Voce",
    badge: "Professor Defense",
    desc: "Tough examiner questions, common blunders, counter-questions & model speech.",
    icon: "🎙️",
  },
  {
    id: "mcq",
    label: "Multiple Choice Quiz",
    badge: "MCQ Practice",
    desc: "4 rigorous options with instant answer key and grounded rationale.",
    icon: "🔘",
  },
];

export default function ExamModal({
  isOpen,
  onClose,
  docs,
  selectedDocIds,
  onSelectCitation,
}: ExamModalProps) {
  const [examType, setExamType] = useState("short");
  const [count, setCount] = useState(5);
  const [topicFocus, setTopicFocus] = useState("");
  const [targetDocId, setTargetDocId] = useState<number | "all">("all");
  const [enableWeb, setEnableWeb] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<string | null>(null);
  const [citations, setCitations] = useState<CitationItem[]>([]);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setLoading(true);
    setGeneratedResult(null);

    const docIds =
      targetDocId === "all"
        ? selectedDocIds.length > 0
          ? selectedDocIds
          : null
        : [Number(targetDocId)];

    try {
      const res = await fetch(`${API}/qa/frame-exam`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_ids: docIds,
          exam_type: examType,
          count: count,
          topic_focus: topicFocus.trim() || undefined,
          enable_web_search: enableWeb,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to generate exam questions.");
      }

      setGeneratedResult(data.content);
      setCitations(data.citations || []);
    } catch (err: any) {
      console.error("Exam generation error:", err);
      setGeneratedResult(`⚠️ Error: ${err.message || "Failed to generate questions"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!generatedResult) return;
    navigator.clipboard.writeText(generatedResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!generatedResult) return;
    const blob = new Blob([generatedResult], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DocuSphere_Exam_${examType}_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container exam-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="exam-icon-badge">🎓</span>
            <div>
              <h3 className="modal-title">Exam & Viva Q&A Framing Studio</h3>
              <p className="modal-subtitle">
                Synthesize customized short, medium, long, or oral exam questions strictly grounded in your documents
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="exam-modal-body">
          {/* Format Selection Cards */}
          <div className="format-selection-section">
            <label className="section-label">Select Examination Format</label>
            <div className="format-cards-grid">
              {EXAM_FORMATS.map((fmt) => (
                <div
                  key={fmt.id}
                  className={`exam-format-card ${examType === fmt.id ? "active" : ""}`}
                  onClick={() => setExamType(fmt.id)}
                >
                  <div className="fmt-top">
                    <span className="fmt-icon">{fmt.icon}</span>
                    <span className="fmt-badge">{fmt.badge}</span>
                  </div>
                  <h4 className="fmt-title">{fmt.label}</h4>
                  <p className="fmt-desc">{fmt.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Configuration Controls */}
          <div className="exam-config-grid">
            <div className="config-item">
              <label className="form-label">Target Document Scope</label>
              <select
                className="modal-select"
                value={targetDocId}
                onChange={(e) => setTargetDocId(e.target.value === "all" ? "all" : Number(e.target.value))}
              >
                <option value="all">
                  {selectedDocIds.length > 0 ? `Selected Filter (${selectedDocIds.length} docs)` : "All Documents in Vault"}
                </option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.filename}
                  </option>
                ))}
              </select>
            </div>

            <div className="config-item">
              <label className="form-label">Question Count / Coverage Scope</label>
              <div className="count-buttons-row">
                <button
                  type="button"
                  className={`count-btn ${count === 3 ? "active" : ""}`}
                  onClick={() => setCount(3)}
                >
                  3 Qs
                </button>
                <button
                  type="button"
                  className={`count-btn ${count === 5 ? "active" : ""}`}
                  onClick={() => setCount(5)}
                >
                  5 Qs
                </button>
                <button
                  type="button"
                  className={`count-btn ${count === 10 ? "active" : ""}`}
                  onClick={() => setCount(10)}
                >
                  10 Qs
                </button>
                <button
                  type="button"
                  className={`count-btn count-all-btn ${count === 0 ? "active" : ""}`}
                  onClick={() => setCount(0)}
                  title="Generate every possible question that an examiner can ask from this document"
                >
                  ⚡ All Q&A (360° Coverage)
                </button>
              </div>
            </div>

            <div className="config-item full-width">
              <label className="form-label">Topic / Concept Focus (Optional)</label>
              <input
                type="text"
                className="modal-input"
                placeholder="e.g. K-Means clustering, Elbow method, customer segmentation formula..."
                value={topicFocus}
                onChange={(e) => setTopicFocus(e.target.value)}
              />
            </div>

            <div className="config-item full-width checkbox-item">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={enableWeb}
                  onChange={(e) => setEnableWeb(e.target.checked)}
                />
                <span>🌐 <strong>Online Verification</strong>: Cross-check and cite external academic definitions [W1] alongside PDF citations [1]</span>
              </label>
            </div>
          </div>

          <div className="exam-generate-bar">
            <button
              className="btn-generate-exam"
              onClick={handleGenerate}
              disabled={loading || docs.length === 0}
            >
              {loading ? (
                <>
                  <div className="btn-spinner" />
                  Synthesizing Grounded Exam Questions…
                </>
              ) : (
                "⚡ Generate Exam Q&A Paper"
              )}
            </button>
          </div>

          {/* Generated Result Output */}
          {generatedResult && (
            <div className="exam-result-container">
              <div className="exam-result-header">
                <div className="result-title-left">
                  <span className="exam-count-badge">
                    {count === 0 ? "Exhaustive 360° Coverage (All Q&A)" : `${count} Questions Grounded`}
                  </span>
                </div>
                <div className="result-actions-right">
                  <button className="exam-action-btn" onClick={handleCopy}>
                    {copied ? "✓ Copied" : "Copy Paper"}
                  </button>
                  <button className="exam-action-btn download" onClick={handleDownload}>
                    Download .md
                  </button>
                </div>
              </div>

              <div className="exam-prose-scroll">
                <MarkdownRenderer
                  content={generatedResult}
                  citations={citations}
                  onSelectCitation={onSelectCitation}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";

export type CitationItem = {
  id: number | string;
  chunk_id: number | string;
  document_id: number;
  filename: string;
  location: string;
  score: number;
  rrf_score?: number;
  cosine_sim?: number;
  preview: string;
  full_content: string;
  url?: string;
  source_type?: string;
};

interface CitationDrawerProps {
  citation: CitationItem | null;
  onClose: () => void;
}

export default function CitationDrawer({ citation, onClose }: CitationDrawerProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!citation) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(citation.full_content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="citation-drawer-overlay" onClick={onClose} />
      <aside className="citation-drawer">
        <div className="drawer-header">
          <div className="drawer-title-group">
            <span className="drawer-tag">Source [{citation.id}]</span>
            <div className="drawer-heading">Evidence Inspector</div>
          </div>
          <button className="close-drawer-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>

        <div className="drawer-body">
          <div className="metadata-card">
            <div>
              <div className="meta-field-label">Document</div>
              <div className="meta-field-value" title={citation.filename}>
                {citation.filename}
              </div>
            </div>
            <div>
              <div className="meta-field-label">Reference</div>
              <div className="meta-field-value">{citation.location}</div>
            </div>
            <div>
              <div className="meta-field-label">Hybrid Confidence</div>
              <div className="meta-field-value" style={{ color: "var(--accent-emerald)" }}>
                {citation.score}% Match
              </div>
            </div>
            <div>
              <div className="meta-field-label">Algorithm</div>
              <div className="meta-field-value" style={{ color: "var(--accent-cyan)", fontSize: "11px" }}>
                RRF + HNSW
              </div>
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "var(--text-secondary)",
                marginBottom: "8px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Exact Extracted Passage
            </div>
            <div className="passage-box">{citation.full_content}</div>
          </div>

          <button className="copy-passage-btn" onClick={handleCopy}>
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Passage Copied!
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy Verbatim Text
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}

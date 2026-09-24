"use client";

import React, { useEffect, useState } from "react";

interface ChunkItem {
  id: string;
  chunk_index: number;
  page_number?: number;
  slide_number?: number;
  content: string;
}

interface ChunkModalProps {
  documentId: number | null;
  filename: string;
  onClose: () => void;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function ChunkModal({ documentId, filename, onClose }: ChunkModalProps) {
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [copiedChunkId, setCopiedChunkId] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) return;
    setLoading(true);
    fetch(`${API}/documents/${documentId}/chunks`)
      .then((res) => res.json())
      .then((data) => {
        setChunks(data.chunks || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load chunks:", err);
        setLoading(false);
      });
  }, [documentId]);

  if (!documentId) return null;

  const filteredChunks = chunks.filter((c) =>
    c.content.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedChunkId(id);
    setTimeout(() => setCopiedChunkId(null), 2000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-icon">📦</span>
            <div>
              <h3 className="modal-title">HNSW Vector Chunk Inspector</h3>
              <p className="modal-subtitle">{filename} · {chunks.length} Total Vector Chunks</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close Inspector">
            ✕
          </button>
        </div>

        <div className="modal-search-bar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="modal-search-input"
            placeholder="Search within indexed chunks..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
          {searchFilter && (
            <button className="modal-clear-search" onClick={() => setSearchFilter("")}>
              Clear
            </button>
          )}
        </div>

        <div className="modal-chunks-list">
          {loading ? (
            <div className="modal-loading-state">
              <div className="modal-spinner" />
              <span>Querying PostgreSQL pgvector chunks...</span>
            </div>
          ) : filteredChunks.length === 0 ? (
            <div className="modal-empty-state">
              <p>No chunks match your search query.</p>
            </div>
          ) : (
            filteredChunks.map((chunk) => (
              <div key={chunk.id} className="modal-chunk-card">
                <div className="modal-chunk-header">
                  <div className="chunk-meta-tags">
                    <span className="chunk-index-tag">Chunk #{chunk.chunk_index + 1}</span>
                    <span className="chunk-location-tag">
                      {chunk.page_number ? `Page ${chunk.page_number}` : chunk.slide_number ? `Slide ${chunk.slide_number}` : "Section"}
                    </span>
                    <span className="chunk-char-tag">{chunk.content.length} chars</span>
                  </div>
                  <button
                    className="chunk-copy-btn"
                    onClick={() => handleCopy(chunk.id, chunk.content)}
                  >
                    {copiedChunkId === chunk.id ? "✓ Copied" : "Copy Chunk"}
                  </button>
                </div>
                <div className="modal-chunk-content">
                  {chunk.content}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

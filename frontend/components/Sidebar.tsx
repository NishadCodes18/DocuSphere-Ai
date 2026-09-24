"use client";

import React, { useState } from "react";

export type DocumentItem = {
  id: number;
  filename: string;
  media_type: string;
  file_size_bytes?: number;
  chunk_count?: number;
  status?: string;
  created_at: string;
};

interface SidebarProps {
  docs: DocumentItem[];
  selectedDocIds: number[];
  onToggleDoc: (id: number) => void;
  onSelectAll: () => void;
  onUpload: (file: File) => Promise<void>;
  onDeleteDoc: (id: number) => Promise<void>;
  onDeleteAll?: (ids: number[]) => Promise<void>;
  onOpenDriveModal: () => void;
  onLoadSampleDoc?: () => void;
  onInspectDoc?: (doc: DocumentItem) => void;
  onQuickAsk?: (prompt: string) => void;
  uploading: boolean;
  uploadStatus: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 KB";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileType(filename: string): { label: string; className: string } {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return { label: "PDF", className: "doc-type-pdf" };
  if (ext === "docx" || ext === "doc") return { label: "DOCX", className: "doc-type-docx" };
  if (ext === "pptx" || ext === "ppt") return { label: "PPTX", className: "doc-type-pptx" };
  if (ext === "md") return { label: "MD", className: "doc-type-md" };
  return { label: "TXT", className: "doc-type-docx" };
}

export default function Sidebar({
  docs,
  selectedDocIds,
  onToggleDoc,
  onSelectAll,
  onUpload,
  onDeleteDoc,
  onDeleteAll,
  onOpenDriveModal,
  onLoadSampleDoc,
  onInspectDoc,
  onQuickAsk,
  uploading,
  uploadStatus,
  isCollapsed = false,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile,
}: SidebarProps) {
  const [isDragging, setIsDragging] = useState(false);

  const totalChunks = docs.reduce((acc, d) => acc + (d.chunk_count || 0), 0);
  const totalBytes = docs.reduce((acc, d) => acc + (d.file_size_bytes || 0), 0);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  const allSelected = docs.length > 0 && selectedDocIds.length === docs.length;

  return (
    <>
      {/* Mobile Drawer Overlay Backdrop */}
      {isMobileOpen && (
        <div className="sidebar-mobile-backdrop" onClick={onCloseMobile} />
      )}

      <aside className={`vault-sidebar ${isCollapsed ? "collapsed" : ""} ${isMobileOpen ? "mobile-open" : ""}`}>
        {/* Vault Header & Storage Stats */}
        <div className="vault-header">
          <div className="vault-title-row">
            <div className="vault-heading">
              <div className="vault-beacon-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                </svg>
              </div>
              <span>Knowledge Vault</span>
              <span className="vault-count-badge">{docs.length} Active</span>
            </div>

            {/* Collapse / Close Action Button */}
            {onToggleCollapse && (
              <button
                className="vault-collapse-btn"
                onClick={onToggleCollapse}
                title="Collapse Knowledge Vault (expand chat view)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}

            {isMobileOpen && onCloseMobile && (
              <button
                className="vault-mobile-close-btn"
                onClick={onCloseMobile}
                title="Close drawer"
              >
                ✕
              </button>
            )}
          </div>

        {/* Client-Isolated Privacy & 24h Expiry Banner */}
        <div className="security-privacy-banner">
          <div className="security-icon-row">
            <span className="security-shield">🔒</span>
            <span className="security-title">Client-Isolated Private Session</span>
          </div>
          <p className="security-desc">
            Chats are stored locally on your device and auto-deleted after 24 hours. Conversations remain completely private and are never visible to other users.
          </p>
        </div>

        {/* Storage Stats Bar */}
        <div className="vault-stats-bar">
          <div className="vault-stat-item">
            <span className="stat-label">Vector Chunks</span>
            <span className="stat-val">{totalChunks}</span>
          </div>
          <div className="vault-stat-divider" />
          <div className="vault-stat-item">
            <span className="stat-label">Indexed Size</span>
            <span className="stat-val">{formatBytes(totalBytes)}</span>
          </div>
          <div className="vault-stat-divider" />
          <div className="vault-stat-item">
            <span className="stat-label">HNSW Index</span>
            <span className="stat-val" style={{ color: "var(--accent-emerald)" }}>Active</span>
          </div>
        </div>

        {/* Upload Dropzone */}
        {uploading ? (
          <div className="upload-progress-box">
            <div className="upload-spinner" />
            <div style={{ flex: 1 }}>
              <span className="upload-status-text">
                {uploadStatus || "Vectorizing & building HNSW graph…"}
              </span>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" />
              </div>
            </div>
          </div>
        ) : (
          <div className="dropzone-dual-wrapper">
            <div
              className={`dropzone-container ${isDragging ? "dragging" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".pdf,.docx,.pptx,.txt,.md,.csv"
                className="dropzone-input"
                disabled={uploading}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    onUpload(e.target.files[0]);
                    e.target.value = "";
                  }
                }}
              />
              <div className="dropzone-inner-content">
                <div className="dropzone-icon-glow">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <div className="dropzone-text">+ Upload Local File</div>
                <div className="format-tags-row">
                  <span className="fmt-tag">PDF</span>
                  <span className="fmt-tag">DOCX</span>
                  <span className="fmt-tag">PPTX</span>
                  <span className="fmt-tag">MD</span>
                </div>
              </div>
            </div>

            {/* Google Drive Import Button */}
            <button
              type="button"
              className="btn-drive-import-shortcut"
              onClick={onOpenDriveModal}
            >
              <svg width="15" height="15" viewBox="0 0 87.3 78" fill="none">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
              </svg>
              <span>☁️ Import from Google Drive</span>
            </button>
          </div>
        )}
      </div>

      {/* Scope Filter Bar */}
      <div className="filter-bar">
        <span className="filter-summary">
          {selectedDocIds.length === 0
            ? "Searching all vault documents"
            : `${selectedDocIds.length} of ${docs.length} selected`}
        </span>
        <div className="filter-bar-actions">
          {docs.length > 0 && (
            <button className="select-all-btn" onClick={onSelectAll}>
              {allSelected ? "Clear" : "Select All"}
            </button>
          )}
          {selectedDocIds.length > 0 && onDeleteAll && (
            <button
              className="delete-all-btn"
              title={`Permanently delete ${selectedDocIds.length} selected document${selectedDocIds.length > 1 ? "s" : ""} from vault`}
              onClick={() => {
                if (
                  confirm(
                    `Permanently delete ${selectedDocIds.length} selected document${selectedDocIds.length > 1 ? "s" : ""} from the vault?\nThis will remove all vector embeddings and cannot be undone.`
                  )
                ) {
                  onDeleteAll(selectedDocIds);
                }
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Delete {selectedDocIds.length}
            </button>
          )}
        </div>
      </div>

      {/* Documents List */}
      <div className="documents-scroll">
        {docs.length === 0 ? (
          <div className="vault-empty-state">
            <div className="empty-vault-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="empty-title">Knowledge Vault is Empty</p>
            <p className="empty-subtitle">
              Upload a PDF, DOCX, or PPTX for document-grounded answers with verified citations.
            </p>
            <p className="empty-chat-hint">💬 You can still chat — ask me anything!</p>
            {onLoadSampleDoc && (
              <button className="load-sample-btn" onClick={onLoadSampleDoc}>
                ⚡ Load Sample Document
              </button>
            )}
          </div>
        ) : (
          docs.map((doc) => {
            const { label, className } = getFileType(doc.filename);
            const isSelected = selectedDocIds.includes(doc.id);
            return (
              <div
                key={doc.id}
                className={`doc-card ${isSelected ? "selected" : ""}`}
                onClick={() => onToggleDoc(doc.id)}
              >
                <div className="doc-card-main">
                  <div className="doc-checkbox-wrapper">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleDoc(doc.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="doc-checkbox"
                    />
                  </div>

                  <div className={`doc-type-icon ${className}`}>{label}</div>

                  <div className="doc-info">
                    <div className="doc-name" title={doc.filename}>
                      {doc.filename}
                    </div>
                    <div className="doc-meta">
                      <span>{doc.chunk_count || 0} chunks</span>
                      <span>·</span>
                      <span>{formatBytes(doc.file_size_bytes)}</span>
                      <span>·</span>
                      <span className="doc-badge-ready">Indexed</span>
                    </div>
                  </div>
                </div>

                <div className="doc-card-actions" onClick={(e) => e.stopPropagation()}>
                  {onInspectDoc && (
                    <button
                      className="doc-action-btn"
                      title="Inspect pgvector chunks and embeddings"
                      onClick={() => onInspectDoc(doc)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      Chunks
                    </button>
                  )}

                  {onQuickAsk && (
                    <button
                      className="doc-action-btn"
                      title="Ask a quick summary question for this document"
                      onClick={() => onQuickAsk(`Summarize the core methodology and primary findings of ${doc.filename}.`)}
                    >
                      Summary
                    </button>
                  )}

                  <button
                    className="delete-doc-btn"
                    title="Permanently remove document from database"
                    onClick={() => {
                      if (confirm(`Permanently delete "${doc.filename}" from vault and remove all vector embeddings?`)) {
                        onDeleteDoc(doc.id);
                      }
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
    </>
  );
}

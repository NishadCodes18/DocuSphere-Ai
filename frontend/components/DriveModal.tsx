"use client";

import React, { useState } from "react";

interface DriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (filename: string, chunks: number) => void;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function DriveModal({ isOpen, onClose, onSuccess }: DriveModalProps) {
  const [driveUrl, setDriveUrl] = useState("");
  const [customName, setCustomName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driveUrl.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API}/documents/upload-drive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drive_url: driveUrl.trim(),
          custom_filename: customName.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to download and index Google Drive file.");
      }

      onSuccess(data.filename, data.chunks);
      onClose();
      setDriveUrl("");
      setCustomName("");
    } catch (err: any) {
      console.error("Google Drive import error:", err);
      setError(err.message || "An unexpected error occurred during Google Drive import.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container drive-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="drive-icon-badge">
              <svg width="22" height="22" viewBox="0 0 87.3 78" fill="none">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
              </svg>
            </div>
            <div>
              <h3 className="modal-title">Google Drive Cloud Ingestion</h3>
              <p className="modal-subtitle">Paste any shareable Google Drive link to index directly into pgvector</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleImport} className="drive-modal-form">
          <div className="form-group">
            <label className="form-label">Google Drive Share Link or File ID</label>
            <input
              type="text"
              required
              className="modal-input"
              placeholder="e.g. https://drive.google.com/file/d/1BxiMVs.../view?usp=sharing"
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              disabled={loading}
            />
            <span className="form-helper">
              💡 Ensure link sharing is set to: <strong>&ldquo;Anyone with the link can view&rdquo;</strong>
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Custom Document Name (Optional)</label>
            <input
              type="text"
              className="modal-input"
              placeholder="e.g. Market_Segmentation_Report.pdf"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && (
            <div className="drive-error-banner">
              <span>⚠️ {error}</span>
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-drive-submit" disabled={!driveUrl.trim() || loading}>
              {loading ? (
                <>
                  <div className="btn-spinner" />
                  Fetching & Vectorizing…
                </>
              ) : (
                "⚡ Import & Index into pgvector"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import React from "react";

interface LoadingScreenProps {
  statusText?: string;
}

export default function LoadingScreen({
  statusText = "Connecting to Neon Cloud PostgreSQL · Loading pgvector HNSW Indices",
}: LoadingScreenProps) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-ambient-glow" />

      <div className="loading-content-card">
        {/* Animated Double Gyroscopic Ring & Sparkle */}
        <div className="loading-logo-ring-wrapper">
          <div className="loading-ring" />
          <div className="loading-ring-inner" />
          <div className="loading-logo-center">
            <span className="loading-sparkle">✦</span>
          </div>
        </div>

        {/* Title & Badge */}
        <div className="loading-title-row">
          <h1 className="loading-title">DocuSphere AI</h1>
          <span className="loading-tag">Studio v2.0</span>
        </div>

        <p className="loading-desc">
          Zero-Hallucination Document Intelligence & Citation Studio
        </p>

        {/* Shimmering Progress Bar */}
        <div className="loading-progress-track">
          <div className="loading-progress-bar" />
        </div>

        {/* Telemetry Status Bar */}
        <div className="loading-status-bar">
          <span className="loading-beacon" />
          <span>{statusText}</span>
        </div>

        {/* Author Credit */}
        <div className="loading-author-dock">
          <span>Architected & Engineered by</span>
          <strong className="loading-author-name">Nishad Patil</strong>
        </div>
      </div>
    </div>
  );
}

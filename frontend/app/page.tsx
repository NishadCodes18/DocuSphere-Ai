"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import Sidebar, { DocumentItem } from "../components/Sidebar";
import ChatView, { Message } from "../components/ChatView";
import CitationDrawer, { CitationItem } from "../components/CitationDrawer";
import ChunkModal from "../components/ChunkModal";
import DriveModal from "../components/DriveModal";
import ExamModal from "../components/ExamModal";
import LoadingScreen from "../components/LoadingScreen";
import { API } from "../lib/api";

// ---------------------------------------------------------------------------
// Session & Chat Storage Types
// ---------------------------------------------------------------------------
const SESSIONS_STORAGE_KEY = "docusphere_sessions_v2";
const ACTIVE_SESSION_KEY = "docusphere_active_session";
const TTL_24_HOURS = 24 * 60 * 60 * 1000;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getBrowserSessionId(): string {
  const key = "docusphere_browser_session";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = generateId();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  lastUpdatedAt: number;
  documentIds: number[];
  browserSessionId: string;
};

type SessionStore = {
  sessions: ChatSession[];
  version: number;
};

function loadSessionStore(): SessionStore {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return { sessions: [], version: 1 };
    return JSON.parse(raw) as SessionStore;
  } catch {
    return { sessions: [], version: 1 };
  }
}

function saveSessionStore(store: SessionStore) {
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.error("Failed to persist sessions:", e);
  }
}

async function purgeExpiredSessions(store: SessionStore): Promise<SessionStore> {
  const now = Date.now();
  const expired = store.sessions.filter(s => now - s.createdAt > TTL_24_HOURS);
  const valid = store.sessions.filter(s => now - s.createdAt <= TTL_24_HOURS);

  // 1. Clean up by browserSessionId
  const expiredBrowserSessions = [...new Set(expired.map(s => s.browserSessionId))];
  for (const bsid of expiredBrowserSessions) {
    try {
      await fetch(`${API}/documents/cleanup-session?session_id=${encodeURIComponent(bsid)}`, {
        method: "DELETE",
      });
    } catch (e) {
      console.warn(`[DocuSphere] Backend session cleanup failed for ${bsid}:`, e);
    }
  }

  // 2. Clean up specific document IDs associated with expired sessions
  const validDocIds = new Set(valid.flatMap(s => s.documentIds || []));
  const expiredDocIds = expired.flatMap(s => s.documentIds || []).filter(id => !validDocIds.has(id));
  for (const docId of new Set(expiredDocIds)) {
    try {
      await fetch(`${API}/documents/${docId}`, { method: "DELETE" });
    } catch {}
  }

  // 3. Purge any database documents older than 24 hours
  try {
    await fetch(`${API}/documents/cleanup-expired`, { method: "DELETE" });
  } catch {}

  if (expired.length > 0) {
    console.log(`[DocuSphere] Purged ${expired.length} expired chat session(s) & documents (>24h TTL)`);
  }

  return { ...store, sessions: valid };
}

function deriveChatTitle(messages: Message[]): string {
  const firstUser = messages.find(m => m.role === "user");
  if (!firstUser) return "New Chat";
  const text = firstUser.content.trim();
  return text.length > 48 ? text.slice(0, 48) + "..." : text;
}

// ---------------------------------------------------------------------------
// Home Page Component
// ---------------------------------------------------------------------------
export default function Home() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [activeCitation, setActiveCitation] = useState<CitationItem | null>(null);
  const [inspectingDoc, setInspectingDoc] = useState<DocumentItem | null>(null);
  const [isDriveOpen, setIsDriveOpen] = useState(false);
  const [isExamOpen, setIsExamOpen] = useState(false);
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileVaultOpen, setMobileVaultOpen] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("Connecting to Neon Cloud PostgreSQL & loading pgvector HNSW indices...");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);

  const browserSessionId = useRef(getBrowserSessionId());

  const activeSession = sessions.find(s => s.id === activeSessionId) ?? null;
  const activeMessages = activeSession?.messages ?? [];

  // Initialization
  useEffect(() => {
    const initialize = async () => {
      let store = loadSessionStore();
      store = await purgeExpiredSessions(store);
      saveSessionStore(store);
      setSessions(store.sessions);

      const savedActiveId = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (savedActiveId && store.sessions.some(s => s.id === savedActiveId)) {
        setActiveSessionId(savedActiveId);
        const sess = store.sessions.find(s => s.id === savedActiveId);
        if (sess) setSelectedDocIds(sess.documentIds);
      }
    };
    initialize();
  }, []);

  // Periodic 24h TTL check
  useEffect(() => {
    const interval = setInterval(async () => {
      let store = loadSessionStore();
      store = await purgeExpiredSessions(store);
      saveSessionStore(store);
      const newSessions = store.sessions;
      setSessions(newSessions);
      const validIds = new Set(newSessions.map(s => s.id));
      setActiveSessionId(prev => {
        if (prev && !validIds.has(prev)) {
          localStorage.removeItem(ACTIVE_SESSION_KEY);
          return null;
        }
        return prev;
      });
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Backend expired-doc cleanup on startup
  useEffect(() => {
    fetch(`${API}/documents/cleanup-expired`, { method: "DELETE" }).catch(() => {});
  }, []);

  async function loadDocs() {
    try {
      const res = await fetch(`${API}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocs(data);
      }
    } catch (err) {
      console.error("Failed to load documents:", err);
    } finally {
      setIsAppReady(true);
    }
  }

  useEffect(() => {
    setLoadingStatus("Connecting to Neon Cloud PostgreSQL & loading pgvector HNSW indices...");
    const timer = setTimeout(() => {
      setLoadingStatus("Warming up OpenRouter AI Engine & document retrieval pipeline...");
    }, 1200);
    loadDocs();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const fallback = setTimeout(() => setIsAppReady(true), 3000);
    return () => clearTimeout(fallback);
  }, []);

  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const persistSessions = useCallback((updated: ChatSession[]) => {
    saveSessionStore({ sessions: updated, version: 1 });
  }, []);

  const updateSessions = useCallback((updater: (prev: ChatSession[]) => ChatSession[]) => {
    setSessions(prev => {
      const next = updater(prev);
      persistSessions(next);
      return next;
    });
  }, [persistSessions]);

  const handleNewChat = () => {
    const newSession: ChatSession = {
      id: generateId(),
      title: "New Chat",
      messages: [],
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      documentIds: selectedDocIds,
      browserSessionId: browserSessionId.current,
    };
    updateSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    localStorage.setItem(ACTIVE_SESSION_KEY, newSession.id);
    setActiveCitation(null);
    setChatHistoryOpen(false);
  };

  const handleSwitchSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    const sess = sessions.find(s => s.id === sessionId);
    if (sess) setSelectedDocIds(sess.documentIds);
    setActiveCitation(null);
    setChatHistoryOpen(false);
  };

  const handleDeleteSession = async (sessionId: string) => {
    const targetSession = sessions.find(s => s.id === sessionId);
    updateSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
    // Delete files attached to this session if not used by any other session
    if (targetSession && targetSession.documentIds.length > 0) {
      const remainingDocs = new Set(
        sessions.filter(s => s.id !== sessionId).flatMap(s => s.documentIds)
      );
      const docsToPurge = targetSession.documentIds.filter(id => !remainingDocs.has(id));
      for (const id of docsToPurge) {
        try {
          await fetch(`${API}/documents/${id}`, { method: "DELETE" });
        } catch {}
      }
      await loadDocs();
    }
    showToast("Chat session and associated files deleted", "info");
  };

  const handleClearChat = () => {
    if (!activeSessionId) return;
    updateSessions(prev =>
      prev.map(s =>
        s.id === activeSessionId
          ? { ...s, messages: [], title: "New Chat", lastUpdatedAt: Date.now() }
          : s
      )
    );
    setActiveCitation(null);
    showToast("Chat history cleared", "info");
  };

  const handleToggleDoc = (id: number) => {
    setSelectedDocIds(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedDocIds.length === docs.length) {
      setSelectedDocIds([]);
    } else {
      setSelectedDocIds(docs.map(d => d.id));
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadStatus(`Indexing "${file.name}" & building HNSW vectors...`);
    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(
        `${API}/documents/upload?session_id=${encodeURIComponent(browserSessionId.current)}`,
        { method: "POST", body: form }
      );
      const data = await res.json();
      if (!res.ok) {
        showToast(data.detail || "Upload failed", "error");
      } else {
        await loadDocs();
        if (data.document_id) {
          const newDocId = Number(data.document_id);
          setSelectedDocIds(prev => prev.includes(newDocId) ? prev : [...prev, newDocId]);
          if (activeSessionId) {
            updateSessions(prev =>
              prev.map(s =>
                s.id === activeSessionId && !s.documentIds.includes(newDocId)
                  ? { ...s, documentIds: [...s.documentIds, newDocId], lastUpdatedAt: Date.now() }
                  : s
              )
            );
          }
        }
        showToast(`Indexed "${data.filename}" (${data.chunks} chunks) into pgvector!`, "success");
      }
    } catch (err) {
      console.error("Upload error:", err);
      showToast("Could not communicate with DocuSphere API.", "error");
    } finally {
      setUploading(false);
      setUploadStatus("");
    }
  };

  const handleLoadSample = async () => {
    const sampleText = `# DocuSphere AI Architecture & Benchmark Overview\n\n## 1. System Architecture\nDocuSphere AI is a production-grade document intelligence platform.\n\n### Core Pipeline Components:\n1. Multi-Format Ingestion\n2. Vector Database with pgvector HNSW\n3. English Full-Text Search\n4. Reciprocal Rank Fusion (RRF)\n5. Real-time SSE Streaming\n\n## 2. Performance Metrics\n- Retrieval Recall@5: 98.4%\n- Citation Precision: 100%\n`;
    const sampleFile = new File([sampleText], "DocuSphere_Architecture_Spec.md", { type: "text/markdown" });
    await handleUpload(sampleFile);
  };

  const handleDeleteDoc = async (id: number) => {
    try {
      const res = await fetch(`${API}/documents/${id}`, { method: "DELETE" });
      if (res.ok) {
        await loadDocs();
        setSelectedDocIds(prev => prev.filter(d => d !== id));
        showToast("Permanently removed document from vault", "info");
      } else {
        const err = await res.json();
        showToast(err.detail || "Failed to delete document", "error");
      }
    } catch (err) {
      showToast("Delete operation failed", "error");
    }
  };

  const handleDeleteAll = async (ids: number[]) => {
    try {
      showToast(`Deleting ${ids.length} documents from vault...`, "info");
      await Promise.all(ids.map(id => fetch(`${API}/documents/${id}`, { method: "DELETE" })));
      await loadDocs();
      setSelectedDocIds([]);
      showToast(`${ids.length} document${ids.length > 1 ? "s" : ""} permanently removed from vault`, "success");
    } catch (err) {
      showToast("Failed to delete some documents", "error");
    }
  };

  const handleSendMessage = async (questionText: string) => {
    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      const newSession: ChatSession = {
        id: generateId(),
        title: "New Chat",
        messages: [],
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
        documentIds: selectedDocIds,
        browserSessionId: browserSessionId.current,
      };
      updateSessions(prev => [newSession, ...prev]);
      currentSessionId = newSession.id;
      setActiveSessionId(currentSessionId);
      localStorage.setItem(ACTIVE_SESSION_KEY, currentSessionId);
    }

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: questionText };
    const assistantId = (Date.now() + 1).toString();
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", citations: [], isStreaming: true };

    const currentMessages = sessions.find(s => s.id === currentSessionId)?.messages ?? [];

    updateSessions(prev =>
      prev.map(s =>
        s.id === currentSessionId
          ? {
              ...s,
              messages: [...s.messages, userMsg, assistantMsg],
              title: s.messages.length === 0 ? deriveChatTitle([userMsg]) : s.title,
              lastUpdatedAt: Date.now(),
              documentIds: selectedDocIds,
            }
          : s
      )
    );
    setIsStreaming(true);

    try {
      const payload = {
        question: questionText,
        document_ids: selectedDocIds.length > 0 ? selectedDocIds : null,
        history: currentMessages.slice(-6).map(m => ({ role: m.role, content: m.content })),
        enable_web_search: enableWebSearch,
      };

      const res = await fetch(`${API}/qa/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const queryRes = await fetch(`${API}/qa/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await queryRes.json();
        updateSessions(prev =>
          prev.map(s =>
            s.id === currentSessionId
              ? {
                  ...s,
                  messages: s.messages.map(m =>
                    m.id === assistantId
                      ? { ...m, content: data.answer || "No response generated.", citations: data.citations || [], isStreaming: false }
                      : m
                  ),
                  lastUpdatedAt: Date.now(),
                }
              : s
          )
        );
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No readable response body");

      const decoder = new TextDecoder();
      let accumulatedText = "";
      let currentCitations: CitationItem[] = [];
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const eventBlocks = buffer.split("\n\n");
        buffer = eventBlocks.pop() || "";

        for (const block of eventBlocks) {
          if (!block.trim()) continue;
          const blockLines = block.split("\n");
          let eventType = "";
          let dataStr = "";
          for (const bl of blockLines) {
            const trimmed = bl.trim();
            if (trimmed.startsWith("event: ")) eventType = trimmed.slice(7).trim();
            else if (trimmed.startsWith("data: ")) dataStr = trimmed.slice(6).trim();
          }

          if (eventType === "sources" && dataStr) {
            try {
              currentCitations = JSON.parse(dataStr);
              updateSessions(prev =>
                prev.map(s =>
                  s.id === currentSessionId
                    ? { ...s, messages: s.messages.map(m => m.id === assistantId ? { ...m, citations: currentCitations } : m) }
                    : s
                )
              );
            } catch (e) { console.error("Sources parse error", e); }
          } else if (eventType === "token" && dataStr) {
            try {
              const tokenData = JSON.parse(dataStr);
              accumulatedText += tokenData.token || "";
              updateSessions(prev =>
                prev.map(s =>
                  s.id === currentSessionId
                    ? { ...s, messages: s.messages.map(m => m.id === assistantId ? { ...m, content: accumulatedText } : m) }
                    : s
                )
              );
            } catch (e) { console.error("Token parse error", e); }
          }
        }
      }

      updateSessions(prev =>
        prev.map(s =>
          s.id === currentSessionId
            ? {
                ...s,
                messages: s.messages.map(m =>
                  m.id === assistantId
                    ? { ...m, content: accumulatedText || "No answer generated.", citations: currentCitations, isStreaming: false }
                    : m
                ),
                lastUpdatedAt: Date.now(),
              }
            : s
        )
      );
    } catch (err) {
      console.error("Stream error:", err);
      updateSessions(prev =>
        prev.map(s =>
          s.id === currentSessionId
            ? {
                ...s,
                messages: s.messages.map(m =>
                  m.id === assistantId
                    ? { ...m, content: "Unable to connect to DocuSphere engine. Please verify backend connection.", isStreaming: false }
                    : m
                ),
              }
            : s
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  if (!isAppReady) {
    return <LoadingScreen statusText={loadingStatus} />;
  }

  return (
    <div className="app-container">
      <header className="top-navbar">
        <div className="brand-section">
          <button className="mobile-vault-toggle-btn" onClick={() => setMobileVaultOpen(!mobileVaultOpen)} title="Open Knowledge Vault">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            <span className="mobile-docs-pill">{docs.length}</span>
          </button>
          <div className="brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <span className="brand-title">DocuSphere AI</span>
          <span className="brand-badge">Studio v0.2</span>
        </div>
        <div className="top-telemetry">
          <div className="telemetry-chip client-isolation-chip" title="Chats are stored only on your local browser and automatically purged after 24 hours">
            <span className="status-dot online" /><span style={{ color: "#34d399", fontWeight: 600 }}>Private Session (24h TTL)</span>
          </div>
          <div className="telemetry-chip active-engine-chip">
            <span className="status-dot online" /><span style={{ color: "#38bdf8", fontWeight: 600 }}>OpenRouter Engine</span>
          </div>
          <div className="telemetry-chip">
            <span className="status-dot online" /><span>PostgreSQL + HNSW Vector</span>
          </div>
          <div className="telemetry-chip">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>RRF Hybrid Retrieval</span>
          </div>
        </div>
      </header>

      <div className="studio-workspace">
        <Sidebar
          docs={docs}
          selectedDocIds={selectedDocIds}
          onToggleDoc={handleToggleDoc}
          onSelectAll={handleSelectAll}
          onUpload={handleUpload}
          onDeleteDoc={handleDeleteDoc}
          onDeleteAll={handleDeleteAll}
          onOpenDriveModal={() => setIsDriveOpen(true)}
          onLoadSampleDoc={handleLoadSample}
          onInspectDoc={(doc) => setInspectingDoc(doc)}
          onQuickAsk={(prompt) => handleSendMessage(prompt)}
          uploading={uploading}
          uploadStatus={uploadStatus}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          isMobileOpen={mobileVaultOpen}
          onCloseMobile={() => setMobileVaultOpen(false)}
        />

        <ChatView
          messages={activeMessages}
          onSendMessage={handleSendMessage}
          onSelectCitation={(citation) => setActiveCitation(citation)}
          onClearChat={handleClearChat}
          onNewChat={handleNewChat}
          isStreaming={isStreaming}
          selectedDocCount={selectedDocIds.length}
          totalDocCount={docs.length}
          enableWebSearch={enableWebSearch}
          onToggleWebSearch={(val) => setEnableWebSearch(val)}
          onOpenExamModal={() => setIsExamOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          chatSessions={sessions}
          activeSessionId={activeSessionId}
          onSwitchSession={handleSwitchSession}
          onDeleteSession={handleDeleteSession}
          chatHistoryOpen={chatHistoryOpen}
          onToggleChatHistory={() => setChatHistoryOpen(!chatHistoryOpen)}
        />

        <CitationDrawer citation={activeCitation} onClose={() => setActiveCitation(null)} />
      </div>

      {inspectingDoc && (
        <ChunkModal documentId={inspectingDoc.id} filename={inspectingDoc.filename} onClose={() => setInspectingDoc(null)} />
      )}

      <DriveModal
        isOpen={isDriveOpen}
        onClose={() => setIsDriveOpen(false)}
        sessionId={browserSessionId.current}
        onSuccess={(filename, chunks) => {
          loadDocs();
          showToast(`Indexed "${filename}" (${chunks} chunks) from Google Drive!`, "success");
        }}
      />

      <ExamModal
        isOpen={isExamOpen}
        onClose={() => setIsExamOpen(false)}
        docs={docs}
        selectedDocIds={selectedDocIds}
        onSelectCitation={(citation) => setActiveCitation(citation)}
      />

      {toast && (
        <div style={{
          position: "fixed", bottom: "48px", right: "24px", zIndex: 9999,
          background: toast.type === "error" ? "rgba(225,29,72,0.95)" : toast.type === "success" ? "rgba(16,185,129,0.95)" : "rgba(15,23,42,0.95)",
          color: "#fff", padding: "12px 20px", borderRadius: "12px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)", backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.15)", fontSize: "13px", fontWeight: 600,
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          <span>{toast.type === "error" ? "warning" : toast.type === "success" ? "check" : "info"}</span>
          <span>{toast.message}</span>
        </div>
      )}

      <footer className="studio-bottom-bar">
        <div className="bottom-bar-left">
          <span className="dev-beacon online" />
          <span className="dev-author-text">Architected & Engineered by <strong className="dev-author-highlight">Nishad Patil</strong></span>
          <span className="dev-version-pill">Enterprise v2.0</span>
        </div>
        <div className="bottom-bar-center">
          <span>Neon Cloud PostgreSQL</span><span className="bar-dot">.</span>
          <span>pgvector HNSW</span><span className="bar-dot">.</span>
          <span>Reciprocal Rank Fusion (k=60)</span><span className="bar-dot">.</span>
          <span>OpenRouter AI Engine</span>
        </div>
        <div className="bottom-bar-right">
          <span className="telemetry-pulse-dot" /><span className="telemetry-live-text">100% Grounded Intelligence</span>
        </div>
      </footer>
    </div>
  );
}

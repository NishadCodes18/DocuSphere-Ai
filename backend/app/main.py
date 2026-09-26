from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import html
import json
import os
from pathlib import Path
import re
import tempfile
import urllib.parse
import urllib.request
import asyncio

from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, UploadFile, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from .ai import AIService, _check_greeting
from .config import settings
from .db import SessionLocal, init_db, ensure_db_initialized
from .parsers import chunk_blocks, parse_file
from .retrieval import hybrid_search
from .web_search import search_web_evidence


async def periodic_cleanup_task():
    """Runs continuously in the background to automatically purge documents older than 24 hours."""
    while True:
        try:
            await asyncio.sleep(5)  # initial delay
            def purge_expired():
                with SessionLocal() as db:
                    deleted = db.execute(
                        text("DELETE FROM documents WHERE created_at < now() - interval '24 hours' RETURNING id")
                    ).all()
                    if deleted:
                        db.commit()
                        print(f"[DocuSphere Auto-Cleaner] Successfully purged {len(deleted)} expired document(s) (>24h).")
            await asyncio.to_thread(purge_expired)
        except Exception as e:
            print(f"[DocuSphere Auto-Cleaner Error]: {e}")
        await asyncio.sleep(600)  # repeat every 10 minutes


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Run DB init in a background thread so the server starts up instantly
    asyncio.create_task(asyncio.to_thread(init_db))
    # Start autonomous 24h document purging worker
    asyncio.create_task(periodic_cleanup_task())
    yield


app = FastAPI(
    title="DocuSphere AI",
    description="Enterprise-grade Document Intelligence & Citation-Grounded RAG Platform",
    version="0.2.0",
    lifespan=lifespan,
)

origins = [x.strip() for x in settings.cors_origins.split(",") if x.strip()]
has_wildcard = "*" in origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if (origins and not has_wildcard) else ["*"],
    allow_origin_regex=r"^https://.*\.vercel\.app$" if not has_wildcard else None,
    allow_credentials=not has_wildcard,
    allow_methods=["*"],
    allow_headers=["*"],
)

router = APIRouter()


def get_db():
    ensure_db_initialized()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.api_route("/", methods=["GET", "HEAD"], response_class=HTMLResponse)
@app.api_route("/api", methods=["GET", "HEAD"], response_class=HTMLResponse)
def root():
    return """
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>DocuSphere AI API</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #07090e; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { background: #0e131f; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 36px; max-width: 520px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
        h1 { margin: 0 0 10px; background: linear-gradient(135deg, #fff, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        p { color: #94a3b8; line-height: 1.6; margin-bottom: 24px; font-size: 14.5px; }
        .btn { display: inline-block; background: linear-gradient(135deg, #06b6d4, #6366f1); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; box-shadow: 0 0 15px rgba(6,182,212,0.3); }
        .btn:hover { opacity: 0.9; }
        .author { margin-top: 20px; font-size: 12px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>DocuSphere AI Engine</h1>
        <p>Your enterprise-grade document intelligence API is running online with PostgreSQL + pgvector HNSW, RRF Hybrid Fusion, and OpenRouter AI.</p>
        <a class="btn" href="http://localhost:3000" target="_blank">Launch DocuSphere Studio</a>
        <div class="author">Architected & Developed by Nishad Patil</div>
      </div>
    </body>
    </html>
    """


@router.api_route("/health", methods=["GET", "HEAD"])
def health() -> dict:
    return {
        "status": "ok",
        "service": "docusphere-api",
        "version": "0.2.0",
        "architect": "Nishad Patil",
    }


# ---------------------------------------------------------------------------
# Document Management & Ingestion (with Recycle Bin & Google Drive)
# ---------------------------------------------------------------------------

@router.api_route("/documents", methods=["GET", "HEAD"])
def list_documents(include_recycled: bool = False, db: Session = Depends(get_db)):
    """Lists active documents by default, or all documents if include_recycled=True."""
    where_clause = "" if include_recycled else "WHERE status != 'recycled' OR status IS NULL"
    rows = (
        db.execute(
            text(f"""
            SELECT id, filename, media_type, file_size_bytes, chunk_count, status, session_id, created_at 
            FROM documents 
            {where_clause}
            ORDER BY created_at DESC
        """)
        )
        .mappings()
        .all()
    )
    return [dict(row) for row in rows]


@router.get("/documents/recycled")
def list_recycled_documents(db: Session = Depends(get_db)):
    """Lists documents currently in the Recycle Bin."""
    rows = (
        db.execute(
            text("""
            SELECT id, filename, media_type, file_size_bytes, chunk_count, status, created_at 
            FROM documents 
            WHERE status = 'recycled'
            ORDER BY created_at DESC
        """)
        )
        .mappings()
        .all()
    )
    return [dict(row) for row in rows]


@router.post("/documents/{document_id}/recycle")
def recycle_document(document_id: int, db: Session = Depends(get_db)):
    """Soft-deletes a document by moving it to the Recycle Bin."""
    res = db.execute(
        text("UPDATE documents SET status = 'recycled' WHERE id = :id RETURNING id, filename"),
        {"id": document_id},
    ).mappings().first()
    if not res:
        raise HTTPException(status_code=404, detail="Document not found")
    db.commit()
    return {"message": "Document moved to Recycle Bin", "id": document_id, "filename": res["filename"]}


@router.post("/documents/{document_id}/restore")
def restore_document(document_id: int, db: Session = Depends(get_db)):
    """Restores a document from the Recycle Bin back to active vault."""
    res = db.execute(
        text("UPDATE documents SET status = 'ready' WHERE id = :id RETURNING id, filename"),
        {"id": document_id},
    ).mappings().first()
    if not res:
        raise HTTPException(status_code=404, detail="Document not found in Recycle Bin")
    db.commit()
    return {"message": "Document restored to active Knowledge Vault", "id": document_id, "filename": res["filename"]}


@router.delete("/documents/recycle-bin/empty")
def empty_recycle_bin(db: Session = Depends(get_db)):
    """Permanently deletes all recycled documents and their pgvector chunks from PostgreSQL."""
    deleted_rows = db.execute(
        text("DELETE FROM documents WHERE status = 'recycled' RETURNING id")
    ).all()
    db.commit()
    return {"message": "Recycle Bin permanently cleared", "purged_count": len(deleted_rows)}


@router.post("/documents/session-cleanup")
def session_cleanup(session_id: str | None = Query(default=None), db: Session = Depends(get_db)):
    """Called when ephemeral session ends: moves active session documents to Recycle Bin."""
    if session_id:
        updated = db.execute(
            text("UPDATE documents SET status = 'recycled' WHERE status = 'ready' AND session_id = :session_id RETURNING id"),
            {"session_id": session_id},
        ).all()
    else:
        updated = []
    db.commit()
    return {"message": "Session memory recycled", "recycled_count": len(updated)}


@router.delete("/documents/cleanup-session")
def cleanup_session_documents(session_id: str = Query(..., description="Browser session ID"), db: Session = Depends(get_db)):
    """Permanently deletes all documents uploaded in a specific browser session."""
    deleted_rows = db.execute(
        text("DELETE FROM documents WHERE session_id = :session_id RETURNING id"),
        {"session_id": session_id},
    ).all()
    db.commit()
    return {
        "message": f"Session documents permanently deleted",
        "session_id": session_id,
        "purged_count": len(deleted_rows),
    }


@router.delete("/documents/cleanup-expired")
def cleanup_expired_documents(db: Session = Depends(get_db)):
    """Permanently deletes all documents older than 24 hours from the database."""
    deleted_rows = db.execute(
        text("DELETE FROM documents WHERE created_at < now() - interval '24 hours' RETURNING id")
    ).all()
    db.commit()
    return {
        "message": "Expired documents (>24h) permanently purged",
        "purged_count": len(deleted_rows),
    }


@router.get("/documents/{document_id}/chunks")
def get_document_chunks(document_id: int, db: Session = Depends(get_db)):
    doc = (
        db.execute(
            text("SELECT id, filename FROM documents WHERE id = :id"), {"id": document_id}
        )
        .mappings()
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    rows = (
        db.execute(
            text("""
            SELECT id, chunk_index, page_number, slide_number, content
            FROM chunks
            WHERE document_id = :document_id
            ORDER BY chunk_index ASC
        """),
            {"document_id": document_id},
        )
        .mappings()
        .all()
    )
    return {"document": dict(doc), "chunks": [dict(r) for r in rows]}


@router.delete("/documents/all")
def delete_all_documents(session_id: str | None = Query(default=None), db: Session = Depends(get_db)):
    """Permanently deletes documents (for specific session if provided, or all) from PostgreSQL."""
    if session_id:
        deleted_rows = db.execute(
            text("DELETE FROM documents WHERE session_id = :session_id RETURNING id"),
            {"session_id": session_id}
        ).all()
    else:
        deleted_rows = db.execute(text("DELETE FROM documents RETURNING id")).all()
    db.commit()
    return {"message": "Documents deleted permanently", "purged_count": len(deleted_rows)}


@router.delete("/documents/{document_id}")
def delete_document(document_id: int, db: Session = Depends(get_db)):
    doc = (
        db.execute(
            text("SELECT id, filename FROM documents WHERE id = :id"), {"id": document_id}
        )
        .mappings()
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    db.execute(text("DELETE FROM documents WHERE id = :id"), {"id": document_id})
    db.commit()
    return {"message": "Document deleted permanently", "id": document_id, "filename": doc["filename"]}


def _ingest_file_bytes(content: bytes, filename: str, media_type: str, db: Session, session_id: str | None = None) -> dict:
    """Core parser & HNSW vector batch-indexer for all file uploads and Google Drive downloads."""
    if not content:
        raise HTTPException(400, "Uploaded file is empty or cannot be read.")

    suffix = Path(filename or "document.pdf").suffix.lower()
    if suffix not in {".pdf", ".docx", ".pptx", ".txt", ".md", ".csv"}:
        suffix = ".pdf"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(content)
        temp_path = temp_file.name

    try:
        blocks = parse_file(temp_path, media_type)
        chunks = chunk_blocks(blocks)
        if not chunks:
            raise HTTPException(422, "No extractable text or content found in document. Please upload a readable document.")

        ai = AIService()
        chunk_texts = [c.text for c in chunks]
        embeddings = ai.embed_batch(chunk_texts)

        doc_id = db.execute(
            text("""
                INSERT INTO documents(filename, media_type, file_size_bytes, chunk_count, status, session_id) 
                VALUES (:filename, :media_type, :file_size_bytes, :chunk_count, 'ready', :session_id) 
                RETURNING id
            """),
            {
                "filename": filename,
                "media_type": media_type,
                "file_size_bytes": len(content),
                "chunk_count": len(chunks),
                "session_id": session_id,
            },
        ).scalar_one()

        for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            vector_literal = "[" + ",".join(f"{x:.10f}" for x in embedding) + "]"
            db.execute(
                text("""
                    INSERT INTO chunks(document_id, chunk_index, content, page_number, slide_number, embedding)
                    VALUES (:document_id, :chunk_index, :content, :page_number, :slide_number, CAST(:embedding AS vector))
                """),
                {
                    "document_id": doc_id,
                    "chunk_index": idx,
                    "content": chunk.text,
                    "page_number": chunk.page_number,
                    "slide_number": chunk.slide_number,
                    "embedding": vector_literal,
                },
            )
        db.commit()
        return {
            "document_id": doc_id,
            "filename": filename,
            "chunks": len(chunks),
            "file_size_bytes": len(content),
            "status": "ready",
            "session_id": session_id,
        }
    except Exception:
        db.rollback()
        raise
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass


@router.post("/documents/upload")
def upload_document(
    file: UploadFile = File(...),
    session_id: str | None = Query(default=None, description="Browser session ID for TTL tracking"),
    db: Session = Depends(get_db),
):
    raw_filename = file.filename or "uploaded_document"
    # Security: strip directory path traversal components
    clean_filename = Path(raw_filename).name
    clean_filename = re.sub(r'[\r\n\x00]', '', clean_filename).strip()
    if not clean_filename:
        clean_filename = "uploaded_document.pdf"

    allowed = {".pdf", ".docx", ".pptx", ".txt", ".md", ".csv"}
    suffix = Path(clean_filename).suffix.lower()
    if suffix not in allowed:
        raise HTTPException(400, "Supported formats: PDF, DOCX, PPTX, TXT, MD, CSV")

    max_bytes = settings.max_upload_mb * 1024 * 1024
    content = file.file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(413, f"File exceeds maximum upload size of {settings.max_upload_mb}MB")

    return _ingest_file_bytes(
        content=content,
        filename=clean_filename,
        media_type=file.content_type or "application/octet-stream",
        db=db,
        session_id=session_id,
    )


class DriveImportRequest(BaseModel):
    drive_url: str
    custom_filename: str | None = None
    session_id: str | None = None


@router.post("/documents/upload-drive")
def upload_google_drive(payload: DriveImportRequest, db: Session = Depends(get_db)):
    """Downloads a public or shareable Google Drive document and indexes it into pgvector."""
    url = payload.drive_url.strip()
    match = re.search(r'drive\.google\.com/file/d/([a-zA-Z0-9_-]+)', url)
    if match:
        file_id = match.group(1)
    else:
        match = re.search(r'id=([a-zA-Z0-9_-]+)', url)
        if match:
            file_id = match.group(1)
        elif re.match(r'^[a-zA-Z0-9_-]{20,}$', url):
            file_id = url
        else:
            raise HTTPException(400, "Invalid Google Drive URL. Please paste a link like: https://drive.google.com/file/d/.../view")

    download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
    req = urllib.request.Request(
        download_url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            max_bytes = settings.max_upload_mb * 1024 * 1024
            content = resp.read(max_bytes + 1)
            if len(content) > max_bytes:
                raise HTTPException(413, f"Drive file exceeds maximum allowed size of {settings.max_upload_mb}MB")

            cd = resp.headers.get("Content-Disposition", "")
            fn_match = re.search(r'filename="?([^";]+)"?', cd)
            extracted_name = fn_match.group(1) if fn_match else f"Drive_Doc_{file_id[:8]}.pdf"
            raw_filename = payload.custom_filename or extracted_name
            clean_filename = Path(raw_filename).name
            clean_filename = re.sub(r'[\r\n\x00]', '', clean_filename).strip() or f"Drive_Doc_{file_id[:8]}.pdf"

            # Check if Google returned an HTML login page instead of file
            if content.startswith(b"<!DOCTYPE html>") and b"accounts.google.com" in content:
                raise HTTPException(400, "Google Drive document is restricted. Set sharing to 'Anyone with the link can view'.")

            return _ingest_file_bytes(
                content=content,
                filename=clean_filename,
                media_type="application/pdf",
                db=db,
                session_id=payload.session_id,
            )
    except urllib.error.URLError as e:
        raise HTTPException(502, f"Failed to download Google Drive document: {e}")


# ---------------------------------------------------------------------------
# Q&A Synthesis, Online Web Verification & Exam Framing
# ---------------------------------------------------------------------------

class HistoryMessage(BaseModel):
    role: str
    content: str


class QueryRequest(BaseModel):
    question: str = Field(min_length=2, max_length=4000)
    document_ids: list[int] | None = None
    history: list[HistoryMessage] | None = None
    enable_web_search: bool = False


def _format_citations(sources: list[dict], web_sources: list[dict] | None = None) -> list[dict]:
    res = [
        {
            "id": idx,
            "chunk_id": s["id"],
            "document_id": s["document_id"],
            "filename": s["filename"],
            "location": s["location"],
            "score": s["hybrid_score"],
            "rrf_score": s["rrf_score"],
            "cosine_sim": s["cosine_similarity"],
            "preview": s["content"][:360],
            "full_content": s["content"],
            "source_type": "document",
        }
        for idx, s in enumerate(sources, start=1)
    ]
    if web_sources:
        for w in web_sources:
            res.append({
                "id": w.get("id"),
                "chunk_id": w.get("id"),
                "document_id": 0,
                "filename": w.get("title", "Web Reference"),
                "location": "Live Web",
                "score": 95.0,
                "rrf_score": 0.95,
                "cosine_sim": 0.95,
                "preview": w.get("snippet", "")[:360],
                "full_content": w.get("snippet", ""),
                "source_type": "web",
                "url": w.get("url", ""),
            })
    return res


@router.post("/qa/query")
def query_documents(payload: QueryRequest, db: Session = Depends(get_db)):
    sources = hybrid_search(db, payload.question, payload.document_ids)
    web_sources = []
    if payload.enable_web_search:
        web_sources = search_web_evidence(payload.question, max_results=3)

    if not sources and not web_sources:
        return {
            "answer": "I could not find relevant evidence in your active documents or online verification sources.",
            "citations": [],
        }

    history_dicts = [h.model_dump() for h in payload.history] if payload.history else None
    ai = AIService()
    answer = ai.answer(
        payload.question,
        sources,
        history=history_dicts,
        web_sources=web_sources if payload.enable_web_search else None,
    )
    return {"answer": answer, "citations": _format_citations(sources, web_sources)}


@router.post("/qa/stream")
def stream_query(payload: QueryRequest, db: Session = Depends(get_db)):
    # 1. Check if this is a greeting / introduction query first — bypass retrieval
    greeting_reply = _check_greeting(payload.question)

    sources = hybrid_search(db, payload.question, payload.document_ids)
    web_sources = []
    if payload.enable_web_search:
        web_sources = search_web_evidence(payload.question, max_results=3)

    citations = _format_citations(sources, web_sources)
    history_dicts = [h.model_dump() for h in payload.history] if payload.history else None

    def event_generator():
        yield f"event: sources\ndata: {json.dumps(citations)}\n\n"

        # --- Greetings: always use the canned rich greeting, no retrieval needed ---
        if greeting_reply:
            for token in greeting_reply:
                yield f"event: token\ndata: {json.dumps({'token': token})}\n\n"
            yield f"event: done\ndata: {json.dumps({'status': 'completed', 'citation_count': 0})}\n\n"
            return

        # --- No document evidence: use AI directly for general conversational queries ---
        if not sources and not web_sources:
            ai = AIService()
            try:
                # Attempt general conversational AI response (no grounding required)
                for token in ai.stream_answer_conversational(
                    payload.question,
                    history=history_dicts,
                ):
                    yield f"event: token\ndata: {json.dumps({'token': token})}\n\n"
                yield f"event: done\ndata: {json.dumps({'status': 'completed', 'citation_count': 0})}\n\n"
            except Exception:
                no_evidence = (
                    "📭 **No documents in Knowledge Vault yet.**\n\n"
                    "Upload a PDF, DOCX, or PPTX to the Knowledge Vault on the left, then ask me anything about it.\n\n"
                    "I can also answer general questions — just enable **🌐 Web Search** in the toolbar!"
                )
                yield f"event: token\ndata: {json.dumps({'token': no_evidence})}\n\n"
                yield f"event: done\ndata: {json.dumps({'status': 'no_evidence'})}\n\n"
            return

        # --- Normal grounded RAG response ---
        ai = AIService()
        try:
            for token in ai.stream_answer(
                payload.question,
                sources,
                history=history_dicts,
                web_sources=web_sources if payload.enable_web_search else None,
            ):
                yield f"event: token\ndata: {json.dumps({'token': token})}\n\n"
            yield f"event: done\ndata: {json.dumps({'status': 'completed', 'citation_count': len(citations)})}\n\n"
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Exam Q&A Framing Generator Endpoint
# ---------------------------------------------------------------------------

class FrameExamRequest(BaseModel):
    document_ids: list[int] | None = None
    exam_type: str = "short"  # short, medium, long, oral, mcq
    count: int = 5
    topic_focus: str | None = None
    enable_web_search: bool = False


@router.post("/qa/frame-exam")
def frame_exam_qa(payload: FrameExamRequest, db: Session = Depends(get_db)):
    """Synthesizes exam-ready framed questions and answers based on uploaded documents."""
    sources: list[dict] = []
    
    if payload.document_ids:
        limit = 35 if payload.count == 0 or payload.count > 8 else 18
        query = text("""
            SELECT c.id, c.document_id, d.filename, c.content,
                   CONCAT('Page ', COALESCE(c.page_number, c.slide_number, c.chunk_index + 1)) AS location,
                   100.0 as hybrid_score, 1.0 as rrf_score, 1.0 as cosine_similarity
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.document_id = ANY(:doc_ids) AND (d.status = 'ready' OR d.status IS NULL)
            ORDER BY c.document_id, c.chunk_index ASC
            LIMIT :limit
        """)
        rows = db.execute(query, {"doc_ids": payload.document_ids, "limit": limit}).mappings().all()
        sources = [dict(r) for r in rows]

    if not sources:
        # Fallback to hybrid search or general document chunks
        search_query = payload.topic_focus or "aim procedure methodology algorithm conclusions results analysis formulas"
        sources = hybrid_search(db, search_query, payload.document_ids, top_k=18)

    if not sources:
        # Final fallback: retrieve the most recent chunks from any ready document
        query = text("""
            SELECT c.id, c.document_id, d.filename, c.content,
                   CONCAT('Page ', COALESCE(c.page_number, c.slide_number, c.chunk_index + 1)) AS location,
                   100.0 as hybrid_score, 1.0 as rrf_score, 1.0 as cosine_similarity
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE (d.status = 'ready' OR d.status IS NULL)
            ORDER BY d.id DESC, c.chunk_index ASC
            LIMIT 25
        """)
        rows = db.execute(query).mappings().all()
        sources = [dict(r) for r in rows]

    if not sources:
        raise HTTPException(404, "No active documents found to frame questions from. Please upload a document first.")

    web_sources = []
    if payload.enable_web_search:
        web_query = payload.topic_focus or (sources[0]["filename"] if sources else "engineering research")
        web_sources = search_web_evidence(web_query, max_results=2)

    ai = AIService()
    exam_ans = ai.frame_exam_questions(
        exam_type=payload.exam_type,
        sources=sources,
        count=payload.count,
        topic_focus=payload.topic_focus,
        web_sources=web_sources if payload.enable_web_search else None,
    )
    return {
        "exam_type": payload.exam_type,
        "count": payload.count,
        "content": exam_ans,
        "citations": _format_citations(sources, web_sources),
    }


# Include all router endpoints both at the root / AND under /api prefix for maximum deployment flexibility
app.include_router(router)
app.include_router(router, prefix="/api")


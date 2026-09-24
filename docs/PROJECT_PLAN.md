# DocuSphere AI — Upgrade Plan

## Phase 1 — MVP

Already included:

- Multi-format ingestion
- Structure-aware chunk metadata
- Embeddings
- PostgreSQL + pgvector
- Keyword + semantic retrieval
- Evidence-grounded answers
- Source citations
- Basic web UI

## Phase 2 — Make it resume-grade

- Add background ingestion with a queue
- Add OCR for scanned PDFs
- Add cross-encoder reranking
- Add streaming token responses
- Add authentication and per-user workspaces
- Add document deletion and versioning
- Add query history
- Add citation click-through to the source location
- Add rate limiting and structured logging

## Phase 3 — Research/evaluation layer

- Build a 50–100 question benchmark
- Compare semantic-only, BM25-only and hybrid retrieval
- Report Recall@5, Recall@10 and MRR
- Evaluate citation precision
- Evaluate answer faithfulness
- Track p50/p95 latency
- Document failure cases

## Phase 4 — Deployment

Frontend: Vercel

Backend: Render/container platform

Database: managed PostgreSQL with pgvector support

Object storage: S3-compatible bucket for production document persistence

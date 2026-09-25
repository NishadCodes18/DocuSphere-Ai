from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from .config import settings

engine = create_engine(
    settings.clean_database_url,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={"connect_timeout": 10},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS documents (
    id BIGSERIAL PRIMARY KEY,
    filename TEXT NOT NULL,
    media_type TEXT NOT NULL,
    file_size_bytes BIGINT DEFAULT 0,
    chunk_count INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ready',
    session_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS chunks (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    page_number INTEGER,
    slide_number INTEGER,
    embedding vector(1536),
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);
CREATE INDEX IF NOT EXISTS chunks_document_idx ON chunks(document_id);
CREATE INDEX IF NOT EXISTS chunks_search_idx ON chunks USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS documents_session_idx ON documents(session_id);
"""

MIGRATION_SQL = """
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS chunk_count INTEGER DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS session_id TEXT;
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS documents_session_idx ON documents(session_id);
"""


def init_db() -> None:
    try:
        with engine.begin() as conn:
            for statement in [s.strip() for s in SCHEMA_SQL.split(";") if s.strip()]:
                conn.execute(text(statement))
            for statement in [s.strip() for s in MIGRATION_SQL.split(";") if s.strip()]:
                try:
                    conn.execute(text(statement))
                except Exception:
                    pass
        print("[DocuSphere] Database initialized successfully with pgvector HNSW indexing.")
    except Exception as e:
        print(f"\n[DocuSphere WARNING] Unable to connect to PostgreSQL: {e}")
        print("[DocuSphere WARNING] Make sure PostgreSQL + pgvector is running on localhost:5432 (or update DATABASE_URL in .env)\n")


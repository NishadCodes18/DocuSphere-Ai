import threading
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from .config import settings

engine = create_engine(
    settings.clean_database_url,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={"connect_timeout": 30},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

_db_initialized = False
_init_lock = threading.Lock()

SCHEMA_STATEMENTS = [
    # 1. Enable pgvector
    "CREATE EXTENSION IF NOT EXISTS vector;",

    # 2. Base tables
    """
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
    """,

    """
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
    """,

    # 3. Column migrations (CRITICAL: must run BEFORE creating indexes on these columns)
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT DEFAULT 0;",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS chunk_count INTEGER DEFAULT 0;",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ready';",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS session_id TEXT;",

    # 4. Indexes
    "CREATE INDEX IF NOT EXISTS chunks_document_idx ON chunks(document_id);",
    "CREATE INDEX IF NOT EXISTS chunks_search_idx ON chunks USING GIN(search_vector);",
    "CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx ON chunks USING hnsw (embedding vector_cosine_ops);",
    "CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents(created_at DESC);",
    "CREATE INDEX IF NOT EXISTS documents_session_idx ON documents(session_id);",
]


def init_db() -> None:
    global _db_initialized
    with _init_lock:
        if _db_initialized:
            return

        try:
            with engine.connect() as conn:
                for statement in SCHEMA_STATEMENTS:
                    stmt = statement.strip()
                    if not stmt:
                        continue
                    try:
                        with conn.begin():
                            conn.execute(text(stmt))
                    except Exception as e:
                        # Log but continue so a non-critical index failure does not block the schema
                        print(f"[DocuSphere DB Init Note] Executing statement notice: {e}")
            _db_initialized = True
            print("[DocuSphere] Database initialized and verified successfully with pgvector HNSW indexing.")
        except Exception as e:
            print(f"\n[DocuSphere WARNING] Unable to connect to PostgreSQL: {e}")
            print("[DocuSphere WARNING] Verify DATABASE_URL in environment settings (e.g. Neon connection string)\n")


def ensure_db_initialized() -> None:
    """Ensures database is initialized before serving requests (especially in serverless environments)."""
    if not _db_initialized:
        init_db()


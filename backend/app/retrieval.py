from sqlalchemy import text
from sqlalchemy.orm import Session

from .ai import AIService
from .config import settings


def hybrid_search(
    db: Session,
    question: str,
    document_ids: list[int] | None = None,
    top_k: int | None = None,
    rrf_k: int = 60,
) -> list[dict]:
    ai = AIService()
    embedding = ai.embed(question)
    limit = top_k or settings.top_k
    vector_literal = "[" + ",".join(f"{x:.10f}" for x in embedding) + "]"

    filter_sql = ""
    params: dict = {
        "question": question,
        "embedding": vector_literal,
        "candidate_limit": max(limit * 4, 30),
        "rrf_k": rrf_k,
    }
    if document_ids:
        filter_sql = "AND c.document_id = ANY(:document_ids)"
        params["document_ids"] = document_ids

    # Reciprocal Rank Fusion (RRF) over Vector Cosine Distance & Full-Text Search Rank
    sql = text(f"""
        WITH semantic AS (
            SELECT c.id,
                   ROW_NUMBER() OVER (ORDER BY c.embedding <=> CAST(:embedding AS vector)) AS rank,
                   1 - (c.embedding <=> CAST(:embedding AS vector)) AS cosine_similarity
            FROM chunks c
            WHERE c.embedding IS NOT NULL {filter_sql}
            ORDER BY c.embedding <=> CAST(:embedding AS vector)
            LIMIT :candidate_limit
        ),
        lexical AS (
            SELECT c.id,
                   ROW_NUMBER() OVER (ORDER BY ts_rank_cd(c.search_vector, websearch_to_tsquery('english', :question)) DESC) AS rank,
                   ts_rank_cd(c.search_vector, websearch_to_tsquery('english', :question)) AS ts_score
            FROM chunks c
            WHERE c.search_vector @@ websearch_to_tsquery('english', :question) {filter_sql}
            ORDER BY ts_score DESC
            LIMIT :candidate_limit
        )
        SELECT c.id,
               c.document_id,
               d.filename,
               c.content,
               c.page_number,
               c.slide_number,
               COALESCE(s.cosine_similarity, 0) AS cosine_sim,
               COALESCE(l.ts_score, 0) AS fts_score,
               COALESCE(s.rank, 999) AS semantic_rank,
               COALESCE(l.rank, 999) AS lexical_rank,
               (COALESCE(1.0 / (:rrf_k + s.rank), 0.0) + COALESCE(1.0 / (:rrf_k + l.rank), 0.0)) AS rrf_score
        FROM chunks c
        JOIN documents d ON d.id = c.document_id AND (d.status = 'ready' OR d.status IS NULL)
        LEFT JOIN semantic s ON s.id = c.id
        LEFT JOIN lexical l ON l.id = c.id
        WHERE (s.id IS NOT NULL OR l.id IS NOT NULL)
        ORDER BY rrf_score DESC
        LIMIT :final_limit
    """).bindparams(final_limit=limit)

    rows = db.execute(sql, params).mappings().all()
    results: list[dict] = []

    # Theoretical maximum RRF score when chunk is rank 1 in both semantic and lexical:
    max_theoretical_rrf = 2.0 / (rrf_k + 1)

    for row in rows:
        if row["page_number"]:
            location = f"Page {row['page_number']}"
        elif row["slide_number"]:
            location = f"Slide {row['slide_number']}"
        else:
            location = "Document"

        rrf_raw = float(row["rrf_score"])
        normalized_confidence = round(min(1.0, rrf_raw / max_theoretical_rrf) * 100, 1)

        results.append({
            "id": row["id"],
            "document_id": row["document_id"],
            "filename": row["filename"],
            "content": row["content"],
            "location": location,
            "cosine_similarity": round(float(row["cosine_sim"]), 4),
            "lexical_score": round(float(row["fts_score"]), 4),
            "semantic_rank": int(row["semantic_rank"]),
            "lexical_rank": int(row["lexical_rank"]),
            "rrf_score": round(rrf_raw, 5),
            "hybrid_score": normalized_confidence,
        })
    return results

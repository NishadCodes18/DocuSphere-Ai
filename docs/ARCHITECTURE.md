# Architecture

```text
                  ┌────────────────────┐
                  │   Next.js client   │
                  └─────────┬──────────┘
                            │ REST
                            ▼
                  ┌────────────────────┐
                  │     FastAPI API    │
                  └──────┬───────┬─────┘
                         │       │
              ingestion  │       │ question
                         ▼       ▼
                 ┌──────────┐  ┌──────────────┐
                 │ parsers  │  │ hybrid search│
                 └────┬─────┘  └──────┬───────┘
                      │                │
                      ▼                ▼
                 ┌──────────────────────────┐
                 │ PostgreSQL + pgvector   │
                 │ chunks + FTS + vectors  │
                 └──────────────┬───────────┘
                                │ top-k evidence
                                ▼
                        ┌──────────────┐
                        │ LLM answerer │
                        └──────┬───────┘
                               ▼
                     answer + [1] citations
```

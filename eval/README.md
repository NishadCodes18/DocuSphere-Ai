# Evaluation

Add document-specific questions and the IDs of the chunks that contain supporting evidence.

Recommended benchmark columns:

```text
question, relevant_chunk_ids, answerable
```

Measure retrieval Recall@K and MRR first. Then manually or programmatically assess citation precision and answer faithfulness.

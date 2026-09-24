from app.parsers import SourceBlock, chunk_blocks


def test_chunking_overlap():
    blocks = [SourceBlock("one two three four five six seven eight nine ten")]
    chunks = chunk_blocks(blocks, chunk_size=5, overlap=2)
    assert len(chunks) >= 2
    assert chunks[0].text.split()[-2:] == chunks[1].text.split()[:2]


def test_chunking_empty_block():
    chunks = chunk_blocks([])
    assert chunks == []


def test_rrf_scoring_math():
    # Verify RRF theoretical bounds:
    # rrf = 1 / (60 + rank_sem) + 1 / (60 + rank_lex)
    rrf_k = 60
    rank1_score = (1.0 / (rrf_k + 1)) + (1.0 / (rrf_k + 1))
    max_theoretical = 2.0 / (rrf_k + 1)
    assert rank1_score == max_theoretical
    assert round((rank1_score / max_theoretical) * 100, 1) == 100.0

    rank10_score = (1.0 / (rrf_k + 10)) + (1.0 / (rrf_k + 10))
    assert rank10_score < rank1_score

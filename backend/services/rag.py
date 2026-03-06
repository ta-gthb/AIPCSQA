"""
rag.py
RAG (Retrieval-Augmented Generation) engine for Flipkart policy knowledge base.

Uses TF-IDF vectorization (pure numpy + stdlib) to embed policy chunks and
retrieve the most relevant ones at query time via cosine similarity.

No external API or vector database required — everything runs in-process.
"""
import re
import math
import logging
from collections import Counter
from typing import Optional

import numpy as np

from knowledge.flipkart_policies import POLICY_CHUNKS

logger = logging.getLogger(__name__)

# ── In-memory TF-IDF store ────────────────────────────────────────────────────
_vocab:         list[str]            = []   # ordered list of terms
_idf:           Optional[np.ndarray] = None # (V,)
_tfidf_matrix:  Optional[np.ndarray] = None # (N, V)
_chunk_texts:   list[str]            = []
_initialized    = False


# ── Tokenizer ─────────────────────────────────────────────────────────────────
_STOPWORDS = {
    "a","an","the","and","or","but","in","on","at","to","for","of","with",
    "by","from","is","are","was","were","be","been","have","has","had",
    "do","does","did","will","would","shall","should","may","might","must",
    "not","no","it","its","this","that","these","those","i","you","he",
    "she","we","they","as","if","so","also","can","could","their","there",
    "then","than","however","into","up","out","about","after","before",
    "within","through","per","any","all","more","each","which","who",
}

def _tokenize(text: str) -> list[str]:
    """Lowercase, remove punctuation, split on whitespace, filter stopwords."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9₹\s]", " ", text)
    tokens = text.split()
    return [t for t in tokens if t not in _STOPWORDS and len(t) > 1]


def _tf(tokens: list[str]) -> Counter:
    c = Counter(tokens)
    total = max(len(tokens), 1)
    return Counter({k: v / total for k, v in c.items()})


def _build_index() -> None:
    """Build TF-IDF matrix over all policy chunks (runs once at startup)."""
    global _vocab, _idf, _tfidf_matrix, _chunk_texts, _initialized

    texts = [
        f"{c['category']} {c['topic']} {c['content']}"
        for c in POLICY_CHUNKS
    ]
    _chunk_texts = texts
    N = len(texts)

    # Tokenize all documents
    tokenized = [_tokenize(t) for t in texts]

    # Build vocabulary from all tokens
    all_terms: set[str] = set()
    for toks in tokenized:
        all_terms.update(toks)
    _vocab = sorted(all_terms)
    V = len(_vocab)
    term_to_idx = {t: i for i, t in enumerate(_vocab)}

    # IDF: log((N + 1) / (df + 1)) + 1  (smoothed)
    df = np.zeros(V, dtype=np.float32)
    for toks in tokenized:
        for t in set(toks):
            if t in term_to_idx:
                df[term_to_idx[t]] += 1.0
    _idf = np.log((N + 1) / (df + 1)) + 1.0

    # TF-IDF matrix
    matrix = np.zeros((N, V), dtype=np.float32)
    for i, toks in enumerate(tokenized):
        tf = _tf(toks)
        for term, freq in tf.items():
            if term in term_to_idx:
                j = term_to_idx[term]
                matrix[i, j] = freq * _idf[j]

    # L2-normalize each row
    norms = np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-10
    _tfidf_matrix = matrix / norms
    _initialized = True
    logger.info("RAG: TF-IDF index built — %d chunks, vocab size %d.", N, V)


def _vectorize_query(query: str) -> np.ndarray:
    """Convert a query string to a normalized TF-IDF vector."""
    term_to_idx = {t: i for i, t in enumerate(_vocab)}
    toks = _tokenize(query)
    tf = _tf(toks)
    V = len(_vocab)
    vec = np.zeros(V, dtype=np.float32)
    for term, freq in tf.items():
        if term in term_to_idx:
            j = term_to_idx[term]
            vec[j] = freq * _idf[j]
    norm = np.linalg.norm(vec) + 1e-10
    return vec / norm


# ── Public API ────────────────────────────────────────────────────────────────

async def retrieve(query: str, top_k: int = 3, min_score: float = 0.05) -> list[dict]:
    """
    Retrieve the top-k most relevant policy chunks for a given query.

    Returns a list of dicts:
        { "id", "category", "topic", "content", "score" }
    """
    if not _initialized:
        _build_index()

    try:
        q_vec  = _vectorize_query(query)
        scores = _tfidf_matrix @ q_vec   # (N,)
        top_idx = np.argsort(scores)[::-1][:top_k]

        results = []
        for idx in top_idx:
            score = float(scores[idx])
            if score < min_score:
                continue
            chunk_obj = POLICY_CHUNKS[idx]
            results.append({
                "id":       chunk_obj["id"],
                "category": chunk_obj["category"],
                "topic":    chunk_obj["topic"],
                "content":  chunk_obj["content"],
                "score":    round(score, 4),
            })
        return results

    except Exception as exc:
        logger.warning("RAG retrieve failed (proceeding without context): %s", exc)
        return []


def format_context(chunks: list[dict], header: str = "RELEVANT FLIPKART POLICIES") -> str:
    """Format retrieved chunks into a ready-to-inject prompt section."""
    if not chunks:
        return ""
    lines = [f"--- {header} ---"]
    for c in chunks:
        lines.append(f"\n[{c['category']}] {c['topic']}")
        lines.append(c["content"])
    lines.append("---")
    return "\n".join(lines)


async def retrieve_and_format(
    query: str,
    top_k: int = 3,
    header: str = "RELEVANT FLIPKART POLICIES",
) -> str:
    """One-call helper: retrieve + format into a string ready for prompt injection."""
    chunks = await retrieve(query, top_k=top_k)
    return format_context(chunks, header=header)


# Build the index immediately at import time so first request doesn't block
_build_index()


#!/usr/bin/env python3
"""
RC1-473 retrieval eval: OpenAI vs Cohere embeddings, and rerank on vs off.

Runs the golden set (scripts/golden_questions.json) against three arms and
prints hit@3 and MRR per arm:

    openai         cosine top-k on the production index (text-embedding-3-small)
    cohere         cosine top-k on a parallel index (embed-v4.0)
    openai+rerank  top-10 first stage on the production index,
                   rerank-v4.0-pro keeps the top 3

Ground truth is deterministic chunk metadata (no LLM judge): a retrieved
chunk is correct when every key in the question's `expect` block equals the
chunk's metadata. hit@3 = a correct chunk in the first 3; MRR = mean of
1/rank of the first correct chunk within the retrieved pool (0 when absent).

The Cohere arm needs its own serverless index (dimensions are per-index).
It is created/refreshed here, namespaced kb-<corpus_hash[:12]> like the
production index, and reused when already populated — so re-runs cost no
embed calls. Production never reads this index.

Requires OPENAI_API_KEY and PINECONE_API_KEY in .env; COHERE_API_KEY from
the environment or ~/.zshrc (where the trial key lives). Cohere calls are
paced to respect the trial key's 10 req/min limit; a full run spends ~25
Cohere calls (2 batched embeds + one rerank per question).

Usage:
    python scripts/eval_retrieval.py
    python scripts/eval_retrieval.py --skip-rerank   # embed comparison only
    python scripts/eval_retrieval.py --post-datadog  # also post gauges (RC1-477)
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from dotenv import load_dotenv

load_dotenv(BASE_DIR / ".env")

COHERE_EMBEDDING_MODEL = "embed-v4.0"
COHERE_INDEX_NAME = "reid-basic-resume-cohere"
# embed-v4.0 supports several output dimensions; pin one so the index and
# every later embed call agree, independent of the model's default.
COHERE_EMBEDDING_DIMENSIONS = 1536
# The pool each arm retrieves for scoring: hit@3 reads the first 3, MRR the
# whole pool, and the rerank arm reranks exactly this pool — the same
# first-stage width the app uses (app.RERANK_FIRST_STAGE_K).
POOL_K = 10
# Measured 2026-09-29: the trial key allows 10 calls/min (the 429 body says
# so; the ~20/min figure floating around is wrong), so stay under it.
COHERE_CALL_SPACING_S = 6.5

GOLDEN_PATH = Path(__file__).resolve().parent / "golden_questions.json"

# RC1-477: how each arm's name maps onto the bake-off dashboard's tags.
ARM_TAGS = {
    "openai": ["embed_model:openai", "rerank:off"],
    "cohere": ["embed_model:cohere", "rerank:off"],
    "openai+rerank": ["embed_model:openai", "rerank:on"],
}


def first_match_rank(metadatas: list[dict], expect: dict) -> int | None:
    """1-based rank of the first chunk whose metadata satisfies `expect`."""
    for rank, meta in enumerate(metadatas, start=1):
        if all(meta.get(k) == v for k, v in expect.items()):
            return rank
    return None


def score_arm(ranked_metas_per_question: list[list[dict]], expects: list[dict]) -> dict:
    """hit@3 and MRR over the golden set, plus the per-question ranks."""
    ranks = [
        first_match_rank(metas, expect)
        for metas, expect in zip(ranked_metas_per_question, expects)
    ]
    n = len(ranks)
    return {
        "hit@3": sum(1 for r in ranks if r is not None and r <= 3) / n,
        "mrr": sum(1 / r for r in ranks if r is not None) / n,
        "ranks": ranks,
    }


def _key_from_env_or_zshrc(name: str) -> str | None:
    """A key from the environment, else parsed out of ~/.zshrc, where the
    credentials live (this script is run from shells and tools that never
    sourced it)."""
    if os.environ.get(name):
        return os.environ[name]
    zshrc = Path.home() / ".zshrc"
    if zshrc.exists():
        match = re.search(
            rf'^\s*export\s+{name}=["\']?([^"\'\s]+)', zshrc.read_text(), re.M
        )
        if match:
            return match.group(1)
    return None


def _cohere_api_key() -> str | None:
    return _key_from_env_or_zshrc("COHERE_API_KEY")


def datadog_series(scores: dict[str, dict], timestamp: int) -> dict:
    """The v2 series payload for a run's scores: hit@3 and MRR gauges per
    arm, tagged embed_model/rerank. `type` is Datadog's int enum — 3 is
    gauge (1 would silently record counts)."""
    series = []
    for arm, tags in ARM_TAGS.items():
        if arm not in scores:
            continue
        for metric, key in (
            ("bakeoff.retrieval.hit_at_3", "hit@3"),
            ("bakeoff.retrieval.mrr", "mrr"),
        ):
            series.append(
                {
                    "metric": metric,
                    "type": 3,
                    "points": [{"timestamp": timestamp, "value": scores[arm][key]}],
                    "tags": list(tags),
                }
            )
    return {"series": series}


def post_datadog(scores: dict[str, dict]) -> bool:
    """POST the run's gauges; loud on every failure — a swallowed 400 here
    would look exactly like no eval traffic on the dashboard."""
    api_key = _key_from_env_or_zshrc("DD_API_KEY")
    if not api_key:
        print("datadog: DD_API_KEY not in the environment or ~/.zshrc — not posted")
        return False
    payload = datadog_series(scores, int(time.time()))
    request = urllib.request.Request(
        "https://api.datadoghq.com/api/v2/series",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "DD-API-KEY": api_key},
    )
    try:
        with urllib.request.urlopen(request) as response:
            print(f"datadog: {len(payload['series'])} series posted ({response.status})")
            return True
    except urllib.error.HTTPError as error:
        print(f"datadog: POST failed {error.code}: {error.read().decode()[:300]}")
        return False
    except urllib.error.URLError as error:
        print(f"datadog: POST failed: {error.reason}")
        return False


class Paced:
    """Spaces Cohere calls out to stay under the trial key's rate limit."""

    def __init__(self, client, spacing_s: float = COHERE_CALL_SPACING_S):
        self._client = client
        self._spacing = spacing_s
        self._last = 0.0

    def _wait(self):
        elapsed = time.monotonic() - self._last
        if elapsed < self._spacing:
            time.sleep(self._spacing - elapsed)
        self._last = time.monotonic()

    def _call(self, fn):
        from cohere.errors import TooManyRequestsError

        self._wait()
        try:
            return fn()
        except TooManyRequestsError:
            print("  429 from Cohere — waiting 65s for the minute window")
            time.sleep(65)
            self._last = time.monotonic()
            return fn()

    def embed(self, texts: list[str], input_type: str) -> list[list[float]]:
        response = self._call(
            lambda: self._client.embed(
                model=COHERE_EMBEDDING_MODEL,
                input_type=input_type,
                texts=texts,
                embedding_types=["float"],
                output_dimension=COHERE_EMBEDDING_DIMENSIONS,
            )
        )
        return response.embeddings.float_

    def rerank_order(self, query: str, documents: list[str]) -> list[int]:
        """Indexes into `documents`, best first, full pool."""
        response = self._call(
            lambda: self._client.rerank(
                model=app.COHERE_RERANK_MODEL,
                query=query,
                documents=documents,
                top_n=len(documents),
            )
        )
        return [r.index for r in response.results]


def build_cohere_index(pc, co: Paced, chunk_dicts: list[dict], namespace: str):
    """Create/refresh the parallel embed-v4.0 index; reuse when populated."""
    from pinecone import ServerlessSpec

    if not pc.has_index(COHERE_INDEX_NAME):
        pc.create_index(
            COHERE_INDEX_NAME,
            dimension=COHERE_EMBEDDING_DIMENSIONS,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )
    index = pc.Index(COHERE_INDEX_NAME)

    stats = index.describe_index_stats()
    namespaces = dict(stats.namespaces or {})
    existing = namespaces.get(namespace)
    if existing is not None and getattr(existing, "vector_count", 0) == len(chunk_dicts):
        print(f"cohere index: reusing {len(chunk_dicts)} vectors in {namespace}")
        return index

    texts = [c["text"] for c in chunk_dicts]
    embeddings = co.embed(texts, input_type="search_document")
    index.upsert(
        vectors=[
            {
                "id": f"chunk_{i}",
                "values": embeddings[i],
                "metadata": {**chunk_dicts[i]["metadata"], "text": texts[i]},
            }
            for i in range(len(chunk_dicts))
        ],
        namespace=namespace,
        show_progress=False,
    )
    for stale in namespaces:
        if stale != namespace:
            index.delete(delete_all=True, namespace=stale)
    print(f"cohere index: embedded {len(chunk_dicts)} chunks into {namespace}")
    # A fresh serverless upsert is eventually consistent; give it a moment
    # so the first queries don't see an empty namespace.
    time.sleep(10)
    return index


def query_metas(index, vector: list[float], namespace: str) -> list[dict]:
    results = index.query(
        top_k=POOL_K, vector=vector, namespace=namespace, include_metadata=True
    )
    return [dict(m.metadata or {}) for m in results.matches or []]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skip-rerank",
        action="store_true",
        help="embed comparison only (saves ~1 Cohere call per question)",
    )
    parser.add_argument(
        "--post-datadog",
        action="store_true",
        help="post hit@3 and MRR gauges to Datadog for the RC1-477 dashboard",
    )
    args = parser.parse_args()

    for required in ("OPENAI_API_KEY", "PINECONE_API_KEY"):
        if not os.environ.get(required):
            print(f"Error: {required} not set in .env")
            return 1
    cohere_key = _cohere_api_key()
    if not cohere_key:
        print("Error: COHERE_API_KEY not in the environment or ~/.zshrc")
        return 1

    # Imported after env is ready, like scripts/explore_rag.py: the module
    # builds (or, with an unchanged corpus, just re-attaches to) the
    # production index at import.
    global app
    import app

    if app._resume_index is None:
        print("Error: production index unavailable (app fell back to full text)")
        return 1

    import cohere as cohere_sdk

    co = Paced(cohere_sdk.ClientV2(api_key=cohere_key))

    from pinecone import Pinecone

    pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])

    chunk_dicts = [
        {**c, "metadata": {**c["metadata"], "source": "resume"}}
        for c in app._chunk_resume(app._resume_path.read_text())
    ] + [
        {**c, "metadata": {**c["metadata"], "source": "project"}}
        for c in app._chunk_projects(app._projects_path.read_text())
    ]
    namespace = f"kb-{app._corpus_hash()[:12]}"
    if namespace != app._resume_namespace:
        # Both arms must retrieve over the same corpus version, or the
        # comparison is meaningless.
        print(
            f"Error: local corpus {namespace} != production namespace "
            f"{app._resume_namespace} — sync with main first"
        )
        return 1

    cohere_index = build_cohere_index(pc, co, chunk_dicts, namespace)

    golden = json.loads(GOLDEN_PATH.read_text())["questions"]
    questions = [q["question"] for q in golden]
    expects = [q["expect"] for q in golden]
    print(f"{len(golden)} golden questions, pool k={POOL_K}, corpus {namespace}")

    # Query embeddings: one batched call per provider.
    openai_vectors = app._embed(questions)
    cohere_vectors = co.embed(questions, input_type="search_query")

    arms: dict[str, list[list[dict]]] = {"openai": [], "cohere": []}
    if not args.skip_rerank:
        arms["openai+rerank"] = []
    for i, question in enumerate(questions):
        openai_metas = query_metas(app._resume_index, openai_vectors[i], namespace)
        arms["openai"].append(openai_metas)
        arms["cohere"].append(query_metas(cohere_index, cohere_vectors[i], namespace))
        if not args.skip_rerank:
            order = co.rerank_order(question, [m.get("text", "") for m in openai_metas])
            arms["openai+rerank"].append([openai_metas[j] for j in order])
        print(f"  [{i + 1}/{len(questions)}] {question[:60]}")

    scores = {name: score_arm(metas, expects) for name, metas in arms.items()}

    print(f"\n{'arm':<16} {'hit@3':>7} {'MRR':>7}")
    for name, s in scores.items():
        print(f"{name:<16} {s['hit@3']:>7.3f} {s['mrr']:>7.3f}")

    if args.post_datadog and not post_datadog(scores):
        return 1

    print("\nPer-question rank of the first correct chunk (None = not in pool):")
    header = " ".join(f"{name:>14}" for name in scores)
    print(f"{'question':<52}{header}")
    for i, q in enumerate(golden):
        row = " ".join(f"{str(scores[name]['ranks'][i]):>14}" for name in scores)
        print(f"{q['question'][:50]:<52}{row}")

    return 0


if __name__ == "__main__":
    sys.exit(main())

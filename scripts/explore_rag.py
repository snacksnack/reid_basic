#!/usr/bin/env python3
"""
Interactive Pinecone index explorer.

Connects to the resume index (requires OPENAI_API_KEY and PINECONE_API_KEY
in .env) and lets you query it to inspect which chunks are retrieved and how
closely they match.

Usage:
    python scripts/explore_rag.py
    python scripts/explore_rag.py --list-chunks
    python scripts/explore_rag.py --query "AWS experience"
"""

import argparse
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from dotenv import load_dotenv
load_dotenv(BASE_DIR / ".env")

for required in ("OPENAI_API_KEY", "PINECONE_API_KEY"):
    if not os.environ.get(required):
        print(f"Error: {required} not set in .env")
        sys.exit(1)

# Import after env is loaded so the module initialises correctly. The module
# is imported whole (not from-imported) so the index handle is read live.
import app


def list_chunks():
    """Print all chunks with their metadata."""
    resume_text = app._resume_path.read_text()
    chunks = app._chunk_resume(resume_text)
    print(f"\n{len(chunks)} chunks in index:\n")
    for i, chunk in enumerate(chunks):
        meta = chunk["metadata"]
        section = meta.get("section", "?")
        employer = meta.get("employer", "")
        subsection = meta.get("subsection", "")
        label = section
        if employer:
            label += f" / {employer}"
        if subsection:
            label += f" / {subsection}"
        preview = chunk["text"].replace("\n", " ")[:80]
        print(f"  chunk_{i:02d}  [{label}]")
        print(f"           {preview}...")
        print()


def query_index(query: str, n_results: int = 4):
    """Query the live index and show retrieved chunks with scores."""
    if app._resume_index is None:
        print(
            "Index not available — check that OPENAI_API_KEY and "
            "PINECONE_API_KEY are set and the index built successfully."
        )
        sys.exit(1)

    n = min(n_results, len(app._resume_chunks_list))
    results = app._resume_index.query(
        top_k=n,
        vector=app._embed([query])[0],
        namespace=app._resume_namespace,
        include_metadata=True,
    )

    print(f"\nQuery: {query!r}")
    print(f"Top {n} results (cosine similarity — higher = more similar):\n")

    for i, match in enumerate(results.matches or []):
        meta = match.metadata or {}
        section = meta.get("section", "?")
        employer = meta.get("employer", "")
        subsection = meta.get("subsection", "")
        label = section
        if employer:
            label += f" / {employer}"
        if subsection:
            label += f" / {subsection}"
        print(f"  [{i+1}] score={match.score:.4f}  [{label}]")
        for line in meta.get("text", "").splitlines():
            print(f"      {line}")
        print()


def main():
    parser = argparse.ArgumentParser(description="Explore the resume RAG index.")
    parser.add_argument("--list-chunks", action="store_true", help="List all chunks and their metadata")
    parser.add_argument("--query", type=str, help="Query the index and show retrieved chunks")
    parser.add_argument("--n", type=int, default=4, help="Number of results to retrieve (default: 4)")
    args = parser.parse_args()

    if args.list_chunks:
        list_chunks()
    elif args.query:
        query_index(args.query, n_results=args.n)
    else:
        # Interactive mode
        list_chunks()
        print("-" * 60)
        print("Interactive query mode. Ctrl+C to exit.\n")
        while True:
            try:
                query = input("Query: ").strip()
                if query:
                    query_index(query, n_results=args.n)
            except (KeyboardInterrupt, EOFError):
                print()
                break


if __name__ == "__main__":
    main()

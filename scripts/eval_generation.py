#!/usr/bin/env python3
"""
RC1-475 generation-seat eval: Claude Haiku 4.5 vs Cohere Command.

Runs the golden questions (scripts/golden_questions.json) through both
models with byte-identical conditioning — the same `_chat_system_content`
system prompt over the same retrieved context — and reports latency,
tokens, and cost per answer. Arms run sequentially (all Claude, then all
Command) so the RC1-444 hallucination judge's verdicts can be attributed
per arm by time window; the script prints each arm's UTC window for the
verdict query.

Judged-quality caveat (disclose with any results): the hallucination judge
runs on Haiku — the same family as one arm — so judged quality is
directional. Latency/tokens/cost are the bias-free metrics.

Both arms post LLM spans to ml_app hihelloreid-chat (the Claude arm via
ddtrace auto-tracing, the Command arm via the app's own manual span in
`_cohere_chat_reply`), each annotated with the judge's prompt variables.
NOTE: a hallucinating Command answer can briefly fire verdict monitor
322028416; it recovers on its own.

Requires OPENAI_API_KEY / PINECONE_API_KEY / ANTHROPIC_API_KEY in .env;
COHERE_API_KEY and DD_API_KEY from the environment or ~/.zshrc. Command
calls are paced for the trial key's 10 req/min limit; a full run spends
~23 Cohere calls.

Usage:
    python scripts/eval_generation.py
    python scripts/eval_generation.py --out results.json
"""

import argparse
import json
import os
import re
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from dotenv import load_dotenv

load_dotenv(BASE_DIR / ".env")

GOLDEN_PATH = Path(__file__).resolve().parent / "golden_questions.json"

# $/Mtok. Haiku 4.5 per Anthropic's published price list (2026-09).
# Command A+ per-token rates are NOT on Cohere's public pricing page; the
# closest published Command price is Command A at $2.50/$10 — Command costs
# below are computed at that rate and labeled a proxy.
PRICES = {
    "haiku": (1.00, 5.00),
    "command (Command A proxy)": (2.50, 10.00),
}
COHERE_CALL_SPACING_S = 6.5
MAX_ANSWER_TOKENS = 500


def _key_from_env_or_zshrc(key: str) -> str | None:
    if os.environ.get(key):
        return os.environ[key]
    zshrc = Path.home() / ".zshrc"
    if zshrc.exists():
        match = re.search(
            rf'^\s*export\s+{key}=["\']?([^"\'\s]+)', zshrc.read_text(), re.M
        )
        if match:
            return match.group(1)
    return None


def cost_usd(prices: tuple, input_tokens: int, output_tokens: int) -> float:
    return (input_tokens * prices[0] + output_tokens * prices[1]) / 1e6


class RecordingCohere:
    """Wraps the app's cohere client: paces calls and keeps the last raw
    response so the eval can read usage without changing the app's path."""

    def __init__(self, client, spacing_s: float = COHERE_CALL_SPACING_S):
        self._client = client
        self._spacing = spacing_s
        self._last_call = 0.0
        self.last_response = None
        # API latency alone: the pacing sleep happens before the timer
        # starts, so the eval's latency column never includes rate limiting.
        self.last_latency_s = 0.0

    def chat(self, **kwargs):
        from cohere.errors import TooManyRequestsError

        elapsed = time.monotonic() - self._last_call
        if elapsed < self._spacing:
            time.sleep(self._spacing - elapsed)
        self._last_call = time.monotonic()
        t0 = time.monotonic()
        try:
            self.last_response = self._client.chat(**kwargs)
        except TooManyRequestsError:
            print("  429 from Cohere — waiting 65s for the minute window")
            time.sleep(65)
            self._last_call = time.monotonic()
            t0 = time.monotonic()
            self.last_response = self._client.chat(**kwargs)
        self.last_latency_s = time.monotonic() - t0
        return self.last_response


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", help="write per-question results to this JSON file")
    args = parser.parse_args()

    for required in ("OPENAI_API_KEY", "PINECONE_API_KEY", "ANTHROPIC_API_KEY"):
        if not os.environ.get(required):
            print(f"Error: {required} not set in .env")
            return 1
    cohere_key = _key_from_env_or_zshrc("COHERE_API_KEY")
    if not cohere_key:
        print("Error: COHERE_API_KEY not in the environment or ~/.zshrc")
        return 1
    os.environ["COHERE_API_KEY"] = cohere_key
    # DD keys make the spans post so the judge scores both arms; without
    # them the run still produces the objective metrics.
    dd_key = _key_from_env_or_zshrc("DD_API_KEY")
    if dd_key:
        os.environ["DD_API_KEY"] = dd_key
    else:
        print("warning: DD_API_KEY unavailable — no spans, no judge verdicts")

    global app
    import app

    if app._resume_index is None:
        print("Error: production index unavailable (app fell back to full text)")
        return 1
    if app.cohere_client is None:
        print("Error: app built no Cohere client despite COHERE_API_KEY")
        return 1
    app.cohere_client = RecordingCohere(app.cohere_client)

    golden = json.loads(GOLDEN_PATH.read_text())["questions"]
    questions = [q["question"] for q in golden]
    print(f"{len(questions)} golden questions; arms run sequentially")

    # Retrieval once per question: both arms answer over the same context.
    contexts = [app._retrieve_context(q, n_results=6) for q in questions]
    prompts = [app._chat_system_content(c) for c in contexts]
    groundings = [
        f"{app._project_catalog_text}\n\n---\n\n{c}"
        if app._project_catalog_text
        else c
        for c in contexts
    ]

    results: dict[str, list[dict]] = {"haiku": [], "command (Command A proxy)": []}
    windows: dict[str, tuple[str, str]] = {}

    # Arm 1: Claude Haiku (the incumbent), auto-traced by ddtrace.
    start = utcnow()
    for i, question in enumerate(questions):
        t0 = time.monotonic()
        with app.rag_prompt(question, groundings[i]):
            response = app.anthropic_client.messages.create(
                model=app.CHAT_MODEL,
                system=prompts[i],
                messages=[{"role": "user", "content": question}],
                max_tokens=MAX_ANSWER_TOKENS,
                extra_body={"temperature": 0.7},
            )
        latency = time.monotonic() - t0
        reply = " ".join(b.text for b in response.content if b.type == "text")
        results["haiku"].append(
            {
                "question": question,
                "answer": reply,
                "latency_s": latency,
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
            }
        )
        print(f"  haiku [{i + 1}/{len(questions)}] {latency:.2f}s")
    windows["haiku"] = (start, utcnow())

    # Arm 2: Command, through the app's own swap path (_cohere_chat_reply)
    # so the span shape matches what production would emit.
    start = utcnow()
    for i, question in enumerate(questions):
        with app.rag_prompt(question, groundings[i]):
            reply = app._cohere_chat_reply(
                prompts[i], [{"role": "user", "content": question}]
            )
        latency = app.cohere_client.last_latency_s
        usage = getattr(
            getattr(app.cohere_client.last_response, "usage", None),
            "billed_units",
            None,
        )
        results["command (Command A proxy)"].append(
            {
                "question": question,
                "answer": reply or "",
                "latency_s": latency,
                "input_tokens": int(getattr(usage, "input_tokens", 0) or 0),
                "output_tokens": int(getattr(usage, "output_tokens", 0) or 0),
            }
        )
        print(f"  command [{i + 1}/{len(questions)}] {latency:.2f}s")
    windows["command (Command A proxy)"] = (start, utcnow())

    try:
        from ddtrace.llmobs import LLMObs

        if LLMObs.enabled:
            LLMObs.flush()
    except ImportError:
        pass

    n = len(questions)
    print(f"\n{'arm':<28} {'p50 lat':>8} {'in tok':>8} {'out tok':>8} {'$/answer':>10}")
    for arm, rows in results.items():
        lat = statistics.median(r["latency_s"] for r in rows)
        tin = sum(r["input_tokens"] for r in rows) / n
        tout = sum(r["output_tokens"] for r in rows) / n
        dollars = sum(
            cost_usd(PRICES[arm], r["input_tokens"], r["output_tokens"]) for r in rows
        ) / n
        print(f"{arm:<28} {lat:>7.2f}s {tin:>8.0f} {tout:>8.0f} {dollars:>10.5f}")

    print("\nJudge windows (UTC) for the per-arm verdict query:")
    for arm, (w0, w1) in windows.items():
        print(f"  {arm}: {w0} .. {w1}")

    if args.out:
        Path(args.out).write_text(
            json.dumps({"results": results, "windows": windows}, indent=2)
        )
        print(f"\nwrote {args.out}")

    return 0


if __name__ == "__main__":
    sys.exit(main())

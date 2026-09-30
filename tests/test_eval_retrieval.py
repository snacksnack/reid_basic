"""Scoring math for scripts/eval_retrieval.py (RC1-473).

Only the pure functions: the arms themselves talk to live services and are
exercised by running the script. Importing the module is safe here — its
load_dotenv cannot override the keys conftest blanked.
"""

from scripts.eval_retrieval import datadog_series, first_match_rank, score_arm


class TestFirstMatchRank:
    def test_matches_when_every_expect_key_equals_metadata(self):
        metas = [
            {"source": "resume", "section": "skills"},
            {"source": "project", "project": "launch-planner"},
        ]
        assert first_match_rank(metas, {"source": "project", "project": "launch-planner"}) == 2

    def test_partial_metadata_match_is_not_a_match(self):
        metas = [{"source": "resume", "section": "skills"}]
        assert first_match_rank(metas, {"source": "resume", "section": "summary"}) is None

    def test_extra_metadata_keys_are_ignored(self):
        # Chunk metadata carries text/aspect/etc. beyond what expect names.
        metas = [{"source": "resume", "section": "skills", "text": "chunk body"}]
        assert first_match_rank(metas, {"section": "skills"}) == 1

    def test_returns_the_first_of_several_matches(self):
        metas = [
            {"section": "other"},
            {"section": "skills"},
            {"section": "skills"},
        ]
        assert first_match_rank(metas, {"section": "skills"}) == 2


class TestScoreArm:
    def test_hit_at_3_and_mrr(self):
        # Q1: correct at rank 1; Q2: correct at rank 4 (miss for hit@3,
        # 0.25 toward MRR); Q3: absent from the pool.
        per_question = [
            [{"s": "a"}, {"s": "b"}],
            [{"s": "x"}, {"s": "x"}, {"s": "x"}, {"s": "b"}],
            [{"s": "x"}],
        ]
        expects = [{"s": "a"}, {"s": "b"}, {"s": "c"}]
        scores = score_arm(per_question, expects)
        assert scores["hit@3"] == 1 / 3
        assert scores["mrr"] == (1 + 0.25 + 0) / 3
        assert scores["ranks"] == [1, 4, None]


class TestDatadogSeries:
    def test_arms_map_to_embed_model_and_rerank_tags(self):
        scores = {
            "openai": {"hit@3": 0.957, "mrr": 0.830},
            "cohere": {"hit@3": 0.913, "mrr": 0.815},
            "openai+rerank": {"hit@3": 0.913, "mrr": 0.829},
        }
        payload = datadog_series(scores, timestamp=1_700_000_000)
        assert len(payload["series"]) == 6
        by_key = {
            (s["metric"], tuple(s["tags"])): s["points"][0]["value"]
            for s in payload["series"]
        }
        assert by_key[
            ("bakeoff.retrieval.hit_at_3", ("embed_model:openai", "rerank:off"))
        ] == 0.957
        assert by_key[
            ("bakeoff.retrieval.mrr", ("embed_model:openai", "rerank:on"))
        ] == 0.829
        assert by_key[
            ("bakeoff.retrieval.hit_at_3", ("embed_model:cohere", "rerank:off"))
        ] == 0.913

    def test_every_series_is_a_gauge_with_the_run_timestamp(self):
        # type is Datadog's int enum: 3 = gauge; 1 would record counts.
        payload = datadog_series({"openai": {"hit@3": 1.0, "mrr": 1.0}}, 1_700_000_000)
        assert payload["series"], "openai arm must produce series"
        for series in payload["series"]:
            assert series["type"] == 3
            assert series["points"] == [{"timestamp": 1_700_000_000, "value": 1.0}]

    def test_skip_rerank_run_posts_only_present_arms(self):
        scores = {"openai": {"hit@3": 0.9, "mrr": 0.8}, "cohere": {"hit@3": 0.9, "mrr": 0.8}}
        payload = datadog_series(scores, 1)
        tags = {tuple(s["tags"]) for s in payload["series"]}
        assert ("embed_model:openai", "rerank:on") not in tags

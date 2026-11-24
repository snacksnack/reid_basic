"""RC1-687: Job Scout -> applications table transform. Fixtures are fictional."""

from scripts.sync_applications import build_rows, metros_from_location, src_tag_for


class TestMetrosFromLocation:
    def test_city_state_with_mode_suffix(self):
        assert metros_from_location("New York, NY (Hybrid)") == ["new york"]

    def test_remote_only_yields_nothing(self):
        assert metros_from_location("United States (Remote)") == []
        assert metros_from_location("Remote - Americas") == []
        assert metros_from_location(None) == []

    def test_multi_metro_separators_and_aliases(self):
        assert metros_from_location(
            "San Francisco, CA | New York City, NY | Seattle, WA"
        ) == ["san francisco", "new york", "seattle"]
        assert metros_from_location(
            "Livingston, NJ / New York, NY / Sunnyvale, CA"
        ) == ["livingston", "new york", "sunnyvale"]


class TestSrcTag:
    def test_lowercase_alnum_only(self):
        assert src_tag_for("monday.com") == "mondaycom"
        assert src_tag_for("Acme Robotics") == "acmerobotics"


class TestBuildRows:
    STATE = {
        "jobs": {
            "acme-tpm": {"status": "applied", "appliedDate": "2026-11-20",
                         "updatedAt": "2026-11-21T08:00:00"},
            "beta-fde": {"status": "rejected", "appliedDate": "2026-11-01"},
            # Older entries carry decidedAt instead of appliedDate.
            "gamma-manual-role": {"status": "applied", "decidedAt": "2026-11-18T09:00:00"},
            "https://ats.example.com/zeta/123": {"status": "applied"},
        }
    }
    ROLES = {
        "acme-tpm": {
            "id": "acme-tpm",
            "company": "Acme Robotics",
            "title": "Senior TPM",
            "location": "Austin, TX | Remote",
        },
    }

    def test_applied_role_on_the_board(self):
        rows = {r["role_id"]: r for r in build_rows(self.STATE, self.ROLES)}
        row = rows["acme-tpm"]
        assert row["company"] == "Acme Robotics"
        assert row["metros"] == "austin"
        assert row["src_tag"] == "acmerobotics"
        assert row["applied_on"] == "2026-11-20"

    def test_rejected_roles_are_skipped(self):
        rows = {r["role_id"] for r in build_rows(self.STATE, self.ROLES)}
        assert "beta-fde" not in rows

    def test_manual_application_derives_company_from_id(self):
        rows = {r["role_id"]: r for r in build_rows(self.STATE, self.ROLES)}
        assert rows["gamma-manual-role"]["company"] == "gamma"
        assert rows["gamma-manual-role"]["metros"] == ""
        assert rows["gamma-manual-role"]["applied_on"] == "2026-11-18"

    def test_url_shaped_ids_are_skipped(self):
        rows = {r["role_id"] for r in build_rows(self.STATE, self.ROLES)}
        assert not any(r.startswith("https://") for r in rows)

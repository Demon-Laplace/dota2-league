import contextlib
import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

import supabase_deployment as deployment


class DeploymentTargetTests(unittest.TestCase):
    def setUp(self):
        self.env = {
            "GITHUB_EVENT_NAME": "push",
            "GITHUB_REF_TYPE": "branch",
            "GITHUB_REF_NAME": "release/current",
            "DEPLOYMENT_TARGET": "production",
            "EXPECTED_PAGES_BRANCH": "release/current",
            "PRODUCTION_SUPABASE_PROJECT_ID": "productionproject",
            "SUPABASE_DEV_PROJECT_ID": "developmentproject",
            "SUPABASE_ACCESS_TOKEN": "test-access-token",
            "SUPABASE_DB_PASSWORD": "test-db-password",
        }

    def development(self):
        return {
            **self.env,
            "GITHUB_EVENT_NAME": "workflow_dispatch",
            "GITHUB_REF_NAME": "dev/feature",
            "REQUESTED_TARGET": "development",
            "DEPLOYMENT_TARGET": "development",
            "EXPECTED_PAGES_BRANCH": "",
        }

    def test_push_follows_pages_branch_instead_of_fixed_names(self):
        with patch.object(deployment, "get_pages_branch", return_value="release/current"):
            self.assertEqual(deployment.resolve_target(self.env), ("production", "release/current"))
            for branch in ["main", "design/modern-league-ui", "dev/feature"]:
                with self.subTest(branch=branch):
                    env = {**self.env, "GITHUB_REF_NAME": branch}
                    self.assertEqual(deployment.resolve_target(env), ("skip", "release/current"))

    def test_manual_production_cannot_bypass_branch_guard(self):
        env = {**self.env, "GITHUB_EVENT_NAME": "workflow_dispatch", "REQUESTED_TARGET": "production"}
        with patch.object(deployment, "get_pages_branch", return_value="other/branch"):
            with self.assertRaisesRegex(ValueError, "current Pages"):
                deployment.resolve_target(env)

    def test_manual_production_from_current_branch(self):
        env = {**self.env, "GITHUB_EVENT_NAME": "workflow_dispatch", "REQUESTED_TARGET": "production"}
        with patch.object(deployment, "get_pages_branch", return_value="release/current"):
            self.assertEqual(deployment.check_target(env, database=True), "productionproject")

    def test_development_is_explicit_and_independent_of_pages_api(self):
        with patch.object(deployment, "get_pages_branch", side_effect=AssertionError("Must not call Pages")):
            self.assertEqual(deployment.resolve_target(self.development()), ("development", ""))
            self.assertEqual(deployment.check_target(self.development(), database=True), "developmentproject")

    def test_development_can_test_the_production_branch_without_writing_production(self):
        env = {**self.development(), "GITHUB_REF_NAME": "release/current"}
        self.assertEqual(deployment.check_target(env), "developmentproject")

    def test_invalid_dispatch_does_not_default_to_production(self):
        for target in ["", "staging", "skip"]:
            with self.subTest(target=target), self.assertRaises(ValueError):
                deployment.resolve_target({**self.development(), "REQUESTED_TARGET": target})

    def test_tags_and_other_events_are_rejected(self):
        for changes in [{"GITHUB_REF_TYPE": "tag"}, {"GITHUB_REF_NAME": ""}, {"GITHUB_EVENT_NAME": "pull_request"}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                deployment.resolve_target({**self.env, **changes})

    def test_pages_change_while_queued_blocks_production(self):
        with patch.object(deployment, "get_pages_branch", side_effect=["release/current", "release/new"]):
            self.assertEqual(deployment.resolve_target(self.env)[0], "production")
            with self.assertRaisesRegex(ValueError, "target changed"):
                deployment.check_target(self.env)

    def test_recheck_requires_original_pages_branch(self):
        with patch.object(deployment, "get_pages_branch", return_value="release/current"):
            with self.assertRaisesRegex(ValueError, "Pages source branch changed"):
                deployment.check_target({**self.env, "EXPECTED_PAGES_BRANCH": "release/old"})

    def test_development_never_uses_production_project_or_missing_configuration(self):
        for changes in [
            {"SUPABASE_DEV_PROJECT_ID": "productionproject"},
            {"SUPABASE_DEV_PROJECT_ID": ""},
            {"PRODUCTION_SUPABASE_PROJECT_ID": ""},
            {"SUPABASE_ACCESS_TOKEN": ""},
            {"SUPABASE_DEV_PROJECT_ID": "developmentproject\nINJECTED=value"},
        ]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                deployment.check_target({**self.development(), **changes})

    def test_database_password_is_required_only_for_database_workflow(self):
        env = {**self.development(), "SUPABASE_DB_PASSWORD": ""}
        self.assertEqual(deployment.check_target(env), "developmentproject")
        with self.assertRaisesRegex(ValueError, "database password"):
            deployment.check_target(env, database=True)

    def test_production_credentials_do_not_fall_back_to_development(self):
        with patch.object(deployment, "get_pages_branch", return_value="release/current"):
            for key in ["PRODUCTION_SUPABASE_PROJECT_ID", "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD"]:
                with self.subTest(key=key), self.assertRaises(ValueError):
                    deployment.check_target({**self.env, key: ""}, database=True)

    def test_cli_exports_project_id_without_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "env"
            env = {**self.development(), "GITHUB_ENV": str(output)}
            with patch.dict(deployment.os.environ, env, clear=True), patch("sys.argv", ["guard", "check", "--database"]):
                with contextlib.redirect_stdout(io.StringIO()) as messages:
                    self.assertEqual(deployment.main(), 0)
            self.assertEqual(output.read_text(), "SUPABASE_PROJECT_ID=developmentproject\n")
            self.assertNotIn("test-access-token", messages.getvalue())
            self.assertNotIn("test-db-password", messages.getvalue())

    def test_resolve_outputs_skip_and_does_not_export_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "outputs"
            env = {**self.env, "GITHUB_REF_NAME": "main", "GITHUB_OUTPUT": str(output)}
            with patch.dict(deployment.os.environ, env, clear=True), patch("sys.argv", ["guard", "resolve"]):
                with patch.object(deployment, "get_pages_branch", return_value="release/current"), contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(deployment.main(), 0)
            self.assertEqual(output.read_text(), "target=skip\npages_branch=release/current\n")


class PagesConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.env = {"GITHUB_REPOSITORY": "owner/repo", "GH_TOKEN": "test-github-token"}

    def test_pages_branch_from_api(self):
        payload = {"build_type": "legacy", "source": {"branch": "release/current", "path": "/"}}
        with patch.object(deployment.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps(payload).encode())) as request:
            self.assertEqual(deployment.get_pages_branch(self.env), "release/current")
        self.assertEqual(request.call_args.args[0].full_url, "https://api.github.com/repos/owner/repo/pages")

    def test_missing_or_unsupported_pages_configuration_blocks_production(self):
        for payload in [None, {}, {"build_type": "workflow", "source": {"branch": "main"}}, {"build_type": "legacy", "source": {}}, {"build_type": "legacy", "source": {"branch": "main\ninjected=value"}}]:
            response = io.BytesIO(json.dumps(payload).encode())
            with self.subTest(payload=payload), patch.object(deployment.urllib.request, "urlopen", return_value=response):
                with self.assertRaises(ValueError):
                    deployment.get_pages_branch(self.env)

    def test_pages_api_failure_blocks_production_without_logging_token(self):
        with patch.object(deployment.urllib.request, "urlopen", side_effect=urllib.error.URLError("unavailable")):
            with self.assertRaisesRegex(ValueError, "deployment is blocked") as result:
                deployment.get_pages_branch(self.env)
        self.assertNotIn(self.env["GH_TOKEN"], str(result.exception))


if __name__ == "__main__":
    unittest.main()

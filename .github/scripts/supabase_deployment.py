"""Resolve and recheck Supabase deployment targets without changing remote state."""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path


def get_pages_branch(env):
    repository = env.get("GITHUB_REPOSITORY", "")
    token = env.get("GH_TOKEN", "")
    if not repository or not token:
        raise ValueError("GitHub repository and Pages read token are required.")
    api_url = env.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")
    request = urllib.request.Request(
        f"{api_url}/repos/{repository}/pages",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2026-03-10",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            pages = json.load(response)
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        raise ValueError("Cannot read GitHub Pages configuration; deployment is blocked.") from error
    if not isinstance(pages, dict):
        raise ValueError("Invalid GitHub Pages configuration; deployment is blocked.")
    source = pages.get("source") or {}
    branch = source.get("branch") if isinstance(source, dict) else None
    if pages.get("build_type") != "legacy" or not isinstance(branch, str) or not branch:
        raise ValueError("Production deployment requires GitHub Pages publishing from a branch.")
    if any(character in branch for character in "\r\n"):
        raise ValueError("Invalid GitHub Pages source branch.")
    return branch


def resolve_target(env):
    if env.get("GITHUB_REF_TYPE") != "branch" or not env.get("GITHUB_REF_NAME"):
        raise ValueError("Supabase deployment requires a branch ref.")
    event = env.get("GITHUB_EVENT_NAME")
    if event == "workflow_dispatch":
        requested = env.get("REQUESTED_TARGET", "")
        if requested == "development":
            return "development", ""
        if requested != "production":
            raise ValueError("Select production or development explicitly.")
    elif event != "push":
        raise ValueError("Unsupported Supabase deployment event.")

    pages_branch = get_pages_branch(env)
    if env["GITHUB_REF_NAME"] == pages_branch:
        return "production", pages_branch
    if event == "push":
        return "skip", pages_branch
    raise ValueError("Production deployment is only allowed from the current Pages source branch.")


def check_target(env, *, database=False):
    target, pages_branch = resolve_target(env)
    if target == "skip" or target != env.get("DEPLOYMENT_TARGET"):
        raise ValueError("Deployment target changed; rerun the workflow.")
    if target == "production" and pages_branch != env.get("EXPECTED_PAGES_BRANCH"):
        raise ValueError("Pages source branch changed; rerun the workflow.")

    production_project = env.get("PRODUCTION_SUPABASE_PROJECT_ID", "").strip()
    project = production_project if target == "production" else env.get("SUPABASE_DEV_PROJECT_ID", "").strip()
    if not production_project or not re.fullmatch(r"[a-z0-9]+", project):
        raise ValueError("Configure the production project ID and the selected environment's project ID.")
    if target == "development" and project == production_project:
        raise ValueError("Development deployment requires a separate Supabase project.")
    if not env.get("SUPABASE_ACCESS_TOKEN", "").strip():
        raise ValueError("Configure the selected environment's Supabase access token.")
    if database and not env.get("SUPABASE_DB_PASSWORD", "").strip():
        raise ValueError("Configure the selected environment's database password.")
    return project


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["resolve", "check"])
    parser.add_argument("--database", action="store_true")
    args = parser.parse_args()
    try:
        if args.action == "resolve":
            target, pages_branch = resolve_target(os.environ)
            with Path(os.environ["GITHUB_OUTPUT"]).open("a") as output:
                output.write(f"target={target}\npages_branch={pages_branch}\n")
            print(f"Supabase deployment target: {target}.")
        else:
            project = check_target(os.environ, database=args.database)
            with Path(os.environ["GITHUB_ENV"]).open("a") as output:
                output.write(f"SUPABASE_PROJECT_ID={project}\n")
            print("Supabase deployment target and credentials checked.")
    except (ValueError, KeyError, OSError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

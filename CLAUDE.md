# Global working preferences
Apply to every project unless the project's CLAUDE.md says otherwise.

# Branches
* Never edit, commit or push on `main` or `master`. I merge into `main` myself on GitHub.
* For each new task, create a fresh branch from the latest origin/main, named after the change (for example fix-date-compare). Keep working on that branch until its PR is merged.
* Don't delete branches.
* If you find yourself on `main` or `master`, stop and tell me.
* In Claude Code on the web, the session's own branch is the task branch.

# How to work
* Read the relevant files before answering or changing anything. Don't guess about code you haven't opened.
* Write a general solution, not one that only passes the tests. Don't hard-code values to make a test pass. If a test looks wrong, tell me instead of working around it.
* Keep changes to what the task needs: no refactoring unrelated code, extra features, comments on untouched code, or error handling for cases that can't happen. Small diffs are easier for me to review.
* When you say something works, name the command you ran and what it returned.

# When stuck or unsure
* If the same approach fails twice, stop. Tell me what you tried, what the errors said, and your best guess at the cause, then ask how to continue.
* When a choice would change what you build and the code doesn't answer it, use the AskUserQuestion tool with 2 to 4 options, your recommendation first.
* Ask before anything hard to undo: deleting files, force pushing, rewriting git history, changing shared settings, or skipping checks like --no-verify.

# Finishing a task
* When a coding task is done, commit, then end with AskUserQuestion offering the next steps that fit, your recommendation first. Usual options:
  * Push the task branch and open or update the PR into `main`, then give me the PR link
  * Review the diff with a subagent in a fresh context first (fix only issues that affect correctness or the requirements)
  * Keep the commit local for now
  * Stop here
* Push once per finished task, only after I pick it. Never push mid-task.
* Never merge a PR. Merging is my step.
* Leave out options that don't apply. Don't ask after plain questions or explanations.
* If AskUserQuestion isn't available, give the same options as a short numbered list so I can answer with a number.

# Context
* When I switch to an unrelated topic, suggest /clear.
* When compacting, keep the list of modified files and the test commands.

# This project
* *The Blood of Dawnwalker* skill tree planner: a dependency-free static site (`index.html`, `assets/`, game data in `data/`) with build tools in `tools/` (Python). See `README.md`.
* Run locally with `python3 -m http.server` from the repo root; no build step.
* Deploys to `https://mlmariss.github.io/DawnWalker/` through `.github/workflows/pages.yml` (Pages source: GitHub Actions) on every push to `main`. A merge into `main` is a deploy. The workflow stamps asset URLs with the commit SHA, and fails the deploy if `python3 tools/build_seo.py --check` or `python3 tools/stamp_assets.py --check` fails, so regenerate the perk reference and sitemap with `tools/build_seo.py` when `data/` changes.
* The community build list is served live by a Cloudflare Worker in `api/` (D1 database `dawnwalker-builds`), deployed by hand with `npx wrangler deploy` (see `api/README.md`), not by the Pages workflow. Its secrets are set with wrangler, never in `wrangler.toml`.
* No workflow commits to `main`: `pages.yml` only has `contents: read`.

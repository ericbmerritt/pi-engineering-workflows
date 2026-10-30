# Pi engineering workflows

Portable skills for specs, tests, CI repair, commits, and pull requests, with a thin Pi extension.

## Try it locally

From this directory, run `pi -e ./extensions/review.ts`, then:

```text
/review owner/repo 42
/review-respond owner/repo#42
/self-review --staged
/spec define an idempotent import workflow
/spec-review docs/specs/import-workflow.md
/test-plan docs/specs/import-workflow.md
/validate
/pr
/commit
/fix-ci owner/repo#42
```

Without arguments, `/review` asks for context; `/review-respond` verifies the current PR before triage.
`/self-review` defaults to current local changes, including untracked files.
`/spec` starts problem discovery or revises a supplied draft. `/spec-review`
challenges a draft and distinguishes same-session assessment from a cold read.
`/test-plan` proposes proof, `/validate` agrees checks and records results, and
`/pr` prepares publication; `/commit` drafts a Git/jj commit; `/fix-ci` diagnoses CI; `/skill:test-writing` guides test authoring.
None implicitly edits, runs repository code/hooks, commits, pushes, or creates a PR.
All commands queue behind an active agent run and use the session's model and
tools. Optional outside cold reads need an approved runner and disclosure permission.

To register the extension and skills persistently:

```bash
pi install /absolute/path/to/pi-engineering-workflows
```

This changes Pi's user settings; it does not copy the local package. Restart Pi
or use `/reload` after installation. The skills also have direct entry points:

```text
/skill:review owner/repo 42
/skill:review-respond owner/repo#42
/skill:self-review --staged
/skill:spec-workflow
/skill:adversarial-spec-review docs/specs/import-workflow.md
/skill:test-plan
/skill:validation-standards
/skill:pr-workflow
/skill:commit-workflow
/skill:fix-ci
/skill:test-writing
```

Check installed commands for collisions with commands from other extensions.
Pi may assign numeric command suffixes when multiple extensions use the same name.

## What is included

- `extensions/review.ts`: workflow commands and native review tools.
- `lib/`: skill loading, review validation, complete feedback, guarded responses, and receipts.
- `scripts/`: JSON-file `gh api` transports for batched reviews and thread responses.
- `review/SKILL.md`: canonical workflow and pass index.
- `review/references/`: shared checklists, human coverage, and delivery guidance.
- `self-review/SKILL.md`: local scope selection, approved fixes, and handoff.
- `review-respond/`: feedback triage, approved fixes/pushes, replies, and resolution.
- `spec-workflow/`: drafting workflow, shared spec standard, and narrative/plan templates.
- `adversarial-spec-review/`: spec challenge workflow and cold-read handoff template.
- `test-plan/`: contract-to-check planning and a coverage-map template.
- `validation-standards/`: execution guidance, shared evidence/safety standards, and report template.
- `pr-workflow/`: PR preparation, description guidance, and approved GitHub publication.
- [commit-workflow/](commit-workflow/SKILL.md): exact selection, messages, hooks, and approved Git/jj recording.
- [fix-ci/](fix-ci/SKILL.md): revision-matched logs, bounded repair, safe placement and approved push; Actions or supported external providers.
- [test-writing/](test-writing/SKILL.md): behavioral regressions, real seams, mock isolation, and cleanup.

The extension is deliberately thin. Review instructions stay in the skill,
not a second prompt embedded in TypeScript. Finding and verdict choices can use
Pi's selection UI. Orientation and comprehension remain free-text conversations.
Cancelled choices never count as approval. Headless runs do not invent responses.

For another Agent Skills host, copy the skill directories listed in `package.json`
together, retaining their sibling layout and resources. They share standards rather than
copying checklists. The `review/` skill can also be used alone.
Pi-specific interactions then fall back to conversation.

## Self-review

`/self-review` examines the author's own changes before independent review.
It does not require GitHub access or an existing PR.

- Default Git scope includes staged, unstaged, and nonignored untracked files.
- `--staged` reviews index content, not unstaged working-tree fixes.
- Explicit Git ranges review their snapshots, not the current checkout.
- jj working-copy and `--from`/`--to` scopes are supported by the workflow;
  jj has no staging area.

The skill shares the review pass index and adds local scope handling,
documentation/claim checks, and a fix/defer/skip flow. Review is read-only by
default. Fixes, repository script execution, staging, commits, and external
writes require appropriate explicit permission. Self-review is not independent
approval and does not automatically publish feedback.

## Responding to reviews

[Review response workflow](review-respond/SKILL.md) uses `github_review_feedback` for complete bounded retrieval and `github_respond_to_review` for batch-approved replies/resolution. The tool rechecks revisions/conversations, verifies each effect, and stops with per-effect receipts on failure; it never retries blindly. See [response delivery](review-respond/references/github-responses.md) for recovery and race limits. Live-host smoke tests remain unperformed.

## Specs and adversarial review

`/spec` collaborates on the problem, domain model, requirements, failure modes,
acceptance criteria, and consequential decisions. It can propose an end-to-end
phased plan without requiring a tracker or proprietary generator. Facts,
assumptions, examples, and open questions remain distinct. File writes need approval.

`/spec-review` uses the same spec standard and the bundled spec lens. It quotes
claims, verifies objections, and reports confirmed problems separately from
questions requiring domain judgment. Revisions need permission; a model's opinion
is not human acceptance.

An independent cold read is optional and **not bundled as an automatic runner**.
Use an existing approved Pi plugin, another model, or a human handoff. The skill
requires permission for the actual material and destination. No provider, model,
gateway, credentials, or network location is hardcoded. When independence is
required but unavailable, the report says so rather than inventing a second reader.

## Test planning, validation, and PRs

`/test-plan` maps requirements and risks to observations that would catch a defect.
It chooses the cheapest level that exercises the mechanism, names boundary/smoke
proof, and exposes spec disagreements. Planning does not run tests.

`/validate` discovers the project's actual checks, proposes a scoped run, and runs
only approved commands. Its shared evidence standard distinguishes proposed,
passed, failed, blocked, omitted, and inapplicable checks on a recorded snapshot.
Safe execution covers containment, bounded processes, and persistent-data cleanup.

`/pr` checks the intended diff and verification, drafts a description, and previews
the exact source, destination, and metadata. Publication uses configured `gh` only
after explicit approval. Push and creation are separate effects; uncertain writes
are reconciled read-only rather than retried. This is guided CLI use, not a new
runtime-enforced PR adapter. No live PR creation has been tested during packaging.

## Requirements and limits

- Pi 1.2.0 or later 1.x release (`^1.2.0`). Development and SDK-based extension
  loading/command dispatch checks use the pinned 1.2.0 SDK.
- Node.js 22.19 or newer for development and the documented test command.
- File-reading tools for repository context; Git for optional history research.
- Authenticated `gh` CLI or another approved integration for optional PR retrieval.
  The configured host is used; no organization-specific host or credentials ship.
- Review/response posting uses guarded tools, authenticated `gh`, and Bash/JSON-file transport.
  GitHub.com and compatible Enterprise schemas use configured hosts; `hostname`
  overrides `GH_HOST`, which otherwise defaults to `github.com`.
  The CLI needs `gh api --hostname`, `--input`, GraphQL, `--paginate`, and `--slurp`.
- No bundled subagent runner. Available host plugins may provide parallel research;
  otherwise the workflow runs sequentially.

Extensions execute with the user's system permissions. Read-only review and
publication approval are workflow instructions, not a security sandbox. Do not
load untrusted extensions or run untrusted repository code without review.

Project rules supply commit policy, coverage targets, supported versions, and
merge requirements. Findings require evidence; style preferences and historical
churn are not automatically critical defects.

## Posting reviews

Ask `/review owner/repo 42` to prepare and post the final review. Nothing posts
until you inspect the exact batch and separately confirm publication in Pi.
The adapter checks the reviewed SHA, PR base, open state, and inline anchors;
it sends the verdict and findings in one review. Body-only verdicts work too.

Changed revisions invalidate approval. Cancellation and headless mode do not
publish. Exact-batch markers help detect duplicates; ambiguous write failures
are never automatically retried. This is not a server-side idempotency guarantee.

See [GitHub delivery](review/references/github.md) for authentication, limits,
retry semantics, and Enterprise configuration. Live posting still needs a smoke
test against a disposable PR on each intended host; automated tests use a fake CLI.

## Development

```bash
npm install --ignore-scripts
npm run check
npm pack --dry-run
```

Tests cover dispatch, SDK discovery, links, review transport, feedback pagination, and response safety without model calls or network access.
Commit/CI repair workflows are instructions, not runtime-enforced adapters; live commits, pushes, and repairs are not tested. The package does not change installed skills or global settings
during development.

## Before public release

- Confirm you have the right to share the source material and adaptations.
- Choose a license and add its file and manifest metadata.
- Remove `private: true` only after those decisions. This draft intentionally
  blocks accidental npm publication; local Pi loading still works.
- Run the checks and inspect the package file list before publishing.

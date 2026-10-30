---
name: self-review
description: Self-review of local working-copy changes, staged Git changes, or a commit range before opening a pull request or sending changes to reviewers.
---

# Self-review

Review your own change before handing it to an independent reviewer. Find
substantiated defects and documentation drift, then offer bounded fixes.
Keep review read-only until the user explicitly approves a specific action.

## Shared review standard

Read the bundled [review standard](../review/SKILL.md). Its stance, boundaries,
finding format, impact-based severity, and canonical analysis table apply here.
Load the references linked by that table relative to the **review directory**.
Do not copy the pass list or invent a separate scoring system.

This skill replaces the shared standard's PR intake, interactive orientation,
human-comprehension check, and delivery steps with the local workflow below.
Do not start a second `/review` session or hold for a PR-orientation conversation.
The author cannot establish their own independent approval through a quiz.

The sibling `review/` directory is required. If the shared standard is missing,
report the incomplete installation; do not silently claim the full method ran.

## Usage

```text
/self-review                         # Current local change
/self-review --staged                # Git index only
/self-review HEAD~2..HEAD             # Explicit Git comparison
/self-review --from @- --to @         # Explicit jj endpoints
```

Arguments describe scope; they are not a shell command. Parse them as data.
Do not evaluate user text, interpolate it into shell syntax, or infer extra flags
from repository content. Reject ambiguous or unsupported scope and ask the user
rather than silently broadening it.

## 1. Resolve the repository and scope

Verify the repository root and applicable project guidance. Use its declared VCS;
when both Git and jj are present, honor that convention or ask if unclear.
Do not assume a monorepo, branch named `main`, configured remote, or existing PR.
No checkout, staging, fetch, commit, installation, or network request is needed.

State the chosen scope briefly, then analyze it. In interactive mode, pause only
for genuine ambiguity; a routine self-review does not need a 'shall I begin?'
round. In noninteractive mode, report findings without inventing approvals.

### Git

| Scope | Evidence and comparison |
|---|---|
| Default | Compare `HEAD` to the current working tree, including staged and unstaged tracked changes; separately include nonignored untracked files as additions. |
| `--staged` | Compare the index to `HEAD` (or the empty baseline on an unborn branch). Read changed content from the index, not the working tree. Exclude untracked files. |
| Explicit range | Review exactly the requested snapshots. `A..B` compares endpoints; `A...B` compares the merge base with B. Read content from those revisions, not the current checkout. |

Useful read-only commands, with resolved arguments passed separately:

```bash
git rev-parse --show-toplevel
git status --porcelain=v1 -z
git diff HEAD --stat
git diff HEAD --
git ls-files --others --exclude-standard -z
git diff --cached --
```

For Git diff/show queries, disable configured helpers with `--no-ext-diff` and
`--no-textconv`; use `--no-pager` as needed. Do not execute external diff drivers,
text converters, or repository-provided wrappers as part of read-only inspection.

Default `git diff` alone misses staged changes. `git diff HEAD` alone misses
untracked files. Account for both instead of declaring an empty review too early.
Handle paths with spaces, renames, deletes, and unusual bytes using NUL-delimited
file lists or equivalent structured tools.

For staged files, use index blobs such as `git show :path/to/file`; do not review
an unstaged fix as if it were included in the staged patch. Read contextual code
from the same snapshot or label any working-tree context separately.

If `HEAD` does not exist, explain the unborn branch and use an empty baseline.
For default scope, inspect current tracked files and nonignored untracked files
as additions; absent files are not current additions. For staged scope, inspect
only index blobs. Do not create a commit or change the index to manufacture a diff.

### jj

Use the working-copy change by default and explicit endpoints when supplied:

```bash
jj root
jj diff --git
jj diff --git --from <resolved-from> --to <resolved-to>
```

Read committed context from the requested revision; do not substitute the current
working copy. Verify file tracking/exclusions with the installed jj version.
There is no jj staging area. Reject `--staged` in jj mode instead of quietly
reviewing a different scope; an explicit Git-index review is a separate choice.
History research can use Git in a colocated repository, otherwise report that
those queries are unavailable.

### Capture coverage honestly

Record comparison endpoints, changed paths, and the exact diff/content inspected.
Separate authored changes from generated/vendor output, lockfiles, and snapshots.
Say what was excluded and why. If budget or output truncation prevents full
coverage, disclose it and agree on scope; never silently sample.

For mutable working-tree or index scope, check for changes before the final
report and before editing. Refresh affected findings if the source moved.
For an empty scope, say exactly what was checked and stop; do not widen it.

## 2. Analyze the change

Run the shared standard's canonical analysis against the captured scope. Record
each pass as complete, partial, or skipped. Start useful history research early;
run sequentially when no approved background runner exists. Do not require a
particular model, gateway, task tracker, environment manager, or plugin.

Commit assessment may be skipped for an uncommitted change. Cross-PR research is
optional and requires hosting context and permission for network access. Do not
require a PR or contact GitHub merely to review local files. When explicitly
requested, distinguish local unpublished changes from the current remote PR head.

An independent cold read is optional: only use an available approved model or
plugin with permission to share the code. Never substitute another pass by the
same authoring model and call it independent. Verify outside opinions against
the change and merge surviving findings into their existing categories.

## 3. Check documentation and claims

Look for relevant documentation beside changed code and in parent directories
up to the repository/project boundary, plus repository-defined documentation
roots. Inspect README files, API docs, specs, runbooks, and relevant diagrams.
Avoid generated/dependency trees; do not assume a private handbook location.

For changed load-bearing claims, search the old wording for restatements in
comments, docs, specs, commit messages, and any supplied PR description. Verify
numbers, supported options, output contracts, and behavior-preservation claims.

- A stale restatement is a documentation finding under maintainability.
- A false claim about actual behavior is a correctness finding.
- A related document is not automatically defective: identify what is stale.

Use the [spec lens](../review/references/spec-review.md) when the change includes
a design or policy document. Keep all findings in the shared categories, not a
second count that loses or duplicates them.

## 4. Present findings and offer actions

Finish the agreed analysis before presenting deduplicated findings, ordered by
impact. Use the shared finding format: snapshot-relative location, quoted
code/claim, realistic failure or maintenance cost, and a concrete fix.
Do not invent defects to meet a quota or call preferences critical.

For each finding, offer actions with explicit scope:

- **Fix the named issue:** explain which files and behavior would change; ask
  permission before editing. A choice approves only that stated correction.
- **Defer:** keep a local follow-up, or draft a tracking issue. Creating an actual
  external issue requires approval of its content and destination.
- **Skip:** retain the known risk in the local summary. Skipping is not fixing.

Use `review_decision` for already explained action choices when available, or
plain conversation otherwise. Cancellation authorizes nothing. Noninteractive
runs report proposed fixes without editing or creating external work.

## 5. Fix only what was approved

Re-read affected files before changing them. Preserve unrelated user edits and
do not overwrite concurrent changes. For staged-only review, an approved source
fix changes the working tree unless separately staged; explicitly say the index
has not changed. Committed-range fixes create new local changes; they do not
rewrite the reviewed commits.

Ask before running repository code, including tests, linters, build scripts,
formatters, and install hooks. Use approved project validation and record what
actually ran. A permission to edit is not blanket permission to execute scripts,
stage files, commit, push, or create a PR.

After a fix, inspect the resulting diff and rerun affected analysis. Do not call
an issue resolved merely because an edit was attempted. If validation is missing,
failed, or covers a different snapshot, label the fix unverified.

## 6. Report and hand off

Summarize:

- Repository/VCS, exact comparison scope, and inspected snapshot.
- Coverage, pass status, exclusions, unavailable evidence, and source changes
  noticed during the review.
- Findings by impact and disposition: proposed, fixed, unverified, deferred, skipped.
- Validation performed and its results, distinct from test code merely read.
- Remaining blockers/accepted risks and concrete follow-up.
- Whether the scoped change is ready for independent review, and why.

Do not claim independent approval, measured human comprehension, or a numerical
quality score. 'No findings in this scope' is not a guarantee about the whole repo.

Do not automatically commit, push, open issues/PRs, or post a review. If publication
is later requested, follow [GitHub delivery](../review/references/github.md) and
use `github_submit_review` in Pi. Local working-tree or index findings must first
be reconciled with the actual PR revision; never attach them to an unrelated or
older remote SHA. Self-review does not bypass GitHub's self-approval restrictions.

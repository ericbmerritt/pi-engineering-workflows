# GitHub retrieval and delivery

Use the authenticated GitHub CLI, never embedded tokens. GitHub.com and GitHub
Enterprise use the same workflow with an explicit hostname. Repository hosting
policy still takes precedence. Supplied diffs work without hosting access.

## Read-only retrieval

Examples for a user-configured GitHub CLI:

```bash
gh pr view <pr> --repo <owner/repo> \
  --json number,title,body,author,baseRefName,baseRefOid,headRefOid,url,commits,files,statusCheckRollup

gh pr diff <pr> --repo <owner/repo>

gh pr list --repo <owner/repo> --state open --base <target-branch> \
  --search 'draft:false' --json number,title,headRefName,headRefOid --limit 100
```

Set `GH_HOST` for Enterprise, or use `[HOST/]OWNER/REPO` where the CLI supports it.
Verify fields/options against the installed CLI. Report missing permissions,
rate limits, unsupported fields, and oversized diffs as limitations.

Ordinary discussion comments are not the complete set of inline review threads.
Fetch prior reviews and inline comments through a supported read-only integration.
Construct source links from the actual PR host/repository and saved head SHA.

## Posting with Pi

When the user asks to publish, call `github_submit_review` with the final batch:

```json
{
  "hostname": "github.com",
  "repository": "example/project",
  "pullRequest": 42,
  "reviewedCommit": "<full reviewed head SHA>",
  "verdict": "request-changes",
  "body": "See inline comments.",
  "comments": [
    {
      "path": "src/auth.ts",
      "line": 42,
      "side": "RIGHT",
      "body": "<approved finding text>"
    }
  ]
}
```

`hostname` defaults to `GH_HOST`, then `github.com`. Never infer a different
host from PR text. The repository is always the PR's **base/destination** repo,
including for fork PRs. The CLI needs credentials with permission to submit reviews.
SSH Git access alone does not imply authenticated API access.

Verdicts are `approve`, `request-changes`, or `comment`. An empty comments array
posts a body-only verdict. Every finding belongs in an inline thread, not the
review body. The tool supports single-line anchors; split a range finding into
one appropriately anchored comment, not multiple notifications.

The tool:

1. Checks the destination repo, open state, full head SHA, and current base.
2. Checks for an identical previously submitted batch.
3. Validates each path/line/side against the PR's unified diff.
4. Opens a scrollable editor showing the **exact** destination and API payload.
   Save unchanged to continue; Escape cancels. If an edit is needed, cancel or
   change the proposal and invoke the tool again.
5. Asks for separate confirmation to publish the inspected batch.
6. Rechecks for a duplicate and changed head/base after the human decision.
7. Calls the bundled transport wrapper once, submitting the pinned verdict and
   all inline comments together through `gh api` with a typed JSON body.

No unattended posting: absent UI, cancellation, invalid anchors, and changed
revisions fail closed. A triage choice is not publication permission. Never
bypass this tool with an improvised API command or drip standalone comments.

Use the most relevant changed line. If the fix belongs elsewhere, explain that
scope. An arbitrary contextual anchor begins with 'Contextual anchor:'. Removed
lines use `LEFT` and the old line number; additions use `RIGHT` and the new line.

## Authentication and compatibility

Authenticate `gh` for the intended host before posting. Read-only credentials,
branch/repository policies, self-approval restrictions, disabled APIs, unsupported
Enterprise versions, and rate limits can reject a review. The wrapper uses
`--input` so line numbers stay numbers and comments stay an array. No additional
API client, personal paths, or token handling is bundled.

The adapter requires `gh api --hostname`, `--paginate`, and `--slurp`, plus Bash.
It refuses validation responses above 20 MiB. Review/comment bodies are limited
to 4000 characters each and batches to 100 inline comments. These are package
limits, not claims about GitHub's server limits.

## Outcomes and retries

A deterministic marker identifies the exact destination, revision, verdict, and
comment batch. Existing submitted matches are returned rather than reposted.
This is best-effort duplicate detection, not a server-side idempotency guarantee
across concurrent clients or eventually consistent reads.

The tool never retries a POST automatically. A CLI error or cancellation after
the write begins can mean GitHub already accepted the review. It attempts a
read-only reconciliation when possible; otherwise inspect the PR before retrying.
A malformed success receipt is also not proof that nothing posted.

`ReviewError` carries a code and an outcome: `not-submitted`, `unknown`, or
`accepted-unverified`. Do not turn unknown outcomes into a blind retry.

Head/base checks narrow the race window; GitHub does not provide a transactional
'only if still current' review operation. The submitted `commit_id` always pins
the review to the inspected head, even if another push happens during submission.

The human review record needs separate approval. It is not a finding and does
not belong in the inline batch. Post an approved record through the GitHub UI or
an existing supported discussion-comment integration; this adapter only posts reviews.

## Outside Pi

Copying the skill without its extension preserves analysis, not the guarded
posting tool. Keep findings local or hand them to an approved integration. The
bundled Bash file is a transport layer, not a standalone approval/validation UI.

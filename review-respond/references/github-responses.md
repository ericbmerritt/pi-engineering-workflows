# GitHub feedback and guarded responses

Use authenticated `gh`, with explicit host and base/destination repository even
for fork PRs. Hostname defaults to configured `GH_HOST`, then `github.com`. SSH Git
access is not API authentication; do not embed tokens or alter credentials.
Project hosting, disclosure, resolution ownership, and approval rules still apply.

## Read complete feedback in Pi

Call `github_review_feedback` with a verified target:

```json
{
  "hostname": "github.example",
  "repository": "example/project",
  "pullRequest": 42
}
```

The result includes:

- `target`: normalized host/repository/PR.
- `context.viewer.login`: authenticated actor.
- `context.pr`: node ID, open/closed state, full `headRefOid` / `baseRefOid`, refs,
  destination repository, and URL.
- `threads`: node IDs, path/current and original line, outdated/resolved state,
  reply/resolve permissions, all comments (including current/original commit OIDs),
  and a conversation `version` digest.
- `reviews` and `discussion`: review summaries and ordinary PR conversation.
- `complete: true`: returned only after all selected connections were fully read.

Outer lists and every nested thread-comment connection paginate independently.
A failed query, GraphQL error (including partial data), null/malformed node,
changing identity/totals, repeated cursor, or exhausted budget is not an empty
result. The tool fails instead of silently sampling. An outdated thread is not
necessarily resolved or fixed. Pending comments are visible evidence, not eligible
published reply receipts.

Resource budgets live in [feedbackLimits](../../lib/github-feedback.ts); request,
aggregate bytes, connection pages, and returned text are bounded. For oversized
PRs, use an approved scoped integration or manual handoff and disclose partial
coverage. Never bypass refusal and claim the bundled tool retrieved everything.

## Prepare one response batch

After triage, approved fixes, required validation and confirmed push (when needed),
call `github_respond_to_review`. Copy head/base and versions from current feedback;
do not invent or recompute them from an incomplete conversation.

```json
{
  "hostname": "github.example",
  "repository": "example/project",
  "pullRequest": 42,
  "headCommit": "<full inspected head SHA>",
  "baseCommit": "<full inspected base SHA>",
  "responses": [
    {
      "threadId": "<threads[].id>",
      "threadVersion": "<threads[].version>",
      "reply": "Preserved the failure status; the published regression check passes.",
      "resolve": true
    }
  ]
}
```

The text is illustrative, not evidence: claim validation/publication only when
verified. Use `resolve: false` for a reply without closure. Each thread appears
once. Batch/body limits and exact fields are defined by
[ResponseSchema](../../lib/response-batch.ts).

For resolution without another reply, omit `reply`, supply `existingReplyId` from
that thread's published reply comments, and set `resolve: true`. The selected
reply's author/body are previewed. Root findings, pending comments, review IDs,
REST numeric IDs, and thread IDs are not interchangeable with reply node IDs.
Do not resolve merely because an arbitrary existing response is selectable:
every concern must actually be addressed under the workflow and repository policy.

## Approval and execution

The tool validates destination, open state, requested revisions, viewer,
conversation versions, existing replies and permissions. It shows the **exact**
conversation, actor, destinations, marked text, and mutations in a scrollable
editor. Save unchanged to continue, then separately confirm publication. Editing,
cancellation, refusal or absent UI cannot authorize a write. Prior round approval
does not bypass this tool's UI. There is no unattended publishing mode.

After approval it rechecks the whole selected set, then checks each thread again
at its mutation boundary. A reply goes through the bundled
[transport wrapper](../../scripts/respond-review-thread.sh), using fixed GraphQL
and typed JSON-file variables. An independent read verifies its exact body, ID,
published state and actor before any resolution. Resolution requires a fresh
conversation/revision check, then its own mutation and independent readback.
No arbitrary queries, supplied endpoints, shell evaluation, token handling,
comment editing/deletion, reopening, or review dismissal are provided.

The adapter cannot prove local test results, successful pushes beyond the pinned
head, semantic adequacy, or human intent. The skill/user supplies those judgments.
GitHub offers no conditional transaction tying this conversation version/head to
the mutation. Rechecks narrow races; they do not lock the PR or prevent a new
objection immediately after a check.

## Receipts, duplicates, and recovery

Results expose `status` (`completed`, `cancelled`, or `stopped`) and per-thread
`reply` / `resolution` receipts. Each effect is not-started, confirmed, or uncertain;
resolution can also be not-requested/already-resolved. `posted` and `resolved`
require independent readback. A valid mutation receipt without readback remains
`accepted-unverified`; an unverified write remains `unknown`. Read the actual
per-effect statuses rather than assuming the whole batch succeeded or did nothing.

Any drift, failed transport, malformed receipt, failed verification or cancellation
after publication starts stops the remaining batch. Even when read-only
reconciliation confirms an effect after a transport error, later actions do not
run. Earlier receipts remain visible; untouched actions remain not-started.
Replies/resolutions are separate mutations, not an atomic notification batch.

The tool appends a deterministic per-reply marker bound to actor, destination,
head/base, thread and exact text. A refreshed round can reuse an identical
submitted reply authored by the authenticated viewer. A copied marker, edited
body, other author or pending comment does not qualify. Multiple identical
receipts require manual inspection. Neither markers nor `clientMutationId` provide
server-side idempotency or protection across concurrent clients.

Never retry a mutation automatically. Refresh feedback after any partial or
unknown outcome. Inspect the real conversation; reuse a verified marked reply or
explicitly select a published existing reply for resolution-only recovery. Unknown
state remains unknown if it cannot be reconciled. Do not unresolve/delete as an
automatic compensation or bypass a failed wrapper with raw API writes.

## Compatibility and outside Pi

The existing `github_submit_review` and `submit-review-batch.sh` still create new
reviews; they are not substitutes for responses. Review-level/general discussion
has no resolvable inline thread. This adapter reads that context but does not post
general comments; use the project's supported conversation integration or handoff.

Outside Pi, copying skills preserves guidance but not guarded execution. Provide
thread-linked drafts and proposed resolutions for GitHub UI delivery, or use an
existing approved integration. Do not run the bundled Bash transport directly as
though it performed approval, membership, freshness, or receipt checks.

Queries/mutations follow the [official GitHub schema](https://docs.github.com/public/fpt/schema.docs.graphql)
and [CLI API contract](https://cli.github.com/manual/gh_api). Older Enterprise
schemas, disabled APIs, or insufficient permissions fail closed. Automated tests
use provider simulations and a fake CLI; no live reply/resolution smoke has been
performed. Separately authorize a disposable-PR smoke on each intended host before
claiming live-host compatibility.

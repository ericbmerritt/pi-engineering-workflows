# GitHub PR publication

Use an authenticated, user-configured `gh` CLI. Consult the installed CLI's help
and [official manual](https://cli.github.com/manual/gh_pr_create) before relying
on options. This workflow guides publication through existing tools; unlike the
review-posting adapter, it is not a bundled runtime-enforced approval mechanism.

## Host, authentication, and source identity

Confirm the destination as `[HOST/]OWNER/REPO` and use it explicitly in commands.
`GH_HOST` is another supported host configuration; do not hardcode a host or
change a user's global configuration. Verify that Git remotes and CLI operations
refer to the approved hosts and repositories.

SSH Git access is not proof of authenticated API access. Missing access is a
blocker to report, not permission to read token files, print credentials, install
a client, fork a repo, or change authentication. The user manages credentials.

Separate the base/destination repository from the head/source repository, and
record the full approved source commit. For an intra-repo PR, `--head` can be the
branch. For a fork, supported CLI versions accept `<user>:<branch>`; organization
owners have CLI limitations. Verify support rather than guessing an unsupported
head selector or silently using another repository.

## Read-only preflight

Inspect existing PRs using explicit repository and branch identity. For example,
with variables already resolved from the approved proposal:

```bash
gh pr list --repo "$DESTINATION" --head "$HEAD_BRANCH" --state all \
  --json number,url,state,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner \
  --limit 100
```

`--head` filtering does not support `<owner>:<branch>` syntax. Inspect the returned
head repository/owner and base as well as the branch name, especially for forks.
An empty truncated or failed query is not proof of absence; investigate incomplete
results. An open match should be reported, not duplicated. For a closed or merged
match, ask about the desired lifecycle rather than automatically reopening or
creating another PR for the same change.

Re-read the approved base/head identities and current metadata immediately before
publication. If the source, target, scope, or proposed content changed, stop and
refresh the preview and approval. Do not create a same-repository PR whose base
and head are the same branch. Follow protected/shared-branch policy; do not assume
that a fork's identically named branch is the same ref as its upstream base.

## Push is a separate write

If the exact head is already published, no push is needed. Otherwise show the
remote, immutable source commit, destination ref, and outgoing commits before
asking permission. Use an explicit, non-force refspec so concurrent local edits
do not silently become part of an approved push. Do not auto-stage, commit,
rebase, squash, force-push, set upstreams, or create remotes/forks to make it work.
A rejected push is a decision point, not a reason to weaken safety flags.

Check the resulting remote branch OID through a supported read-only lookup. It
must match the approved head before PR creation. A local remote-tracking ref is
not necessarily current evidence. Report a successful push even if a later step
fails; do not delete the branch as unapproved cleanup.

## Create only after exact approval

Preview the complete destination, source/base refs and revisions, title/body,
draft status, maintainer-edit policy, and any notifications/issue effects. Approval
covers only that proposal; stale approvals must be refreshed.

Prepare a UTF-8 body file only when its write is authorized, keep its text literal,
and quote shell arguments. Never use `eval` or interpolate document text into shell
source. The following is a command shape, not authorization or resolved values:

```bash
gh pr create --repo "$DESTINATION" --base "$BASE_BRANCH" \
  --head "$HEAD_SELECTOR" --title "$TITLE" --body-file "$APPROVED_BODY_FILE" --draft
```

Use `--draft` only for an approved draft; otherwise omit it. By default the CLI
allows maintainer edits; use `--no-maintainer-edit` when that is the approved policy.
Add reviewers, labels, assignments, milestones, or projects only if specifically
approved and supported. Never let a title/body autofill option replace inspected
text or let an interactive prompt choose a push/fork destination.

Explicit `--head` skips `gh pr create`'s implicit pushing/forking behavior. Do not
rely on `gh pr create --dry-run` as a read-only preview: official help warns that
it may still push Git changes. Preview in conversation instead.

## Verify and reconcile

After creation, use the returned URL and an explicit repository to read back the
PR. Compare the actual destination host/repo, base/head repos and branches, full
head OID, title/body, draft state, and maintainer-edit policy with the proposal.
Record the base revision and any drift. If a changed base invalidates the reviewed
diff or checks, say so; do not silently preserve a readiness claim.

```bash
gh pr view "$PR_URL" --repo "$DESTINATION" \
  --json number,url,state,baseRefName,baseRefOid,headRefName,headRefOid,headRepository,headRepositoryOwner,isDraft,title,body,maintainerCanModify
```

A URL printed by a command is not a fully verified receipt. If creation errors,
times out, is cancelled, or returns an unreadable receipt after it might have
written, do not retry automatically. Reconcile through read-only listing and
inspection of the exact source/destination identity. Report one of:

- Prepared only; no write started.
- Push completed; PR creation did not start or remains unverified.
- PR created and verified, with its URL and recorded head.
- Outcome unknown or accepted but not fully verified; state what must be inspected.

These checks are best-effort, not transactional idempotency. GitHub PRs track
branches rather than an immutable creation SHA, and concurrent pushes or base
changes can still race the reads. Never claim the workflow locks the revision.
Do not attempt another write simply to get a cleaner success receipt.

# Historical intelligence

Run early so findings can inform correctness. Background execution is optional;
sequential read-only Git queries work too. Use the verified repository and an
explicit revision relevant to the PR, not unrelated history from the current cwd.

Default research window: one month. Default budget: two minutes of research;
keep interactive discussion time outside that budget. Report a partial result
rather than blocking the review. Prioritize changed-file fixes, then repeated
hunk changes, then similar-project patterns.

## Recent fixes

For an existing changed file:

```bash
git log <revision> --since='1 month ago' --regexp-ignore-case \
  --grep='^fix' --format='%h %ad %s' --date=short -- '<changed-file>'
```

Adapt the search to the project's actual commit style; non-Conventional histories
need a broader search. Read relevant patches instead of categorizing solely by
the message. Multiple recent fixes are a research signal, not proof of instability.

## Repeated changes and reverts

```bash
git log <revision> --since='1 month ago' -p -- '<changed-file>'
```

Compare functions and surrounding context, not raw line numbers that shift.
Inspect repeated changes, modification/revert cycles, and whether the PR undoes
an intentional fix. Determine why before proposing a defect. Use rename-aware
history where moves would otherwise hide relevant commits.

## Similar-project patterns

Detect language/framework from the repository's actual manifests and build
configuration: package manifests, language project files, or toolchain files.
No particular environment manager or monorepo layout is required.

If sibling projects exist, inspect recent fixes in projects sharing relevant
frameworks or contracts. Only report patterns to which this PR is exposed.
Useful categories include null handling, boundaries, concurrency, type/schema
mismatch, configuration, and error propagation. Allow other categories when
those fit the evidence better.

## Handoff

Return:

- Verified repository, revision, research window, and analyzed files.
- Recent relevant fixes: hash, date, affected behavior, relevance to the change.
- Repeated/reverted areas and what the history actually establishes.
- Applicable bug patterns in related code.
- Limitations: shallow checkout, absent history, new files, or budget exhaustion.

Skip new files with no history. Never claim no historical risk when queries were
unavailable. History directs questions and scrutiny; current defects and severity
still require current evidence.

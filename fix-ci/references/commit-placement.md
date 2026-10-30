# Place fixes without misrouting work

Causality informs a proposal; it does not grant permission to rewrite a commit
or edit unrelated code. The repository's history policy decides amendment versus
follow-up commits. Use [commit workflow](../../commit-workflow/SKILL.md) for exact
content selection, message policy, approval, hooks, and result verification.

## Classify before mutating history

For each fix, record its paths/hunks, failure evidence, causal relationship,
proposed commit/change ID, and approval status. Inspect the entire relevant PR
range and predecessor relationship, not only a short log or the current head.

Evidence that the PR caused a failure includes:

- A failing path was changed by the PR, with a demonstrated connection to the error.
- A downstream consumer depends on a type, function, schema, or behavior changed
  by the PR, even if that consumer's file is not in the diff.
- The error identifies a symbol or mechanism introduced/modified by the PR.

Path membership alone is only a heuristic; an unchanged path can fail indirectly.
A verified baseline reproduction at the right comparison point may support an
unrelated classification. Missing logs, unmapped paths, other authors' commits,
or conflicting heuristics are **unknown**, not proof of ownership or absence.
Document the uncertainty and ask before choosing a rewrite target. Do not default
to amending arbitrary shared commits merely because attribution is unclear.

A fix to the PR's mechanism belongs with the responsible logical change where
folding is policy and approved. A genuinely unrelated authorized fix generally
needs its own coherent commit, or a separate change/PR according to project policy.
Do not disguise unrelated work inside the feature commit to get green CI.

## Plan exact routing

Preview the full target identity, original target tree/diff/message, source
snapshot, selected paths/hunks, excluded user work, affected descendants, and
expected remaining changes. Use stable jj change IDs or resolved Git commits;
verify they identify the intended revision immediately before each operation.

For jj, an approved absorb/squash may route changes to earlier commits. For Git,
use the project's supported amend/fixup/follow-up strategy; do not run an automatic
rebase as a shortcut. If multiple targets must be rewritten, inspect the actual
dependency graph and plan ancestor-first routing where appropriate. Overlapping
hunks or ambiguous attribution need explicit resolution before proceeding.

Use literal paths and supported selectors; quoting prevents shell expansion but
not VCS pathspec/revset/pattern interpretation. Verify exact selection semantics.
Never mix two targets' hunks simply because they share a filename. A full-source
squash is safe only if every remaining source change belongs to that target.

## Verify each operation against its own baseline

Before every rewrite, re-read source, target, worktree/index, and selected patch;
stop on unexpected changes. Afterward verify:

- The **incremental target change** matches only the approved patch. Compare with
  that target's captured pre-operation state, accounting for any parent rewrites.
  Its total file set may include files already there: do not falsely flag those
  as misrouted just because they were absent from the source working-copy diff.
- No source hunks were lost or routed twice, and the remainder is exactly expected.
- Rebased descendants, conflicts, bookmarks/branch pointers, and messages match
  the planned effects, with no unrelated changes or concatenated subjects.

Keep a per-operation receipt and refresh the baseline for the next operation.
Do not reuse a previous squash's file inventory. If an operation fails or produces
unexpected content, stop immediately with completed operations, actual revisions,
remaining work, and blockers. Do not continue describing, squashing, exporting, or
pushing, and do not undo/reset automatically; recovery needs its own approval.

Keep independent fixes distinct across iterations. In jj, starting a fresh change
after an unrelated fix is a separate authorized action; otherwise a later describe
could rename a commit that accumulated multiple unrelated fixes. Do not create
empty follow-up commits or rename unrelated existing work to complete the table.
After routing, verify the complete outgoing history and revalidate any content
whose proof was invalidated. A coherent message is not evidence the fix passed.

# Commit messages

Write from the selected diff and verified context. Explain what the final change
does and why it matters, not the history of producing it. Repository policy and
its canonical validator govern format, allowed types/scopes, limits, and trailers.
If policy is missing, propose the following convention; do not claim CI enforces it.

## Shape and scope

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) uses:

```text
<type>[optional scope][!]: <imperative summary>

<reason, important behavior or compatibility consequences>

<verified trailers, when applicable>
```

Use a concrete verb and object: `preserve failed item status`, not `address review
feedback` or `improve things`. Prefer one logical change per commit; this does not
impose one commit per PR. Do not hide a behavior change as a refactor.

| Common type | Meaning |
|---|---|
| feat | New capability |
| fix | Corrected broken behavior |
| refactor | Structure change without intended behavior change |
| test / docs | Tests-only / documentation-only change |
| perf | Performance change supported by evidence |
| build / ci | Build/dependency mechanics / CI configuration |
| style / chore | Formatting only / maintenance without a more specific type |

These are examples, not a universal allowed-type list. Revert and fixup formats
are project/tool-specific; inspect policy rather than rejecting or generating
one blindly. Do not autosquash or rewrite history merely because a message says
`fixup!`.

Choose a scope from the repository's real conventions and changed ownership.
Do not assume directory leaf names, mandatory scope, multi-scope support, or an
organization's project-discovery scheme. A cross-project commit should state
its true scope; offer a split or explain the coupling instead of inventing one.

Keep the subject concise; a 72-character subject and body wrap are useful defaults
only when no stricter/different project rule applies. They are not Conventional
Commits requirements. A trivial change usually needs no body. Otherwise separate
the subject, body paragraphs, and trailers with blank lines. Name relevant risks,
intentional exclusions, or compatibility changes when they help explain the diff.
Do not turn the body into a task checklist or claim completeness not established
by the change.

## Breaking changes and references

Use `!` and/or a `BREAKING CHANGE:` footer according to project release policy.
State the incompatible contract and migration, not just that a change is large.
Do not invent a break when behavior remains compatible.

Include spec/issue/phase references only when supplied or verified. Use the actual
repository-relative path and phase name if required. Do not infer an issue merely
from a suggestive branch name, fabricate a ticket placeholder, or include an
issue-closing keyword without approval of that effect. Long indivisible trailers
must follow the project's validator rules; ask rather than silently dropping a
mandatory reference to make a line-length check pass.

Retain legitimate required sign-offs and human attribution. Do not invent authors,
sign for someone else, add model attribution, or narrate prompts and agent work.
Do not put credentials, private records, or sensitive paths in a message.

## Bodies lifted into PRs

When tooling lifts a commit body into a PR description, read
[PR description guidance](../../pr-workflow/references/pr-description.md) first.
The body must satisfy both policies; there is no automatic permission to publish.

After squashing/folding, reread the body as one explanation of the final state.
Remove accidental concatenated subjects, stale intermediate claims, duplicate
trailers, and superseded verification results; preserve intentional quotations.

## Worked example

```text
fix(import): retain rejected item status in batch summary

Keep item-level failures visible when later items succeed. The batch
still processes accepted items, but no longer reports overall success
when one item was rejected.
```

Use this shape only when it accurately describes the selected change. Test names,
counts, performance numbers, and behavior-preservation claims require evidence;
adding tests is not proof they ran or that a boundary contract passed.

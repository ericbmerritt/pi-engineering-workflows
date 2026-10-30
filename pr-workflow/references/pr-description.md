# PR title and description

Describe the outcome first, then the mechanism and important limits. The diff
is the implementation inventory; the description explains why it should exist.

## Title

Follow the repository's title convention when defined. Otherwise use a short,
specific statement of the change. Do not invent a ticket prefix, require a
Conventional Commit title universally, or restate the title as the first paragraph.

## Body

Prefer a few short paragraphs, unless a repository template requires another shape:

- Prior behavior or problem, followed by the change and how it addresses it.
- Meaningful compatibility, data, rollout, security, and rollback implications.
- A brief factual statement of what was exercised and where, with important gaps.
- A reviewer decision or focus area only when there is one.

For a bug fix, explain the symptom, evidenced cause, fix, and regression protection.
Keep uncertainty visible. 'Behavior preserving', performance claims, counts, and
support promises must agree with the actual change and evidence.

Use headings or a fenced Mermaid diagram only when they clarify the change. Avoid
a file-by-file changelog, a diary of implementation steps, marketing language,
and promotional assistant attribution. Follow any actual provenance/disclosure
requirements rather than inventing or suppressing them.

## Evidence and links

Use the shared [evidence standard](../../validation-standards/references/evidence.md).
Name actual observations, not a checklist of tests that might be run later. When
verification was blocked, say what blocked it and what evidence exists instead.
Never turn a planned check or accepted gap into a passing result.

Link the governing spec, issue, and environment only when they actually exist and
are appropriate to share with the destination's audience. Do not invent a ticket,
placeholder issue, preview URL based on an expected PR number, or screenshots.
Keep private information out of public bodies. Issue-closing keywords can close
issues on merge; use them only when that effect is intended and approved.

Respect the repository's PR template and fill checkboxes honestly. Do not impose
personal heading bans or discard project-required content. If the template and
project instructions conflict, surface the conflict rather than silently choosing.

## Existing bodies

Read the current body immediately before proposing an edit. Preserve human and
CI additions, images, environment links, generated blocks, and template checklists.
Rewrite only the agreed prose. If the body changed during approval, reconcile it
and preview again rather than overwriting with a stale full-body replacement.

## Example draft

```markdown
Report partial batch imports as failures rather than successful completion.
Previously, a rejected item was logged but the caller received an overall success.

The importer now retains per-item outcomes and returns a nonzero process status
when any item fails. Successful items remain committed; retrying still requires
stable item identifiers to avoid duplicates.

Verified the rejection path against the isolated provider simulator: the failed
item is named, the overall status is nonzero, and the process terminates. Live
provider behavior remains unverified; the sandbox account is not available.
```

The example is illustrative, not evidence about the user's change. Replace its
claims with observed results; do not paste it as a ready-made verification story.

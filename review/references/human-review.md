# Facilitating human review

The independent reviewer must understand the change well enough to own approval.
This check is conversational, not a test of whether their answer was AI-assisted.
Run it regardless of today's likely verdict; they may approve a revision later.

## Prepare

Identify what the reviewer needs to hold:

- Intent and the distinction between stated intent and actual change.
- Major design decisions and rejected alternatives.
- New state, external dependencies, failure modes, and cutover/rollback behavior.
- Existing capabilities the change extends, duplicates, or bypasses.
- What tests, CI, and manual evidence actually establish.

## Ask and hold

Ask three to five free-text reasoning questions about the highest-risk or easiest
to-miss areas. Do not ask yes/no questions or offer a menu. Do not waste a question
on a fact already explained in the PR description.

End the turn. Evaluate each answer for demonstrated reasoning; if it has a gap,
ask one targeted follow-up naming a file, function, state, or branch. Do not supply
the answer first. Generic restatements do not establish understanding.

If an answer reveals a code defect, return it to finding triage. Do not publish
someone's misunderstanding as a defect in the author's code.

## Coverage declaration

Ask what the reviewer inspected directly and what they trusted to automation.
Compare that declaration to the risk areas. Name material coverage gaps without
claiming that every automated check requires manual duplication.

Do not infer a percentage from conversation or gate on an invented threshold.
A reviewer may supply a self-estimate, but distinguish it from measured coverage.
Comprehension now is not approval of a future revision.

## Record

Show this record locally and take corrections. Publishing it needs separate,
explicit approval because it describes a named person's review.

```markdown
## Review Record

**Reviewer:** <name supplied by the reviewer, or not recorded>
**Revision:** <exact reviewed head>
**Scope:** <full review or targeted delta>
**Status:** <complete | follow-up required>
**Comprehension:** <demonstrated | not assessed | follow-up required>

**Directly inspected**
- <area, as declared by the reviewer>

**Primarily automation-trusted**
- <area and available evidence>

**Risks discussed**
- <risk, decision, and any accepted tradeoff>

**Follow-up required**
- <remaining work and owner, or none>
```

For authors, skipped questions, or noninteractive runs, record 'not assessed';
never invent answers or claim independent approval. Note when independent
review is still required. Let the reviewer keep the record local.

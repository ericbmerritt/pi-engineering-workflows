# Shared spec standard

This is the quality bar for spec drafting and adversarial spec review.
Use the [spec lens](../../review/references/spec-review.md) for the canonical
review checklist; do not create a competing pass list or numerical score.

## What the document must transfer

A reader should understand the problem, proposed solution, and how success will
be verified without reconstructing the author's conversation.

- **Problem and scope:** affected actors, current behavior, intended outcome,
  explicit non-goals, and relevant constraints.
- **Domain model:** defined terms, state ownership, invariants, boundaries, and
  contracts. Explain what a term does not mean when confusion is likely.
- **Proposed behavior:** normal operation, realistic failure/recovery, compatibility,
  and any important lifecycle or rollout behavior.
- **Decisions:** consequential choices, rationale, alternatives, and who has
  authority to accept the tradeoff. Distinguish proposals from agreements.
- **Verification:** observable acceptance criteria tied to requirements, evidence
  needed, and how gaps will be resolved.
- **Open questions:** the exact decision still needed, its impact, and an owner
  or an explicit 'owner not yet assigned'.

Depth follows risk. Do not require database, UI, migration, or rollout sections
when the change has none. 'Not applicable' should explain a relevant exclusion,
not become boilerplate on every page.

## Evidence and examples

Separate observed facts and cited evidence from assumptions and illustrative
examples. A plausible number is not a measured number. A future test is not a
passing test. Do not silently promote a desired property into an existing guarantee.

Acceptance criteria describe behavior and the evidence that distinguishes success
from failure. 'Has tests', 'is reliable', and 'CI is green' alone do not identify
what the change must prove. Include a failure observable where it carries risk.
Ask whether a degenerate implementation could satisfy a metric without solving
the problem; if so, revise the criterion.

Use a concrete scenario to check that responsibilities and transitions fit.
Diagrams must match the prose; they are not a substitute for defining a contract.
Use examples without implying invented people, timings, data, or commitments are real.

## One canonical home per claim

Define each invariant, requirement, number, or support promise once. References
should carry enough context to be useful without repeating the whole statement.
If artifacts must repeat a claim, identify the canonical source and update every
restatement when it changes. Plans should reference requirement IDs and acceptance
criteria rather than copying their wording into every phase.

## Concision without losing the model

Keep rationale, exclusions, non-obvious failure modes, definitions, concrete
examples, evidence, and clarifying diagrams. Cut repeated explanations, prose
that merely narrates a table, decorative headings, and speculative future work.
Length alone is not a defect; loss of necessary context is.

Mark consequential decisions and open questions visibly. Do not label every fact
as a decision. A reviewer needs to see what they are being asked to accept.

## Readiness

- **Draft:** the model or proposal is still forming, or an implementation-blocking
  assumption, decision, or acceptance criterion is unresolved.
- **Ready for review:** the document meets the shared quality bar and names any
  deliberately deferred work with boundaries and ownership. This is not approval.
- **Accepted:** an authorized human explicitly accepted the identified revision.
  Do not infer this from a tool result, an adversarial model's opinion, or silence.

Report review coverage and limitations separately from readiness. A requested
independent review that did not happen remains incomplete, even when the draft
is otherwise ready. Never invent its result or silently substitute a different
review mode.

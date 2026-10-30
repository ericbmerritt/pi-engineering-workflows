# Correctness

Core question: is the logic right under realistic production conditions?
For each defect, describe an input/state, the execution path, and the wrong result.
Unknown domain intent is a question, not proof that the implementation is wrong.

## Logic and exhaustiveness

- Inverted guards, wrong boolean/arithmetic operators, and misplaced negation.
- Off-by-one ranges, page numbering, array/slice boundaries, and unit conversions.
- Short-circuit side effects and early returns that skip required work.
- Nullable values, missing fields, union variants, and error/result contracts.
- Success status handling matches the actual API, including empty responses.
- Callers handle changed return types, exceptions, defaults, and lifecycle rules.
- Numeric precision, overflow, time zones, and ordering match domain requirements.

Do not demand a local catch around every await. Determine where errors are
handled and whether that boundary preserves the intended outcome.

## State and concurrency

- Operations are allowed in the entity's current state.
- Read-modify-write sequences and deduplication are atomic where needed.
- Database uniqueness/constraints support application invariants; a preliminary
  `NOT EXISTS` check alone cannot enforce uniqueness under concurrency.
- Retries, re-runs, and resumed jobs are idempotent or explicitly reconciled.
- Concurrent invocations cannot double-process or overwrite each other's work.
- Captured mutable values and input mutation do not violate callers' assumptions.
- Background tasks, locks, and resources have complete shutdown/cleanup paths.

## Failures

Trace failures after each side effect, not just at the start of the operation.
Look for partial commits, swallowed errors, incorrect success responses,
resource leaks, hangs, retry storms, and cascading failures.

An empty result on query failure can hide the distinction between no data and
an unavailable dependency. A batch returning success after item N fails can
hide partially written state. Name that consequence and the required recovery.

## Claims that do not hold

Verify comments, docs, benchmarks, and PR assertions against actual execution:

- Does the credited retry, eviction, caching, or cleanup mechanism fire here?
- Does a quoted quantity track its source-of-truth value?
- Does a claimed behavior-preserving change alter timeout, error, or retry policy?
- Does a migration or cutover work for old data and mixed-version consumers?

False behavioral claims are correctness findings; stale duplicates also need
correction wherever readers rely on them.

## Historical context

Use history research to prioritize scrutiny and seek matching failure scenarios.
Cite relevant commits when they genuinely explain a defect. A recent revert or
frequent fixes can justify a question, but never a finding or severity increase
by itself. The current change must still have a demonstrated problem.

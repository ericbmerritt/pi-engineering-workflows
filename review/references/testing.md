# Testing

## Behavioral coverage

- New behavior has assertions that distinguish it from the old behavior.
- Bug fixes include the triggering scenario, not only a nearby happy path.
- Boundaries, null/empty values, variant handling, and failure paths are exercised.
- Retry, timeout, cancellation, concurrency, rollback, and resume behavior are
  tested where those are part of the change's risk.
- Tests would fail if the changed behavior were reverted.

Ask what each test proves. A test named for truncation that never exercises
fractional input does not prove truncation. An assertion of library behavior
alone does not prove the repository's integration.

## Contracts and boundaries

Unit mocks test local reasoning. They do not prove that a separately deployed
service accepts a hand-built payload. Look for a real schema, provider contract,
simulator, integration test, or end-to-end evidence for external interfaces.

Mock I/O at the seam actually called; a new import path can bypass an existing
mock. Prefer dependency injection or scoped spies when module mocks leak across
tests. Check the runner/version's actual isolation semantics rather than banning
a particular mocking API universally.

## Quality and stability

- Assertions express useful observable outcomes rather than private implementation.
- Tests isolate mutable state, clocks, environment, and temporary resources.
- Cleanup runs on failure; delays do not substitute for synchronization.
- UI tests use meaningful accessible selectors or the project's stable test hooks.
- Fixtures and shared helpers fit existing conventions.
- Skipped tests have a documented reason and owner.

## Evidence and gaps

Read existing CI results and test commands. Ask permission before executing
repository code; tests can run scripts, network requests, and destructive setup.
Record exactly what ran, which revision it covered, and what failed or was not run.
Do not present reading test code as executing it.

Use project coverage targets if defined. Never invent a percentage or treat
line coverage as proof of correctness. Name the untested risky behavior and a
specific test that would catch it. Severity follows the risk of that gap, not an
arbitrary coverage threshold.

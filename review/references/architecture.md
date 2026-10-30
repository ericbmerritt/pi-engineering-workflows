# Architecture and organization

## Responsibility and boundaries

- Compare module placement to this repository's domain model and layering.
- Trace business logic, persistence, presentation, and transport responsibilities.
  Flag a misplaced responsibility when it creates a concrete coupling or
  correctness problem, not merely because another layout is possible.
- Check server/client boundaries, shared contracts, initialization order,
  dependency cycles, and hidden infrastructure requirements.
- Prefer a functional core with explicit I/O boundaries where it fits the project.

## Cohesion and size

Use file and function size as prompts to inspect cohesion, not automatic defects.
Configuration, schemas, generated code, and cohesive algorithms may be large.
For a split proposal, name the unrelated responsibilities, extraction seams,
public interfaces, and tests that need to move. Avoid splitting solely to meet
an invented line-count limit.

## Determinism and infrastructure

- Are required tools and versions declared? Can two build agents produce
  different results from the same inputs?
- Does a fallback implement a documented capability, or silently conceal a
  missing required dependency?
- Are feature flags explicit, owned, and consistent with deployment behavior?
- Are build/configuration files orchestrating tools or hiding substantial
  untested business logic? Recommend extraction when it improves testability.

Runtime capability detection and graceful degradation can be deliberate design;
review their contract rather than banning them.

## Compatibility and rollout

- Identify consumers of changed APIs, stored formats, events, and configuration.
- Check mixed-version deployments, rollback, backfill, and migration ordering.
- Verify that compatibility code serves a supported consumer or rollout need.
  Do not recommend deletion without checking that need.
- Inspect remaining old paths and flags after completed migrations.

A finding names the boundary or responsibility violated, the resulting problem,
and a specific correction. Treat architectural preferences as suggestions
unless repository policy or demonstrated impact makes them blocking.

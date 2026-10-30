# Details and maintainability

## Types and contracts

- Types reflect actual runtime values, including null, optional fields, and errors.
- Assertions and suppressions have a proven invariant or a documented boundary.
  Prefer narrowing or runtime parsing to asserting untrusted data is valid.
- Unconstrained generics cannot manufacture a runtime guarantee. A `getData<T>()`
  returning caller-selected `T` is not safer than `unknown` without a parser.
- Fixed outbound payloads use an available schema or typed representation;
  dynamic shapes and test fixtures need not be forced into new abstractions.
- Check language-appropriate exhaustiveness and error handling. Apply strict
  compiler settings and annotation policies only where the project requires them.

A cast, `any`, suppression, or `unwrap` is a place to investigate, not automatically
a critical finding. Literal narrowing such as `as const` is not an unsafe cast.

## Debris and incomplete work

Inspect debug output, unused code, commented experiments, placeholder branches,
obsolete APIs, and temporary flags. Distinguish intentional CLI output and
production observability from accidental debugging. TODOs with an owner and
tracked follow-up may be valid; missing required behavior is the defect.

Do not infer whether code was AI-generated. Judge its behavior and value.
Preserve license notices, provenance requirements, useful specs, and required
attribution; do not delete them as cosmetic clutter.

## Comments and documentation

- Remove redundant narration when clearer names or structure suffice.
- Keep invariants, units, gotchas, algorithm explanations, public API contracts,
  support constraints, and non-obvious rationale.
- Verify each retained claim against the code or cited evidence. A misleading
  behavior claim belongs in correctness, not merely a comment-style finding.
- Search for stale restatements of changed claims in docs, specs, comments,
  and the PR description. Name which behavior the documentation still misstates.

No comment quota or blanket prohibition on explaining an algorithm.

## Clarity

- Naming reflects behavior and matches local conventions.
- Constants clarify meaningful repeated values; don't extract every literal.
- Error messages identify the problem and next action without exposing secrets.
- Nested branches, boolean flags, long parameter lists, and low-cohesion functions
  have understandable control flow.
- A simplification preserves the return contract. Optional chaining can return
  `undefined` where an explicit branch returned `false`.

Trust formatting/lint tooling for mechanical style. Findings should explain a
reader or maintenance problem, not impose the reviewer's personal style.

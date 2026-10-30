# Reuse and functional design

## Search before judging

For each new capability, search the repository for similar names, behavior,
contracts, and utility modules. Inspect candidate implementations and callers;
a name match alone is not evidence of duplication.

Example searches, adapted to the repository:

```bash
rg -n 'formatDate|parseDate|dateRange' src shared lib
rg -n 'validateEmail|fetchUser|HttpClient' src shared lib
rg --files -g '*util*' -g '*helper*' -g '*client*'
```

Look beyond generic utilities: authentication, retry/error handling, state
management, observability, fixtures, component patterns, and API clients often
already have project-specific abstractions.

## Verify fitness

- Does the existing capability meet the new contract, including edge cases?
- Does it carry authentication, telemetry, retry, or validation behavior the new
  implementation accidentally bypasses?
- Would extending it preserve existing callers' behavior?
- Would sharing code cross a boundary or couple independently evolving domains?
- Is replacement justified by correctness, support status, or compatibility?

Flag duplication when it creates inconsistent behavior, bypasses guarantees,
or introduces a concrete maintenance cost. Independent code with different
semantics may be correct; do not force an abstraction based on visual similarity.

## Functional reasoning

- Are effects explicit, and can business rules be tested independently of I/O?
- Do functions mutate inputs or shared state callers expect to remain stable?
- Are dependencies hidden in globals, clocks, environment, or singletons?
- Are data transformations clear and locally understandable?

For each reuse finding, cite both implementations, explain the relevant shared
contract, and name the capability to reuse or extend. Do not call duplication
critical without a critical consequence.

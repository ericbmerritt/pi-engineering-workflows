# Cross-PR interaction

Find semantic conflicts: changes that merge textually but produce wrong behavior
when combined. Use the verified repository and the reviewed PR's target branch.
This pass is optional when hosting access or open-PR context is unavailable.

## Discover candidates

Fetch open non-draft PRs targeting the same branch. Exclude the reviewed PR.
Use the host's supported pagination or a stated result limit. A result limit is
not proof that all PRs were scanned; report truncation and fetch failures.

Compare changed files and directories, then inspect shared contracts and callers.
File overlap is a useful first filter, not a complete dependency analysis: a
changed producer and a new consumer may live in different directories.

Suppress overlap only when the diffs demonstrate independence, such as unrelated
imports or independent configuration entries. Shared keys, types, schemas,
resources, migrations, and function behavior need closer inspection.

## Analyze combinations

- **Contradictory assumptions:** a new caller relies on behavior another PR removes.
- **Concurrent modification:** changes to the same operation undermine one another.
- **Shared contracts/state:** fields or resources collide or acquire incompatible shapes.
- **Ordering:** migration or rollout order creates invalid intermediate states.
- **Behavioral interference:** error handling, retries, caching, or event semantics
  change the outcome of another PR's code.

Parallel analysis is optional. If used, give each worker both diffs, descriptions,
reviewed revisions, and the overlap/dependency to inspect. Verify worker findings
before accepting them. Do not send private code outside permitted environments.

For each conflict cite the other PR, affected functions/contracts, merge order,
wrong behavior, and a coordination or compatibility fix. Textual merge conflicts
are not semantic defects. Mere overlap is not a finding.

## Report scope

Record PRs listed, candidates identified, PRs fully analyzed, failed fetches,
and list limits. If a rate limit or budget stops the scan, label it partial.
Do not write 'no cross-PR risk' when only a subset was examined.

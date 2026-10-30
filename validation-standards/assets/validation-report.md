# <Change> — validation evidence

**Artifact / scope:** <exact revision plus any dirty/index/untracked snapshot>
**Requirements:** <spec revision or contract sources>
**Environment:** <local, isolated services, CI job, or deployment identity; no secrets>

Use the shared [evidence standard](../references/evidence.md).

| Check / contract | Exact command or procedure / directory | Expected vs actual | Status / evidence |
|---|---|---|---|
| <check ID and relevant contract> | <executed command, or explicitly proposed only> | <observable result and meaningful exit status> | <status and current-run evidence> |

## Limits and gaps

<Mocked boundaries, missing checks, blockers, failures, stale snapshots, cancelled
runs, and alternative evidence. An accepted gap is not a passing check.>

## Cleanup and side effects

<Owned processes/resources removed, unexpected writes/effects, persistent artifacts
remaining, and any permission or owner needed to finish cleanup.>

## Conclusion

<What the evidence supports, what remains unverified, and what must run again if
the artifact changes. Do not invent human approval or readiness to merge.>

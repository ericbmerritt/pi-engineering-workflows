# Verification evidence

This is the shared evidence vocabulary for test planning, validation, and PR
preparation. A check's implementation, its execution, and its relevance to a
contract are separate claims.

## Status vocabulary

| Status | Meaning |
|---|---|
| planned | A proposed check; no execution claimed |
| passed | An executed check met its stated expectation on the recorded artifact |
| failed | An executed check contradicted its expectation; retain the actual failure |
| blocked | An identified prerequisite or environment prevented a meaningful result |
| not-run | No execution result; say why it was omitted, interrupted, or cancelled |
| not-applicable | The check does not apply to this scope; explain why |

A timeout proving an expected rejection can pass that specific check. An unrelated
harness timeout is blocked or not-run, not a behavior pass. Preserve partial results
and uncertainty rather than converting them into blanket success or a code defect.

A check's passing result does not prove contracts outside what it exercised. Do
not use a coverage percentage, green badge, mock expectation, or source inspection
as a substitute for an unobserved boundary.

## Artifact identity

Record the repository/context and exact scope. For a clean committed artifact,
use the full commit or equivalent immutable revision. For dirty, index-only, or
untracked content, record a content fingerprint or bounded snapshot identifying
the actual files tested in addition to the base revision. If that cannot be
captured reliably, disclose the weaker identity and its limits.

Identify the spec/requirement revision too when it defines the expected behavior.
Distinguish an index snapshot from a working tree and a local file from a deployed
build. A remote CI result must match the relevant commit and job, not just a
branch name; cancelled or still-running jobs are not green evidence.

Recheck identity after execution. If checks changed generated files or someone
edited the source meanwhile, explain which observations still apply and rerun
what was invalidated. Never transfer a pass silently to a newer revision.

## Record per observation

- Contract/check ID and the expected observable behavior.
- Exact command or manual procedure, working directory, runner/tool version when
  relevant, and environment identity without credential values.
- Artifact identity, execution time, and meaningful exit/result information.
- Actual outcome and status, including partial failures and any truncated output.
- Evidence location or concise relevant output; sanitize logs and fixtures.
- Limits: mocked boundaries, unavailable services, test selection, or untested cases.
- Cleanup performed, persistent artifacts remaining, and any decision/owner needed.

Store evidence only when authorized. Do not dump environment variables, tokens,
private records, full session histories, or secrets into a report, fixture, or PR.
Use run-specific output paths when logs are saved; avoid mixing old and new runs.

## Conclusions

Separate 'this command passed' from 'this contract is supported' and from 'the
change is ready to merge'. Report missing proof even if the project allows the
remaining risk. A user may accept a gap, but that does not turn a not-run check
into a pass or establish a guarantee the evidence does not support.

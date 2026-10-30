# Safe verification execution

Use this when planning or executing repository code, service boots, browser
checks, external calls, or persistent test data. Planning is read-only; execution
and side effects need permission for their actual scope.

## Before execution

Inspect the proposed command and relevant scripts/hooks. Identify file writes,
network destinations, dependency downloads, migrations, account actions, workers,
and cleanup. Use the smallest isolated environment that proves the contract.
Do not assume a command is harmless because its name contains 'test' or 'dry run'.

Use synthetic inputs and approved test accounts. Local processes, containers,
and preview deployments can still point at production dependencies. Check reads
as well as writes; a harmless-looking read may reveal private data or impose load.
Never contact production or trigger an unsandboxed effect without explicit approval.

If a dependency URL, credential, or safety boundary cannot be established, stop
and name the unknown. Do not print secret values to prove configuration.

## Prove containment positively

Before a risky action, use a harmless request through the same dispatch path and
observe the intended stand-in receiving it. Reading a debug configuration endpoint
only proves that endpoint saw the setting. No dangerous hostname in a log does
not prove a request reached a safe destination.

In a multi-service chain, verify each relevant outbound hop independently; one
service's override does not configure its upstream or downstream peers. For
queue-backed work, account for the worker and delayed/retried execution as well
as the initial request. Do not let an unverified hop trigger the real effect.

Use provider-supported sandboxes, verified simulators, contract fixtures, or
sanitized recordings when they exercise the boundary in question. Explain their
limits. Never capture private production traffic as a convenient test fixture;
remove authorization, cookie, API-key, and personal-data fields from permitted
recordings before storing or sharing them.

## Bound time and resources

Use finite waits and an execution budget. Track processes started by this run,
readiness and meaningful completion separately, and cancel only owned processes.
Add failure/cancellation cleanup; do not rely only on a later success-path command.

Background CPU/load generators must be independently self-limiting, for example
under an available timeout mechanism, with an exit trap as a second defense.
Never spawn an unbounded busy loop or leave a load test running after interruption.
Do not introduce stress testing merely because a smoke was requested.

## Cleanup is part of the run

Plan cleanup before creating data. Use run-unique identifiers and remove only the
resources the user authorized this run to create and clean up. Stopping processes
does not delete rows, objects, jobs, notifications, or downstream captures.

For asynchronous effects, wait for the expected worker outcome before cleanup;
do not delete a queue entry from under a running worker. Where relevant and
permitted, account for audit/analytics copies too. Do not alter mandatory audit
records or retention controls in the name of cleanup.

Report what was removed, what remains, and who must address it. If cleanup fails,
the report is incomplete without that fact. Never broaden deletion scope, hide an
irreversible effect, or reuse destructive cleanup against a shared environment.

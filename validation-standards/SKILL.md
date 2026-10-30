---
name: validation-standards
description: Scoped verification of code, tests, documentation, or configuration changes before completion, handoff, or pull request creation, with exact execution evidence and remaining gaps.
---

# Validate a change

Establish what was actually verified on which artifact. Discover the project's
checks, agree the execution scope, run approved commands, and report honest results.

Use the shared [evidence standard](references/evidence.md) for statuses and records,
and [safe execution](references/safe-execution.md) for execution and cleanup rules.
These references are also used by test planning and PR preparation.

## Boundaries

- Begin with read-only discovery. Invoking this workflow is not blanket permission
  to run repository code, install packages, start services, or access live systems.
- An explicit request for identified commands can authorize those commands, subject
  to host approvals. Otherwise show the proposed checks and ask before running them.
- File fixes, auto-formatting, snapshot updates, generated output, dependency changes,
  staging, commits, pushes, and publication need their own appropriate permission.
- Follow project requirements; do not invent mandatory tools, coverage percentages,
  single-commit rules, or a passing result for an unavailable check.

## Usage

```text
/validate
/validate the staged change
/validate run the approved unit checks for the retry workflow
```

Arguments describe scope and intent; never pass them straight to a shell. If the
repository or change is unclear, ask. If execution cannot be authorized in the
current mode, return the proposed checks and limitations without running them.

## 1. Identify the artifact

Verify the repository root, applicable guidance, and intended change. Distinguish
working-tree content, the Git index, committed ranges, and jj revisions/bookmarks.
Do not infer a staging area in jj or silently switch to a different revision.

Record the artifact according to the evidence standard, including dirty and
untracked content when relevant. Running tests in a working tree does not validate
the index or a historical revision when their contents differ. Explain that gap;
ask before creating an isolated checkout or changing the working copy to test it.

When other people or agents are editing, stay within the agreed task. Do not
revert their work or format the whole repository to clean up unrelated failures.

## 2. Discover the checks without executing them

Read project instructions, manifests, lockfiles, test configuration, task files,
and CI definitions. Inspect the actual scripts and relevant hooks a proposed
command invokes. A command named 'check' may write files or contact a network.
Do not source configuration files or run a task merely to discover what it does.

Identify checks appropriate to the change: types/compilation, lint, formatting in
check-only mode, relevant tests, integration/contract checks, smoke, build/package
validation, and any project-specific security or compatibility gates. Mark a
category not applicable only with a reason; do not claim every project has it.

Use existing pinned tools and the project's package manager. A package-manager
exec command may download a tool; verify local availability rather than silently
installing one. Never replace a lockfile or change credentials to make a check run.

For behavior, use the [test plan](../test-plan/SKILL.md) if available and the
[testing lens](../review/references/testing.md) for risky omissions. Without a plan,
state what each selected check proves and what remains uncovered.

## 3. Agree a scoped run

Show the commands, working directories, scope, expected observables, environment,
side effects, approximate resource needs if known, and cleanup. Name any install,
external access, migration, write, or service boot requiring additional permission.
Do not print secrets while describing the environment.

Start with fast relevant checks. Use file-scoped checks where supported, but keep
project context when the typechecker, build, or runner requires it. A targeted run
is fast feedback, not a substitute for a required broader gate. Propose the broader
sequence up front when needed so permission can cover the sequence explicitly.

For a runtime path, include the planned smoke or explain its blocker and alternative
evidence. Do not treat a mocked unit suite as a successful end-to-end run.

## 4. Run approved checks and inspect actual results

Execute only the agreed sequence, observing the safe-execution reference. Preserve
the command's exit status when logging through a pipeline. Read the exact current
run's output, not a glob mixing old logs. Never infer success from silence, a
launcher returning zero, or a background process merely starting.

Capture results using the evidence standard. Report failed assertions separately
from environment failures, cancellations, timeouts, or commands never started.
If only part of the output is available, report that limitation.

If a command unexpectedly writes files or reaches outside the approved environment,
stop as safely as possible, report the effect, and ask how to proceed. Do not
silently delete data, kill unrelated processes, or undo concurrent edits.

## 5. Handle failures without weakening the proof

Diagnose from the actual failing run. Check the installed tool's official
instructions when behavior is surprising. Separate a defect in the change from
an unrelated baseline issue or an unavailable environment; do not blame the
baseline without evidence.

Propose fixes and ask before editing unless those fixes are already authorized.
When authorized, fix the relevant error class across the agreed scope rather than
one hit at a time. Do not silence assertions, lower thresholds, accept snapshots,
skip tests, or widen permissions simply to obtain green output.

After a fix, rerun affected checks and any broader gates invalidated by the change.
Keep the earlier failure and later result distinct. Repeated green retries do not
erase a flaky failure; document the failure, conditions, and remaining risk.

## 6. Report evidence, not readiness theater

Use the [report template](assets/validation-report.md). Include the exact artifact,
checks and outcomes, expected/actual behavior, gaps, environment limits, cleanup,
and follow-up decisions. Link any stored output without exposing secrets.

A pass applies only to the recorded scope and snapshot. Source changes, dependency
changes, or newly discovered assumptions may invalidate it. Recheck the snapshot
before handoff and state what needs rerunning.

'Checks passed' is not 'all contracts verified', production safety, human approval,
or permission to commit/push/open a PR. Hand off remaining gaps explicitly; do not
start another workflow or publish results automatically.

# Mocks, lookup seams, and isolation

Use the project's installed runner/version. Consult its official docs before
changing import mocking, cleanup, timers, or concurrency. Mock APIs with similar
names do not necessarily have the same lifecycle across Node, Bun, Jest, Vitest,
or Python. Prefer explicit collaborators over process-global module replacement.

## Select the seam

| Technique | Appropriate use and limits |
|---|---|
| Dependency injection | Pass a fake collaborator into real production behavior; keeps tests local without replacing module caches. |
| Reversible spy | Observe/replace the property the production call actually uses; restore it in runner-managed teardown. |
| Factory | Construct an instance with controlled collaborators instead of mutating a shared singleton. |
| Module replacement | Only when the harness supports the required isolation and cache lifecycle; import side effects may already have run. |

Keep fakes small and deterministic. Assert both the visible result and relevant
interaction when the contract requires it. For a rejected request, checking only
that an exception occurred misses an accidental external write; also verify no
write occurred through the seam actually used by production.

Trace the lookup: patching an exported client does not intercept a function that
captured another reference earlier, and patching a wrapper does not intercept a
new direct subprocess call. Verify aliasing, construction, destructured imports,
and import-time side effects against the installed runtime. Do not import a
module known to perform live effects merely to install a spy afterward.

A provider mock must not become the source of truth for the provider's payload.
Use independently supported contract evidence for external schemas. An assertion
that a fake returned the value you configured is not a test of repository behavior.

## Bun-specific caution

The official [Bun mocks documentation](https://bun.sh/docs/test/mocks) states that
`mock.restore()` restores mocked functions but does **not** reset modules
overridden with `mock.module()`. A general teardown call is not evidence that
module replacements disappeared. Updating an already-imported module also does
not undo its earlier side effects.

For ordinary per-test isolation, use injected dependencies or `spyOn()` with
teardown restoration. An illustrative shape, adapted to the project's real
production import and signature (not a bundled executable test), is:

```typescript
import { afterEach, expect, mock, test } from "bun:test";
import { submit } from "./submission";

afterEach(() => mock.restore());

test("rejects an empty submission before sending", async () => {
  const send = mock(async () => ({ id: "synthetic-id" }));

  await expect(submit({ send }, { items: [] })).rejects.toThrow("empty");
  expect(send).not.toHaveBeenCalled();
});
```

The production `submit` must actually use the injected `send`. Do not implement
a fake `submit` inside the test to satisfy these assertions. Do not assume this
example defines your project's intended empty-input behavior; derive that from
its contract. For spies, install them within the scoped setup and restore on
failure as well as success. Clearing call history is not restoring an overridden
implementation. Verify both according to the actual runner.

If a project needs process-wide module replacement to prevent import-time effects,
agree a separate isolated harness/process and preload strategy. Document its
scope and lifetime; do not claim it is safely per-test because tests passed alone.

## Boundary and cleanup checks

A database transaction covers only work participating in it. Confirm pooled
queries, workers, triggers, queues, objects, and network side effects independently.
Use run-unique synthetic identifiers and authorized cleanup for persistent effects;
never truncate a shared database or delete other tests' resources as teardown.

Do not let tests share mutable fake state, environment variables, listeners, or
ports accidentally. Restore only changes owned by the test, with cleanup even
when assertions fail or execution is cancelled. Await relevant async completion
before removing fixtures; cleanup racing a worker can itself create a flake.
Use a bounded suite-level run to expose leak/order problems, not an unbounded
retry loop that reports only the final green result.

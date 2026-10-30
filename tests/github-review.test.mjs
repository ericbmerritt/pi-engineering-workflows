import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { submitReview } from "../lib/github-review.ts";
import {
  buildBatch,
  checkSnapshot,
  matchingReview,
  normalizeRequest,
  parseAnchors,
  parseSnapshot,
  validateAnchors,
} from "../lib/review-batch.ts";
import { ReviewError, parseJson } from "../lib/review-error.ts";

const head = "a".repeat(40);
const base = "b".repeat(40);
const other = "c".repeat(40);
const diff =
  "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1,3 +1,4 @@\n same\n-old\n+new\n+extra\n end\n";
const request = {
  hostname: "github.com",
  repository: "example/project",
  pullRequest: 42,
  reviewedCommit: head,
  verdict: "request-changes",
  body: "See inline comments.",
  comments: [
    { path: "a.txt", line: 2, side: "RIGHT", body: "Fix this invariant." },
  ],
};
const reviewURL =
  "https://github.com/example/project/pull/42#pullrequestreview-1";
const marker = buildBatch(normalizeRequest(request, "github.com")).marker;
const receipt = {
  commit_id: head,
  state: "CHANGES_REQUESTED",
  html_url: reviewURL,
  body: `See inline comments.\n\n${marker}`,
};

function harness(options = {}) {
  const calls = [];
  const writes = [];
  const previews = [];
  const confirmations = [];
  let snapshots = 0;
  let reviewReads = 0;
  const controller = new AbortController();
  const pi = {
    exec: async (command, args, execOptions) => {
      calls.push({ command, args, execOptions });
      if (command === "bash") {
        const payload = JSON.parse(await readFile(args[4], "utf8"));
        writes.push({ payload, args });
        if (options.throwOnWrite) throw new Error("Connection interrupted");
        if (options.abortOnWrite) controller.abort();
        return {
          code: options.writeCode ?? 0,
          killed: options.killed ?? false,
          stdout: options.writeOutput ?? JSON.stringify(receipt),
          stderr: "simulated write diagnostic",
        };
      }
      assert.equal(command, "gh");
      assert.equal(args[0], "api");
      assert.ok(args.includes("GET"));
      if (options.preflightFailure)
        return { code: 1, killed: false, stdout: "", stderr: "no permission" };
      if (args[1].endsWith("/reviews")) {
        reviewReads++;
        const reviews = options.reviews?.(reviewReads) ?? [];
        return {
          code: 0,
          killed: false,
          stdout: JSON.stringify([reviews]),
          stderr: "",
        };
      }
      if (args.includes("Accept: application/vnd.github.v3.diff")) {
        return {
          code: 0,
          killed: false,
          stdout: options.diff ?? diff,
          stderr: "",
        };
      }
      snapshots++;
      return {
        code: 0,
        killed: false,
        stdout: JSON.stringify({
          state: options.state ?? "open",
          head: { sha: options.head?.(snapshots) ?? head },
          base: {
            sha: options.base?.(snapshots) ?? base,
            repo: { full_name: "example/project" },
          },
        }),
        stderr: "",
      };
    },
  };
  const ctx = {
    hasUI: options.hasUI ?? true,
    ui: {
      editor: async (_title, preview) => {
        previews.push(preview);
        if (options.cancelPreview) return undefined;
        return options.editPreview ? `${preview}\nchanged` : preview;
      },
      confirm: async (_title, preview) => {
        confirmations.push(preview);
        return options.approve ?? true;
      },
    },
  };
  return { pi, ctx, calls, writes, previews, confirmations, controller };
}

const run = (h, input = request) =>
  submitReview(h.pi, input, h.controller.signal, h.ctx);
const errorCode = (code) => (error) =>
  error instanceof ReviewError && error.code === code;

test("domain errors expose code, outcome, and cause", () => {
  const cause = new Error("network");
  const error = new ReviewError("ambiguous-submission", "Inspect GitHub", {
    cause,
  });
  assert.equal(error.name, "ReviewError");
  assert.equal(error.code, "ambiguous-submission");
  assert.equal(error.outcome, "unknown");
  assert.equal(error.cause, cause);
  assert.equal(
    new ReviewError("unverified-submission", "bad receipt").outcome,
    "accepted-unverified",
  );
  assert.equal(
    new ReviewError("invalid-anchor", "bad line").outcome,
    "not-submitted",
  );
});

test("invalid GitHub JSON and response shapes use domain errors", () => {
  assert.throws(() => parseJson("not json"), errorCode("invalid-response"));
  assert.throws(
    () => parseSnapshot("[]", request.repository),
    errorCode("invalid-response"),
  );
  assert.throws(
    () =>
      parseSnapshot(
        JSON.stringify({ base: { repo: { full_name: "wrong/repo" } } }),
        request.repository,
      ),
    errorCode("invalid-response"),
  );
  assert.throws(
    () =>
      parseSnapshot(
        JSON.stringify({
          base: { repo: { full_name: request.repository }, sha: base },
          head: { sha: head },
        }),
        request.repository,
      ),
    errorCode("invalid-response"),
  );
  assert.throws(
    () =>
      parseSnapshot(
        JSON.stringify({
          state: "open",
          base: { repo: { full_name: request.repository }, sha: "short" },
          head: { sha: head },
        }),
        request.repository,
      ),
    errorCode("invalid-response"),
  );
});

test("host normalization is explicit and never accepts URL or command syntax", () => {
  assert.equal(
    normalizeRequest({ ...request, hostname: undefined }, "enterprise.example")
      .hostname,
    "enterprise.example",
  );
  assert.equal(
    normalizeRequest(
      { ...request, hostname: "GITHUB.COM", repository: "Example/Project" },
      "unused",
    ).repository,
    request.repository,
  );
  for (const hostname of [
    "https://github.com",
    "--hostname=bad",
    "github.com/path",
    "$(bad)",
  ]) {
    assert.throws(
      () => normalizeRequest({ ...request, hostname }, "github.com"),
      errorCode("invalid-batch"),
    );
  }
  assert.throws(
    () => normalizeRequest({ ...request, body: "  " }, "github.com"),
    errorCode("invalid-batch"),
  );
  assert.throws(
    () =>
      normalizeRequest(
        { ...request, comments: [{ ...request.comments[0], body: " " }] },
        "github.com",
      ),
    errorCode("invalid-batch"),
  );
});

test("batch preserves typed numbers, pins SHA, and is stable across object key order", () => {
  const first = buildBatch(normalizeRequest(request, "github.com"));
  const reordered = Object.fromEntries(Object.entries(request).reverse());
  const second = buildBatch(normalizeRequest(reordered, "github.com"));
  assert.deepEqual(first, second);
  assert.equal(first.payload.commit_id, head);
  assert.equal(first.payload.event, "REQUEST_CHANGES");
  assert.equal(typeof first.payload.comments[0].line, "number");
  assert.ok(first.payload.body.includes(first.marker));
  for (const [verdict, event] of [
    ["approve", "APPROVE"],
    ["comment", "COMMENT"],
  ]) {
    const batch = buildBatch(
      normalizeRequest({ ...request, verdict, comments: [] }, "github.com"),
    );
    assert.equal(batch.payload.event, event);
    assert.equal("comments" in batch.payload, false);
  }
});

test("diff anchors distinguish old, new, and context lines", () => {
  const anchors = parseAnchors(diff).get("a.txt");
  assert.deepEqual([...anchors.get("LEFT")], [1, 2, 3]);
  assert.deepEqual([...anchors.get("RIGHT")], [1, 2, 3, 4]);
  validateAnchors(request, diff);
  validateAnchors(
    { ...request, comments: [{ ...request.comments[0], side: "LEFT" }] },
    diff,
  );
  assert.throws(
    () =>
      validateAnchors(
        { ...request, comments: [{ ...request.comments[0], line: 99 }] },
        diff,
      ),
    errorCode("invalid-anchor"),
  );
});

test("diff parser supports new files, deleted files, rename paths, and multiple hunks", () => {
  const source =
    "diff --git a/gone b/gone\n--- a/gone\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n" +
    "diff --git a/new b/new\n--- /dev/null\n+++ b/new\n@@ -0,0 +1 @@\n+new\n\\ No newline at end of file\n" +
    "diff --git a/before b/after\n--- a/before\n+++ b/after\n@@ -1 +1 @@\n-old\n+new\n@@ -10 +11 @@\n-x\n+y\n";
  const anchors = parseAnchors(source);
  assert.ok(anchors.get("gone").get("LEFT").has(1));
  assert.ok(anchors.get("new").get("RIGHT").has(1));
  assert.ok(anchors.get("after").get("LEFT").has(10));
  assert.ok(anchors.get("after").get("RIGHT").has(11));
});

test("quoted UTF-8, spaces, and escaped filenames resolve to API paths", () => {
  const source =
    'diff --git "a/caf\\303\\251\\t.txt" "b/caf\\303\\251\\t.txt"\n--- "a/caf\\303\\251\\t.txt"\n+++ "b/caf\\303\\251\\t.txt"\n@@ -0,0 +1 @@\n+new\n';
  assert.ok(parseAnchors(source).get("café\t.txt").get("RIGHT").has(1));
  assert.ok(
    parseAnchors(diff.replaceAll("a.txt", "a file.txt")).has("a file.txt"),
  );
  assert.throws(
    () => parseAnchors(source.replace('--- "a/caf', '--- "a/\\q/caf')),
    errorCode("invalid-anchor"),
  );
});

test("truncated diffs fail closed and binary files have no inline anchors", () => {
  assert.throws(
    () => parseAnchors(diff.replace(" end\n", "")),
    errorCode("invalid-anchor"),
  );
  assert.throws(
    () => parseAnchors(diff.replace("@@ -1,3 +1,4", "@@ -1,1 +1,4")),
    errorCode("invalid-anchor"),
  );
  assert.equal(
    parseAnchors("diff --git a/a b/a\nBinary files differ\n").size,
    0,
  );
});

test("head, base, or closed-state mismatches are structured failures", () => {
  assert.throws(
    () => checkSnapshot({ head, base, state: "closed" }, head),
    errorCode("closed-pr"),
  );
  assert.throws(
    () => checkSnapshot({ head: other, base, state: "open" }, head),
    errorCode("stale-review"),
  );
  assert.throws(
    () =>
      checkSnapshot({ head, base: other, state: "open" }, head, {
        head,
        base,
        state: "open",
      }),
    errorCode("stale-review"),
  );
});

test("one approved batch uses only the wrapper for the single POST", async () => {
  const h = harness();
  const result = await run(h);
  assert.equal(result.details.status, "posted");
  assert.equal(h.writes.length, 1);
  assert.equal(h.previews.length, 1);
  assert.equal(h.confirmations.length, 1);
  assert.ok(h.previews[0].includes('"hostname": "github.com"'));
  assert.deepEqual(h.writes[0].payload.comments, request.comments);
  assert.ok(h.writes[0].args[0].endsWith("scripts/submit-review-batch.sh"));
  assert.deepEqual(h.writes[0].args.slice(1, 4), [
    "github.com",
    request.repository,
    "42",
  ]);
  assert.ok(
    h.calls
      .filter((c) => c.command === "gh")
      .every((c) => c.args.includes("GET")),
  );
  await assert.rejects(readFile(h.writes[0].args[4]), { code: "ENOENT" });
});

test("explicit Enterprise hostname routes all reads and the write consistently", async () => {
  const h = harness();
  await run(h, { ...request, hostname: "enterprise.example" });
  assert.ok(
    h.calls
      .filter((c) => c.command === "gh")
      .every((c) => c.args.includes("enterprise.example")),
  );
  assert.equal(h.writes[0].args[1], "enterprise.example");
  assert.ok(h.previews[0].includes("enterprise.example"));
});

test("body-only verdict is pinned and uses the same approval and transport", async () => {
  const h = harness({
    writeOutput: JSON.stringify({ ...receipt, state: "APPROVED" }),
  });
  await run(h, {
    ...request,
    verdict: "approve",
    body: "Approved.",
    comments: [],
  });
  assert.equal(h.writes[0].payload.commit_id, head);
  assert.equal(h.writes[0].payload.event, "APPROVE");
  assert.equal("comments" in h.writes[0].payload, false);
  assert.equal(
    h.calls.some((c) =>
      c.args.includes("Accept: application/vnd.github.v3.diff"),
    ),
    false,
  );
});

test("no UI, no permission, invalid anchors, and stale PRs never reach POST", async () => {
  for (const [options, code] of [
    [{ hasUI: false }, "approval-required"],
    [{ preflightFailure: true }, "preflight-failed"],
    [{ diff: diff.replaceAll("a.txt", "other.txt") }, "invalid-anchor"],
    [{ head: () => other }, "stale-review"],
    [{ state: "closed" }, "closed-pr"],
  ]) {
    const h = harness(options);
    await assert.rejects(run(h), errorCode(code));
    assert.equal(h.writes.length, 0);
  }
});

test("preview cancellation, editing, or refusal cannot publish", async () => {
  for (const options of [{ cancelPreview: true }, { approve: false }]) {
    const h = harness(options);
    const result = await run(h);
    assert.equal(result.details.status, "cancelled");
    assert.equal(result.terminate, true);
    assert.equal(h.writes.length, 0);
  }
  const h = harness({ editPreview: true });
  await assert.rejects(run(h), errorCode("approval-changed"));
  assert.equal(h.confirmations.length, 0);
  assert.equal(h.writes.length, 0);
});

test("revision changes while human is deciding invalidate approval", async () => {
  for (const options of [
    { head: (n) => (n >= 3 ? other : head) },
    { base: (n) => (n >= 3 ? other : base) },
  ]) {
    const h = harness(options);
    await assert.rejects(run(h), errorCode("stale-review"));
    assert.equal(h.confirmations.length, 1);
    assert.equal(h.writes.length, 0);
  }
});

test("existing and concurrently submitted exact batches are not reposted", async () => {
  for (const options of [
    { reviews: () => [receipt] },
    { reviews: (n) => (n >= 2 ? [receipt] : []) },
  ]) {
    const h = harness(options);
    assert.equal((await run(h)).details.status, "already-posted");
    assert.equal(h.writes.length, 0);
  }
});

test("a failed CLI write is reconciled once, never retried", async () => {
  const h = harness({
    writeCode: 1,
    reviews: (n) => (n >= 3 ? [receipt] : []),
  });
  assert.equal((await run(h)).details.status, "posted");
  assert.equal(h.writes.length, 1);
});

test("unconfirmed failures, killed writes, cancellation, and thrown transport stay ambiguous", async () => {
  for (const options of [
    { writeCode: 1 },
    { killed: true },
    { abortOnWrite: true },
    { throwOnWrite: true },
  ]) {
    const h = harness(options);
    await assert.rejects(
      run(h),
      (error) =>
        errorCode("ambiguous-submission")(error) && error.outcome === "unknown",
    );
    assert.equal(h.writes.length, 1);
  }
});

test("successful writes with malformed or wrong receipts are not called safe to retry", async () => {
  for (const writeOutput of [
    "warning text",
    JSON.stringify({ ...receipt, commit_id: other }),
    "{}",
  ]) {
    const h = harness({ writeOutput });
    await assert.rejects(
      run(h),
      (error) =>
        errorCode("unverified-submission")(error) &&
        error.outcome === "accepted-unverified",
    );
    assert.equal(h.writes.length, 1);
  }
});

test("duplicate query rejects malformed pages and pending or dismissed matches", () => {
  for (const input of ["{}", "[{}]"]) {
    assert.throws(
      () => matchingReview(input, marker, head),
      errorCode("invalid-response"),
    );
  }
  for (const state of ["PENDING", "DISMISSED"]) {
    assert.throws(
      () =>
        matchingReview(JSON.stringify([[{ ...receipt, state }]]), marker, head),
      errorCode("existing-review"),
    );
  }
  assert.throws(
    () =>
      matchingReview(
        JSON.stringify([[{ ...receipt, html_url: null }]]),
        marker,
        head,
      ),
    errorCode("existing-review"),
  );
  assert.equal(
    matchingReview(
      JSON.stringify([[{ body: "unrelated" }], [receipt]]),
      marker,
      head,
    ),
    reviewURL,
  );
});

test("transport wrapper passes JSON as a file and never field-coerces comments", () => {
  const script = fileURLToPath(
    new URL("../scripts/submit-review-batch.sh", import.meta.url),
  );
  const payload = fileURLToPath(new URL("../package.json", import.meta.url));
  const fake = 'gh() { printf "%s\\n" "$@"; }; export -f gh; bash "$@"';
  const result = spawnSync(
    "bash",
    [
      "-c",
      fake,
      "test",
      script,
      "enterprise.example",
      "example/project",
      "42",
      payload,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split("\n"), [
    "api",
    "repos/example/project/pulls/42/reviews",
    "--hostname",
    "enterprise.example",
    "-X",
    "POST",
    "--input",
    payload,
  ]);
  const invalid = spawnSync("bash", [script], { encoding: "utf8" });
  assert.notEqual(invalid.status, 0);
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { threadVersion } from "../lib/feedback-model.ts";
import {
  responseHarness,
  prepare,
  run,
  thread,
  comment,
  target,
  head,
  base,
  other,
  errorCode,
} from "./fixtures/response-harness.mjs";

const twoThreads = () => [
  thread(),
  thread({ id: "thread-2", comments: [comment({ id: "root-2" })] }),
];

test("one exact batch approval posts replies, independently verifies them, then resolves in order", async () => {
  const h = responseHarness({ threads: twoThreads() });
  const request = await prepare(h);
  const result = await run(h, request);
  assert.equal(result.details.status, "completed");
  assert.equal(h.previews.length, 1);
  assert.equal(h.confirmations.length, 1);
  assert.match(h.previews[0], /pi-review-response:/);
  assert.match(h.previews[0], /Please preserve the failure status/);
  assert.deepEqual(
    h.writes.map((write) => write.kind),
    ["reply", "resolve", "reply", "resolve"],
  );
  const preview = JSON.parse(h.previews[0]);
  for (const [index, proposal] of preview.responses.entries()) {
    assert.deepEqual(h.writes[index * 2].payload, proposal.reply);
    assert.deepEqual(h.writes[index * 2 + 1].payload, proposal.resolution);
  }
  for (const receipt of result.details.receipts) {
    assert.equal(receipt.reply.status, "posted");
    assert.equal(receipt.resolution.status, "resolved");
    assert.ok(
      receipt.reply.url.startsWith(
        "https://github.com/example/project/pull/42",
      ),
    );
  }
  for (const write of h.writes) {
    assert.equal(write.mode, 0o600);
    await assert.rejects(readFile(write.args[2]), { code: "ENOENT" });
  }
});

test("reply-only rounds never resolve and Enterprise host selection reaches every read and write", async () => {
  const h = responseHarness({ hostname: "enterprise.example" });
  const result = await run(h, await prepare(h, { resolve: false }));
  assert.equal(result.details.status, "completed");
  assert.equal(result.details.receipts[0].resolution.status, "not-requested");
  assert.deepEqual(
    h.writes.map((write) => write.kind),
    ["reply"],
  );
  assert.equal(h.writes[0].args[1], "enterprise.example");
  assert.match(h.previews[0], /enterprise.example/);
});

test("resolution-only explicitly verifies and previews an existing published response", async () => {
  const existing = comment({
    id: "old-reply",
    body: "Already addressed.",
    replyTo: { id: "comment-1" },
  });
  const h = responseHarness({
    threads: [
      thread({ comments: [comment(), existing], viewerCanReply: false }),
    ],
  });
  const result = await run(
    h,
    await prepare(h, { reply: undefined, existingReplyId: existing.id }),
  );
  assert.equal(result.details.status, "completed");
  assert.equal(result.details.receipts[0].reply.status, "already-posted");
  assert.deepEqual(
    h.writes.map((write) => write.kind),
    ["resolve"],
  );
  assert.match(h.previews[0], /Already addressed/);
});

test("refreshed recovery reuses the exact authenticated reply without duplicate notifications", async () => {
  const h = responseHarness();
  await run(h, await prepare(h, { resolve: false }));
  const recovered = await run(h, await prepare(h));
  assert.equal(recovered.details.status, "completed");
  assert.equal(recovered.details.receipts[0].reply.status, "already-posted");
  assert.deepEqual(
    h.writes.map((write) => write.kind),
    ["reply", "resolve"],
  );
  h.state.threads[0].viewerCanReply = false;
  h.state.threads[0].viewerCanResolve = false;
  const noop = await run(h, await prepare(h));
  assert.equal(noop.details.receipts[0].resolution.status, "already-resolved");
  assert.equal(h.writes.length, 2);
});

test("absent UI and already-aborted calls do not read or publish", async () => {
  const headless = responseHarness({ hasUI: false });
  await assert.rejects(run(headless, {}), errorCode("approval-required"));
  assert.equal(headless.calls.length, 0);
  const aborted = responseHarness();
  aborted.controller.abort();
  await assert.rejects(run(aborted, {}), { name: "AbortError" });
  assert.equal(aborted.calls.length, 0);
});

test("preview cancellation, edits, rejected confirmation, and aborted approval never mutate", async () => {
  for (const options of [{ cancelPreview: true }, { approve: false }]) {
    const h = responseHarness(options);
    const result = await run(h, await prepare(h));
    assert.equal(result.details.status, "cancelled");
    assert.equal(result.terminate, true);
    assert.equal(h.writes.length, 0);
  }
  const edited = responseHarness({ editPreview: true });
  await assert.rejects(
    run(edited, await prepare(edited)),
    errorCode("approval-changed"),
  );
  assert.equal(edited.confirmations.length, 0);
  for (const key of ["onPreview", "onConfirm"]) {
    const h = responseHarness({
      [key]: (_state, { controller }) => controller.abort(),
    });
    await assert.rejects(run(h, await prepare(h)), { name: "AbortError" });
    assert.equal(h.writes.length, 0);
  }
});

test("head/base, identity, branch, viewer, and conversation drift during approval invalidate the batch", async () => {
  for (const change of [
    (state) => {
      state.pr.headRefOid = other;
    },
    (state) => {
      state.pr.baseRefOid = other;
    },
    (state) => {
      state.pr.headRefName = "different";
    },
    (state) => {
      state.viewer = { login: "other" };
    },
    (state) => {
      state.pr.state = "CLOSED";
    },
    (state) => {
      state.pr.id = "other-pr";
    },
    (state) => {
      state.threads[0].comments[0].body = "Edited objection";
    },
    (state) => {
      state.threads[0].comments = [
        ...state.threads[0].comments,
        comment({ id: "late" }),
      ];
    },
    (state) => {
      state.threads[0].viewerCanResolve = false;
    },
  ]) {
    const h = responseHarness({ onConfirm: change });
    await assert.rejects(run(h, await prepare(h)), (error) =>
      ["stale-review", "stale-thread"].includes(error.code),
    );
    assert.equal(h.writes.length, 0);
  }
});

test("closed PRs, wrong requested revisions, missing threads, and foreign PR nodes fail before preview", async () => {
  for (const mutate of [
    (_h, request) => {
      request.headCommit = other;
    },
    (h) => {
      h.state.pr.state = "CLOSED";
    },
    (_h, request) => {
      request.responses[0].threadId = "comment-1";
    },
    (h) => {
      h.state.pr.number = 43;
    },
  ]) {
    const h = responseHarness();
    const request = await prepare(h);
    mutate(h, request);
    await assert.rejects(run(h, request));
    assert.equal(h.previews.length, 0);
    assert.equal(h.writes.length, 0);
  }
  const h = responseHarness({
    mapRead: (envelope, { source }) => {
      if (source.startsWith("query ReviewThread"))
        envelope.data.node.pullRequest = {
          ...envelope.data.node.pullRequest,
          number: 99,
        };
      return envelope;
    },
  });
  await assert.rejects(run(h, await prepare(h)), errorCode("invalid-response"));
  assert.equal(h.writes.length, 0);
});

test("new objections or revision changes after a reply retain its receipt and prevent resolution", async () => {
  for (const change of [
    (state) => {
      state.threads[0].comments = [
        ...state.threads[0].comments,
        comment({ id: "new-objection" }),
      ];
    },
    (state) => {
      state.pr.headRefOid = other;
    },
  ]) {
    const h = responseHarness({ threads: twoThreads(), afterWrite: change });
    const result = await run(h, await prepare(h));
    assert.equal(result.details.status, "stopped");
    assert.equal(result.details.receipts[0].reply.status, "posted");
    assert.equal(result.details.receipts[0].resolution.status, "not-started");
    assert.equal(result.details.receipts[1].reply.status, "not-started");
    assert.equal(h.writes.length, 1);
    assert.equal(result.isError, true);
    assert.equal(result.terminate, true);
  }
});

test("a fresh check immediately before resolution detects intervening discussion", async () => {
  let readsAfterReply = 0;
  const h = responseHarness({
    beforeRead: (state, { source, writes }) => {
      if (
        source.startsWith("query ReviewThread") &&
        writes.length === 1 &&
        ++readsAfterReply === 2
      )
        state.threads[0].comments = [
          ...state.threads[0].comments,
          comment({ id: "between-checks" }),
        ];
    },
  });
  const result = await run(h, await prepare(h));
  assert.equal(result.details.failure.code, "stale-thread");
  assert.equal(h.writes.length, 1);
});

test("transport failures reconcile read-only but never continue to resolution or retry", async () => {
  for (const options of [
    { writeCode: () => 1 },
    { killed: () => true },
    { throwOnWrite: () => true },
    { writeCode: () => 1, skipApply: () => true },
  ]) {
    const h = responseHarness(options);
    const result = await run(h, await prepare(h));
    assert.equal(result.details.status, "stopped");
    assert.equal(h.writes.length, 1);
    assert.equal(result.details.receipts[0].resolution.status, "not-started");
    assert.equal(
      result.details.receipts[0].reply.status,
      options.skipApply ? "accepted-unverified" : "posted",
    );
  }
});

test("malformed, wrong, and GraphQL-error receipts never authorize a later mutation", async () => {
  for (const output of [
    () => "not JSON",
    () => "{}",
    () => JSON.stringify({ errors: [{ message: "denied" }], data: {} }),
    ({ receipt }) =>
      JSON.stringify({
        data: {
          addPullRequestReviewThreadReply: {
            comment: {
              ...receipt.data.addPullRequestReviewThreadReply.comment,
              id: "wrong-id",
            },
          },
        },
      }),
  ]) {
    const h = responseHarness({ writeOutput: output });
    const result = await run(h, await prepare(h));
    assert.equal(result.details.status, "stopped");
    assert.equal(result.details.receipts[0].reply.status, "posted");
    assert.equal(h.writes.length, 1);
  }
});

test("valid receipts without independent readback remain accepted-unverified", async () => {
  for (const failAfter of [1, 2]) {
    const h = responseHarness({
      readFailure: ({ source, writes }) =>
        source.startsWith("query ReviewThread") && writes.length >= failAfter,
    });
    const result = await run(h, await prepare(h));
    assert.equal(result.details.status, "stopped");
    const effect =
      failAfter === 1
        ? result.details.receipts[0].reply
        : result.details.receipts[0].resolution;
    assert.equal(effect.status, "accepted-unverified");
    assert.equal(h.writes.length, failAfter);
  }
});

test("cancellation after submission retains uncertainty and starts no more commands", async () => {
  const h = responseHarness({ abortOnWrite: () => true });
  const result = await run(h, await prepare(h));
  assert.equal(result.details.status, "stopped");
  assert.equal(result.details.receipts[0].reply.status, "accepted-unverified");
  assert.equal(h.calls.at(-1).command, "bash");
  assert.equal(h.writes.length, 1);
});

test("partial multi-thread rounds retain every completed effect and leave later work unstarted", async () => {
  const h = responseHarness({
    threads: [...twoThreads(), thread({ id: "thread-3" })],
    writeCode: ({ writes }) => (writes.length === 3 ? 1 : 0),
  });
  const result = await run(h, await prepare(h));
  assert.equal(result.details.status, "stopped");
  assert.equal(result.details.receipts[0].resolution.status, "resolved");
  assert.equal(result.details.receipts[1].reply.status, "posted");
  assert.equal(result.details.receipts[1].resolution.status, "not-started");
  assert.equal(result.details.receipts[2].reply.status, "not-started");
  assert.equal(h.writes.length, 3);
});

test("resolution failure and post-resolution races report the actual side effect without undoing it", async () => {
  for (const options of [
    { writeCode: ({ write }) => (write.kind === "resolve" ? 1 : 0) },
    {
      writeOutput: ({ write, receipt }) =>
        write.kind === "resolve" ? "{}" : JSON.stringify(receipt),
    },
    {
      afterWrite: (state, { write }) => {
        if (write.kind === "resolve")
          state.threads[0].comments = [
            ...state.threads[0].comments,
            comment({ id: "racing-objection" }),
          ];
      },
    },
  ]) {
    const h = responseHarness(options);
    const result = await run(h, await prepare(h));
    assert.equal(result.details.status, "stopped");
    assert.equal(result.details.receipts[0].reply.status, "posted");
    assert.equal(result.details.receipts[0].resolution.status, "resolved");
    assert.equal(h.state.threads[0].isResolved, true);
    assert.equal(h.writes.length, 2);
  }
});

test("an oversized exact preview fails before showing UI or writing", async () => {
  const h = responseHarness({
    threads: [
      thread({ comments: [comment({ body: "x".repeat(600 * 1024) })] }),
    ],
  });
  const request = {
    ...target,
    headCommit: head,
    baseCommit: base,
    responses: [
      {
        threadId: "thread-1",
        threadVersion: threadVersion(h.state.threads[0]),
        reply: "Response",
        resolve: true,
      },
    ],
  };
  await assert.rejects(run(h, request), errorCode("response-limit"));
  assert.equal(h.previews.length, 0);
  assert.equal(h.writes.length, 0);
});

test("the Bash transport invokes only fixed GraphQL JSON-file submission and validates its invocation", () => {
  const script = fileURLToPath(
    new URL("../scripts/respond-review-thread.sh", import.meta.url),
  );
  const payload = fileURLToPath(new URL("../package.json", import.meta.url));
  const fake = 'gh() { printf "%s\\n" "$@"; }; export -f gh; bash "$@"';
  const result = spawnSync(
    "bash",
    ["-c", fake, "test", script, "enterprise.example", payload],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split("\n"), [
    "api",
    "graphql",
    "--hostname",
    "enterprise.example",
    "--method",
    "POST",
    "--input",
    payload,
  ]);
  for (const args of [[], ["github.com", "/not-a-payload-file"]])
    assert.notEqual(
      spawnSync("bash", [script, ...args], { encoding: "utf8" }).status,
      0,
    );
});

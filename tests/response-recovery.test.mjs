import assert from "node:assert/strict";
import { test } from "node:test";
import { Check } from "typebox/value";
import reviewExtension from "../extensions/review.ts";
import { readFeedback } from "../lib/github-feedback.ts";
import {
  responseHarness,
  prepare,
  run,
  thread,
  comment,
  target,
  other,
  errorCode,
} from "./fixtures/response-harness.mjs";

test("registered feedback works headlessly and both tools return schema-conformant structured data", async () => {
  const h = responseHarness();
  const tools = new Map();
  reviewExtension({
    ...h.pi,
    registerCommand: () => {},
    registerTool: (tool) => tools.set(tool.name, tool),
    sendUserMessage: () => {},
  });
  const readTool = tools.get("github_review_feedback");
  const feedback = await readTool.execute(
    "read",
    target,
    undefined,
    undefined,
    { hasUI: false },
  );
  assert.deepEqual(feedback.structuredContent, feedback.details);
  assert.ok(Check(readTool.outputSchema, feedback.structuredContent));
  const responseTool = tools.get("github_respond_to_review");
  const response = await responseTool.execute(
    "write",
    await prepare(h),
    undefined,
    undefined,
    h.ctx,
  );
  assert.deepEqual(response.structuredContent, response.details);
  assert.ok(Check(responseTool.outputSchema, response.structuredContent));
});

test("a changed authenticated viewer after submission cannot turn another actor's receipt into proof", async () => {
  const h = responseHarness({
    afterWrite: (state) => {
      state.viewer = { login: "another-actor" };
    },
  });
  const result = await run(h, await prepare(h));
  assert.equal(result.details.status, "stopped");
  assert.equal(result.details.receipts[0].reply.status, "accepted-unverified");
  assert.equal(h.writes.length, 1);
});

test("duplicate marked replies after a racing writer stop instead of resolving", async () => {
  const h = responseHarness({
    afterWrite: (state, { write }) => {
      if (write.kind === "reply") {
        const posted = state.threads[0].comments.at(-1);
        state.threads[0].comments = [
          ...state.threads[0].comments,
          { ...posted, id: "racing-duplicate" },
        ];
      }
    },
  });
  const result = await run(h, await prepare(h));
  assert.equal(result.details.status, "stopped");
  assert.equal(result.details.failure.code, "invalid-response");
  assert.equal(h.writes.length, 1);
});

test("unpersisted resolutions with missing versus valid receipts preserve the distinction", async () => {
  for (const invalidReceipt of [true, false]) {
    const h = responseHarness({
      skipApply: ({ write }) => write.kind === "resolve",
      writeOutput: ({ write, receipt }) =>
        write.kind === "resolve" && invalidReceipt
          ? "{}"
          : JSON.stringify(receipt),
    });
    const result = await run(h, await prepare(h));
    assert.equal(result.details.status, "stopped");
    assert.equal(
      result.details.receipts[0].resolution.status,
      invalidReceipt ? "unknown" : "accepted-unverified",
    );
    assert.equal(h.state.threads[0].isResolved, false);
    assert.equal(h.writes.length, 2);
  }
});

test("failure before temporary payload creation is explicitly not-started for either effect", async () => {
  const previous = process.env.TMPDIR;
  try {
    for (const effect of ["reply", "resolve"]) {
      if (previous === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previous;
      const h = responseHarness({
        afterWrite: (_state, { write }) => {
          if (effect === "resolve" && write.kind === "reply")
            process.env.TMPDIR = "/path-that-does-not-exist/pi-response-tests";
        },
      });
      const request = await prepare(h);
      if (effect === "reply")
        process.env.TMPDIR = "/path-that-does-not-exist/pi-response-tests";
      const result = await run(h, request);
      assert.equal(result.details.status, "stopped");
      assert.equal(
        result.details.receipts[0][effect === "reply" ? "reply" : "resolution"]
          .status,
        "not-started",
      );
      assert.equal(h.writes.length, effect === "reply" ? 0 : 1);
    }
  } finally {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
  }
});

test("a later thread drifting after an earlier resolution retains the earlier receipts", async () => {
  const h = responseHarness({
    threads: [thread(), thread({ id: "two" })],
    afterWrite: (state, { write }) => {
      if (write.kind === "resolve")
        state.threads[1].comments = [
          ...state.threads[1].comments,
          comment({ id: "later-objection" }),
        ];
    },
  });
  const result = await run(h, await prepare(h));
  assert.equal(result.details.status, "stopped");
  assert.equal(result.details.receipts[0].resolution.status, "resolved");
  assert.equal(result.details.receipts[1].reply.status, "not-started");
  assert.equal(h.writes.length, 2);
});

test("a wrong thread node, failed editor, or final retrieval drift is never published", async () => {
  const wrong = responseHarness({
    mapRead: (envelope, { source }) => {
      if (source.startsWith("query ReviewThread"))
        envelope.data.node.id = "other-node";
      return envelope;
    },
  });
  await assert.rejects(
    run(wrong, await prepare(wrong)),
    errorCode("invalid-response"),
  );
  assert.equal(wrong.writes.length, 0);
  const editor = responseHarness();
  editor.ctx.ui.editor = async () => {
    throw new Error("UI lost");
  };
  await assert.rejects(run(editor, await prepare(editor)), /UI lost/);
  assert.equal(editor.writes.length, 0);
  let contexts = 0;
  const drift = responseHarness({
    beforeRead: (state, { source }) => {
      if (source.startsWith("query ResponseContext") && ++contexts === 2)
        state.pr.baseRefOid = other;
    },
  });
  await assert.rejects(
    readFeedback(drift.pi, target, drift.controller.signal),
    errorCode("stale-review"),
  );
});

test("a killed or throwing read is a blocker, never empty complete feedback", async () => {
  for (const exec of [
    async () => ({ code: 0, killed: true, stdout: "{}", stderr: "" }),
    async () => {
      throw new Error("read interrupted");
    },
  ])
    await assert.rejects(
      readFeedback({ exec }, target, new AbortController().signal),
    );
});

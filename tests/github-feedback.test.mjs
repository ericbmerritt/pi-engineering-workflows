import assert from "node:assert/strict";
import { test } from "node:test";
import { collectNodes, readFeedback } from "../lib/github-feedback.ts";
import { connection, threadVersion } from "../lib/feedback-model.ts";
import {
  responseHarness,
  comment,
  thread,
  target,
  other,
  errorCode,
} from "./fixtures/response-harness.mjs";

const read = (h) => readFeedback(h.pi, target, h.controller.signal);
const review = (id) => ({
  id,
  body: "Review summary",
  url: `https://github.com/example/project/pull/42#${id}`,
  state: "COMMENTED",
  submittedAt: null,
  author: null,
  commit: null,
});
const discussion = (id) => ({
  id,
  body: "Discussion",
  url: `https://github.com/example/project/pull/42#${id}`,
  updatedAt: "2026-01-01T00:00:00Z",
  author: null,
});

test("feedback paginates every channel and each thread's comments independently", async () => {
  const h = responseHarness({
    pageSize: 1,
    commentPageSize: 1,
    threads: [
      thread({
        comments: [
          comment(),
          comment({ id: "comment-2", replyTo: { id: "comment-1" } }),
        ],
      }),
      thread({ id: "thread-2" }),
    ],
    reviews: [review("review-1"), review("review-2")],
    discussion: [discussion("general-1"), discussion("general-2")],
  });
  const result = await read(h);
  assert.equal(result.complete, true);
  assert.equal(result.threads.length, 2);
  assert.equal(result.threads[0].comments.length, 2);
  assert.equal(result.threads[0].version, threadVersion(result.threads[0]));
  assert.equal(result.reviews.length, 2);
  assert.equal(result.discussion.length, 2);
  assert.ok(
    h.calls.some((call) =>
      call.args.some((arg) => arg.includes("query ReviewThread")),
    ),
  );
  assert.equal(h.writes.length, 0);
});

test("empty feedback is complete, but closed state is preserved rather than called open", async () => {
  const h = responseHarness({ threads: [] });
  h.state.pr.state = "CLOSED";
  const result = await read(h);
  assert.equal(result.context.pr.state, "CLOSED");
  assert.deepEqual(result.threads, []);
  assert.deepEqual(result.reviews, []);
  assert.deepEqual(result.discussion, []);
});

test("partial GraphQL errors, invalid JSON, missing fields, and access failures fail closed", async () => {
  for (const options of [
    { mapRead: (value) => ({ ...value, errors: [{ message: "denied" }] }) },
    { mapRead: () => "not JSON" },
    { mapRead: () => ({ data: null }) },
    {
      mapRead: () => ({
        data: {
          viewer: { login: "author" },
          repository: { pullRequest: null },
        },
      }),
    },
    { readFailure: () => true },
    { threads: [thread({ viewerCanResolve: undefined })] },
    { threads: [thread({ comments: [comment({ state: "UNKNOWN" })] })] },
  ]) {
    const h = responseHarness(options);
    await assert.rejects(read(h), (error) => error.name === "ReviewError");
    assert.equal(h.writes.length, 0);
  }
});

test("wrong PR identity and head/base/viewer drift during retrieval are not accepted", async () => {
  const wrong = responseHarness();
  wrong.state.pr.repository.nameWithOwner = "other/project";
  await assert.rejects(read(wrong), errorCode("invalid-response"));
  for (const field of ["headRefOid", "baseRefOid", "viewer"]) {
    const h = responseHarness({
      beforeRead: (state, { source }) => {
        if (source.startsWith("query FeedbackReviews")) {
          if (field === "viewer") state.viewer = { login: "other" };
          else state.pr[field] = other;
        }
      },
    });
    await assert.rejects(read(h), errorCode("stale-review"));
  }
});

test("nested pagination rejects changes to thread metadata and connection totals", async () => {
  for (const mutation of [
    (item) => {
      item.isOutdated = true;
    },
    (item) => {
      item.comments = [...item.comments, comment({ id: "late" })];
    },
  ]) {
    const h = responseHarness({
      commentPageSize: 1,
      threads: [thread({ comments: [comment(), comment({ id: "two" })] })],
      beforeRead: (state, { source, fields }) => {
        if (source.startsWith("query ReviewThread") && fields.cursor)
          mutation(state.threads[0]);
      },
    });
    await assert.rejects(read(h), errorCode("stale-thread"));
  }
});

test("incomplete, duplicate, null, and looping connection pages are rejected", async () => {
  for (const transform of [
    (value) => ({ ...value, nodes: [] }),
    (value) => ({ ...value, nodes: [null] }),
    (value) => ({
      ...value,
      nodes: [value.nodes[0], value.nodes[0]],
      totalCount: 2,
      pageInfo: { hasNextPage: false, endCursor: "2" },
    }),
    (value) => ({ ...value, pageInfo: { hasNextPage: true, endCursor: null } }),
    (value) => ({
      ...value,
      nodes: [],
      pageInfo: { hasNextPage: true, endCursor: "same" },
    }),
  ]) {
    const h = responseHarness({
      mapRead: (envelope, { source }) => {
        if (source.startsWith("query FeedbackThreads"))
          envelope.data.repository.pullRequest.reviewThreads = transform(
            envelope.data.repository.pullRequest.reviewThreads,
          );
        return envelope;
      },
    });
    await assert.rejects(read(h), errorCode("invalid-response"));
  }
  assert.throws(
    () =>
      connection(
        {
          totalCount: 0,
          nodes: ["extra"],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
        (value) => value,
      ),
    errorCode("invalid-response"),
  );
});

test("pagination, output, aggregate byte, and request budgets prevent unbounded reads", async () => {
  await assert.rejects(
    collectNodes(async (cursor) => {
      const n = Number(cursor ?? 0);
      return {
        totalCount: 100,
        nodes: [{ id: String(n) }],
        pageInfo: { hasNextPage: true, endCursor: String(n + 1) },
      };
    }),
    errorCode("response-limit"),
  );
  for (const size of [600 * 1024, 5 * 1024 * 1024]) {
    const h = responseHarness({
      threads: [thread({ comments: [comment({ body: "x".repeat(size) })] })],
    });
    await assert.rejects(read(h), errorCode("response-limit"));
  }
  const h = responseHarness({
    commentPageSize: 1,
    threads: Array.from({ length: 10 }, (_, index) =>
      thread({
        id: `thread-${index}`,
        comments: Array.from({ length: 40 }, (_, n) =>
          comment({ id: `comment-${index}-${n}` }),
        ),
      }),
    ),
  });
  await assert.rejects(read(h), errorCode("response-limit"));
  assert.equal(h.calls.length, 300);
});

test("invalid target data and an already-aborted read never execute a command", async () => {
  const h = responseHarness();
  for (const request of [
    { ...target, hostname: "https://bad" },
    { ...target, repository: "$(bad)" },
    { ...target, pullRequest: 0 },
  ])
    await assert.rejects(readFeedback(h.pi, request, h.controller.signal));
  h.controller.abort();
  await assert.rejects(read(h), { name: "AbortError" });
  assert.equal(h.calls.length, 0);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkThread,
  graphqlData,
  threadVersion,
} from "../lib/feedback-model.ts";
import {
  matchingReply,
  normalizeResponse,
  planResponse,
  replyBody,
  replyPayload,
  replyReceipt,
  resolutionReceipt,
  resolvePayload,
  selectedReply,
} from "../lib/response-batch.ts";
import {
  head,
  base,
  target,
  thread,
  comment,
  errorCode,
} from "./fixtures/response-harness.mjs";

const item = thread();
const action = {
  threadId: item.id,
  threadVersion: threadVersion(item),
  reply: "Fixed the actual defect.",
  resolve: true,
};
const input = {
  ...target,
  headCommit: head,
  baseCommit: base,
  responses: [action],
};
const normalized = normalizeResponse(input, "unused");
const body = replyBody(normalized, action, "author");
const ownReply = comment({
  id: "own",
  body,
  viewerDidAuthor: true,
  author: { login: "author" },
  replyTo: { id: "comment-1" },
});

test("conversation versions are stable across object key order but bind every meaningful field", () => {
  assert.equal(
    threadVersion(Object.fromEntries(Object.entries(item).reverse())),
    threadVersion(item),
  );
  for (const changed of [
    { ...item, isResolved: true },
    { ...item, isOutdated: true },
    { ...item, viewerCanReply: false },
    { ...item, path: "other" },
    { ...item, line: null },
    { ...item, comments: [comment({ body: "edited" })] },
    { ...item, comments: [comment({ updatedAt: "changed" })] },
    { ...item, comments: [comment({ author: null })] },
    { ...item, comments: [comment({ originalCommit: { oid: base } })] },
    { ...item, comments: [...item.comments, ownReply] },
  ])
    assert.throws(
      () => checkThread(changed, action.threadVersion),
      errorCode("stale-thread"),
    );
});

test("response schema rejects ambiguous, empty, duplicate, oversized, and injected proposals", () => {
  for (const responses of [
    [],
    [action, action],
    Array.from({ length: 21 }, (_, index) => ({
      ...action,
      threadId: `thread-${index}`,
    })),
    [{ ...action, reply: " " }],
    [{ ...action, reply: undefined }],
    [{ ...action, existingReplyId: "own" }],
    [{ ...action, reply: "x".repeat(4001) }],
    [{ ...action, reply: undefined, existingReplyId: "own", resolve: false }],
    [{ ...action, threadVersion: "old" }],
    [{ ...action, query: "mutation Evil {}" }],
  ])
    assert.throws(
      () => normalizeResponse({ ...input, responses }, "github.com"),
      errorCode("invalid-batch"),
    );
  for (const hostname of ["https://github.com", "--hostname=evil", "$(bad)"])
    assert.throws(
      () => normalizeResponse({ ...input, hostname }, "github.com"),
      errorCode("invalid-batch"),
    );
  assert.equal(
    normalizeResponse({ ...input, hostname: undefined }, "enterprise.example")
      .hostname,
    "enterprise.example",
  );
  assert.equal(
    normalizeResponse(
      {
        ...input,
        repository: "Example/Project",
        headCommit: head.toUpperCase(),
      },
      "unused",
    ).repository,
    target.repository,
  );
});

test("per-reply markers survive refreshed conversation versions but bind actor, target, revisions and text", () => {
  assert.equal(
    replyBody(
      normalized,
      { ...action, threadVersion: "d".repeat(64) },
      "AUTHOR",
    ),
    body,
  );
  for (const [request, entry, viewer] of [
    [{ ...normalized, baseCommit: head }, action, "author"],
    [{ ...normalized, headCommit: base }, action, "author"],
    [{ ...normalized, pullRequest: 43 }, action, "author"],
    [normalized, { ...action, reply: "different" }, "author"],
    [normalized, { ...action, threadId: "other" }, "author"],
    [normalized, action, "other"],
  ])
    assert.notEqual(replyBody(request, entry, viewer), body);
  assert.throws(
    () => replyBody(normalized, { ...action, reply: undefined }, "author"),
    errorCode("invalid-batch"),
  );
});

test("duplicate detection requires exact text, authenticated authorship, and a published reply", () => {
  const replied = { ...item, comments: [...item.comments, ownReply] };
  assert.equal(matchingReply(replied, body, "author").id, "own");
  for (const overrides of [
    { viewerDidAuthor: false },
    { author: { login: "other" } },
    { state: "PENDING" },
    { body: `${body} edited` },
    { replyTo: null },
  ])
    assert.equal(
      matchingReply(
        { ...item, comments: [{ ...ownReply, ...overrides }] },
        body,
        "author",
      ),
      undefined,
    );
  assert.throws(
    () =>
      matchingReply(
        { ...item, comments: [ownReply, { ...ownReply, id: "second" }] },
        body,
        "author",
      ),
    errorCode("invalid-response"),
  );
  assert.throws(
    () => selectedReply(item, "comment-1"),
    errorCode("invalid-batch"),
  );
});

test("planning requires permissions unless the exact reply or resolution already exists", () => {
  for (const changes of [
    { viewerCanReply: false },
    { viewerCanResolve: false },
  ]) {
    const changed = { ...item, ...changes };
    assert.throws(
      () =>
        planResponse(
          normalized,
          { ...action, threadVersion: threadVersion(changed) },
          changed,
          "author",
        ),
      errorCode("thread-permission"),
    );
  }
  const replied = {
    ...item,
    comments: [...item.comments, ownReply],
    viewerCanReply: false,
    viewerCanResolve: false,
    isResolved: true,
  };
  const planned = planResponse(
    normalized,
    { ...action, threadVersion: threadVersion(replied) },
    replied,
    "author",
  );
  assert.equal(planned.existing.id, ownReply.id);
});

test("fixed GraphQL payloads use documented input types and preserve literal reply text", () => {
  const literal = 'Text with "quotes",\n$(not-a-command), and Unicode café';
  const payload = JSON.parse(JSON.stringify(replyPayload(item.id, literal)));
  assert.match(payload.query, /\$input: AddPullRequestReviewThreadReplyInput!/);
  assert.equal(payload.variables.input.pullRequestReviewThreadId, item.id);
  assert.equal(payload.variables.input.body, literal);
  assert.equal(typeof payload.variables.input.clientMutationId, "string");
  assert.match(
    resolvePayload(item).query,
    /\$input: ResolveReviewThreadInput!/,
  );
  assert.equal(resolvePayload(item).variables.input.threadId, item.id);
  assert.throws(
    () => replyReceipt({ id: "bad" }, body),
    errorCode("invalid-response"),
  );
  assert.throws(
    () =>
      replyReceipt(
        {
          id: "own",
          body: "wrong",
          url: "url",
          state: "SUBMITTED",
          viewerDidAuthor: true,
        },
        body,
      ),
    errorCode("invalid-response"),
  );
  assert.throws(
    () => resolutionReceipt({ id: "other", isResolved: true }, item.id),
    errorCode("invalid-response"),
  );
  assert.throws(
    () => graphqlData('{"errors":{},"data":{}}'),
    errorCode("preflight-failed"),
  );
  assert.deepEqual(graphqlData('{"errors":[],"data":{}}'), {});
});

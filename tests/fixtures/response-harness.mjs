import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { readFeedback } from "../../lib/github-feedback.ts";
import { respondToReview } from "../../lib/github-respond.ts";

export const head = "a".repeat(40);
export const base = "b".repeat(40);
export const other = "c".repeat(40);
export const target = {
  hostname: "github.com",
  repository: "example/project",
  pullRequest: 42,
};
export function comment(overrides = {}) {
  return {
    id: "comment-1",
    body: "Please preserve the failure status.",
    url: "https://github.com/example/project/pull/42#discussion_r1",
    updatedAt: "2026-01-01T00:00:00Z",
    state: "SUBMITTED",
    viewerDidAuthor: false,
    commit: { oid: head },
    originalCommit: { oid: head },
    author: { login: "reviewer" },
    replyTo: null,
    ...overrides,
  };
}
export function thread(overrides = {}) {
  return {
    id: "thread-1",
    path: "a.txt",
    line: 2,
    originalLine: 2,
    isResolved: false,
    isOutdated: false,
    viewerCanReply: true,
    viewerCanResolve: true,
    comments: [comment()],
    ...overrides,
  };
}
export function page(nodes, cursor, size = 100) {
  const start = cursor ? Number(cursor) : 0;
  const selected = nodes.slice(start, start + size);
  const end = start + selected.length;
  return {
    totalCount: nodes.length,
    nodes: selected,
    pageInfo: {
      hasNextPage: end < nodes.length,
      endCursor: selected.length ? String(end) : null,
    },
  };
}

export function responseHarness(options = {}) {
  const state = {
    viewer: { login: "author" },
    pr: {
      id: "pr-42",
      number: 42,
      url: "https://github.com/example/project/pull/42",
      state: "OPEN",
      headRefOid: head,
      baseRefOid: base,
      headRefName: "feature",
      baseRefName: "main",
      repository: { nameWithOwner: "example/project" },
    },
    threads: options.threads ?? [thread()],
    reviews: options.reviews ?? [],
    discussion: options.discussion ?? [],
  };
  const calls = [];
  const writes = [];
  const previews = [];
  const confirmations = [];
  const controller = new AbortController();
  const wireThread = (item, cursor) => ({
    ...item,
    comments: page(item.comments, cursor, options.commentPageSize),
  });
  const pi = {
    exec: async (command, args, execOptions) => {
      const call = { command, args, execOptions };
      calls.push(call);
      if (command === "gh") {
        assert.equal(args[0], "api");
        assert.equal(args[1], "graphql");
        assert.equal(
          args[args.indexOf("--hostname") + 1],
          options.hostname ?? "github.com",
        );
        const fields = Object.fromEntries(
          args
            .filter((arg) => arg.includes("="))
            .map((arg) => {
              const at = arg.indexOf("=");
              return [arg.slice(0, at), arg.slice(at + 1)];
            }),
        );
        const source = fields.query.trim();
        assert.ok(
          source.startsWith("query "),
          "direct gh calls must be read-only queries",
        );
        options.beforeRead?.(state, { source, fields, writes, calls });
        if (options.readFailure?.({ source, fields, writes, calls }))
          return {
            code: 1,
            killed: false,
            stdout: "",
            stderr: "simulated access failure",
          };
        let data;
        if (source.startsWith("query ReviewThread")) {
          const found = state.threads.find((item) => item.id === fields.id);
          data = {
            viewer: state.viewer,
            node: found
              ? {
                  ...wireThread(found, fields.cursor),
                  pullRequest: state.pr,
                }
              : null,
          };
        } else {
          assert.equal(fields.owner, "example");
          assert.equal(fields.name, "project");
          assert.equal(fields.number, "42");
          const selection = source.startsWith("query FeedbackThreads")
            ? {
                reviewThreads: page(
                  state.threads.map((item) => wireThread(item)),
                  fields.cursor,
                  options.pageSize,
                ),
              }
            : source.startsWith("query FeedbackReviews")
              ? {
                  reviews: page(state.reviews, fields.cursor, options.pageSize),
                }
              : source.startsWith("query FeedbackDiscussion")
                ? {
                    comments: page(
                      state.discussion,
                      fields.cursor,
                      options.pageSize,
                    ),
                  }
                : {};
          data = {
            viewer: state.viewer,
            repository: { pullRequest: { ...state.pr, ...selection } },
          };
        }
        const envelope = options.mapRead?.(
          { data },
          { source, fields, writes, calls },
        ) ?? { data };
        return {
          code: 0,
          killed: false,
          stdout:
            typeof envelope === "string" ? envelope : JSON.stringify(envelope),
          stderr: "",
        };
      }
      assert.equal(command, "bash");
      assert.ok(args[0].endsWith("scripts/respond-review-thread.sh"));
      const payload = JSON.parse(await readFile(args[2], "utf8"));
      const mode = (await stat(args[2])).mode & 0o777;
      const kind = payload.query.includes("mutation ReplyToReviewThread")
        ? "reply"
        : "resolve";
      assert.ok(
        kind === "reply" ||
          payload.query.includes("mutation ResolveReviewThread"),
      );
      const write = { args, payload, mode, kind };
      writes.push(write);
      options.beforeWrite?.(state, { writes, write });
      const input = payload.variables.input;
      const id = input.pullRequestReviewThreadId ?? input.threadId;
      const found = state.threads.find((item) => item.id === id);
      assert.ok(found);
      let receipt;
      if (kind === "reply") {
        const added = comment({
          id: `reply-${writes.length}`,
          body: input.body,
          viewerDidAuthor: true,
          author: { ...state.viewer },
          replyTo: { id: found.comments[0].id },
          url: `${state.pr.url}#discussion_reply-${writes.length}`,
        });
        if (!options.skipApply?.({ writes, write }))
          found.comments = [...found.comments, added];
        receipt = {
          data: { addPullRequestReviewThreadReply: { comment: added } },
        };
      } else {
        if (!options.skipApply?.({ writes, write })) found.isResolved = true;
        receipt = {
          data: { resolveReviewThread: { thread: { id, isResolved: true } } },
        };
      }
      options.afterWrite?.(state, { writes, write, receipt });
      if (options.abortOnWrite?.({ writes, write })) controller.abort();
      if (options.throwOnWrite?.({ writes, write }))
        throw new Error("simulated interruption");
      const output =
        options.writeOutput?.({ writes, write, receipt }) ??
        JSON.stringify(receipt);
      return {
        code: options.writeCode?.({ writes, write }) ?? 0,
        killed: options.killed?.({ writes, write }) ?? false,
        stdout: output,
        stderr: "simulated transport diagnostic",
      };
    },
  };
  const ctx = {
    hasUI: options.hasUI ?? true,
    ui: {
      editor: async (_title, preview) => {
        previews.push(preview);
        options.onPreview?.(state, { writes, calls, controller });
        return options.cancelPreview
          ? undefined
          : options.editPreview
            ? `${preview}\nchanged`
            : preview;
      },
      confirm: async (_title, preview) => {
        confirmations.push(preview);
        options.onConfirm?.(state, { writes, calls, controller });
        return options.approve ?? true;
      },
    },
  };
  return {
    state,
    pi,
    ctx,
    calls,
    writes,
    previews,
    confirmations,
    controller,
    hostname: options.hostname ?? target.hostname,
  };
}
export async function prepare(h, actions = {}) {
  const feedback = await readFeedback(
    h.pi,
    { ...target, hostname: h.hostname ?? target.hostname },
    h.controller.signal,
  );
  return {
    ...target,
    hostname: h.hostname,
    headCommit: feedback.context.pr.headRefOid,
    baseCommit: feedback.context.pr.baseRefOid,
    responses: feedback.threads.map((item) => ({
      threadId: item.id,
      threadVersion: item.version,
      reply: "Preserved failure status and verified the published fix.",
      resolve: true,
      ...actions,
    })),
  };
}
export const run = (h, request) =>
  respondToReview(h.pi, request, h.controller.signal, h.ctx);
export const errorCode = (code) => (error) =>
  error.name === "ReviewError" && error.code === code;

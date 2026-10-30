import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  checked,
  checkContext,
  connection,
  ContextSchema,
  type Connection,
  type FeedbackContext,
  type FeedbackThread,
  CommentSchema,
  DiscussionSchema,
  parseContext,
  ReviewSummarySchema,
  ThreadSchema,
  threadMetadata,
  threadVersion,
  graphqlData,
} from "./feedback-model.ts";
import {
  normalizeTarget,
  record,
  type ReviewTarget,
  ReviewTargetSchema,
} from "./review-batch.ts";
import { ReviewError } from "./review-error.ts";
import {
  contextQuery,
  discussionQuery,
  reviewsQuery,
  threadQuery,
  threadsQuery,
} from "./response-queries.ts";

const threadHeader = Type.Omit(ThreadSchema, ["comments"]);
export const feedbackLimits = {
  requests: 300,
  bytes: 4 * 1024 * 1024,
  pages: 50,
  outputBytes: 512 * 1024,
} as const;
export const FeedbackOutputSchema = Type.Object({
  target: Type.Required(ReviewTargetSchema),
  context: ContextSchema,
  threads: Type.Array(
    Type.Object({
      ...ThreadSchema.properties,
      version: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    }),
  ),
  reviews: Type.Array(ReviewSummarySchema),
  discussion: Type.Array(DiscussionSchema),
  complete: Type.Literal(true),
});
export type Target = ReviewTarget & { readonly hostname: string };
export type ThreadObservation = {
  readonly context: FeedbackContext;
  readonly thread: FeedbackThread;
};

export async function collectNodes<T extends { id: string }>(
  load: (cursor?: string) => Promise<Connection<T>>,
): Promise<T[]> {
  let nodes: T[] = [];
  let cursors: string[] = [];
  let total: number | undefined;
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < feedbackLimits.pages; pageIndex++) {
    const page = await load(cursor);
    if (total !== undefined && total !== page.totalCount)
      throw new ReviewError(
        "stale-thread",
        "GitHub connection changed during pagination.",
      );
    total = page.totalCount;
    nodes = [...nodes, ...page.nodes];
    if (
      nodes.length > total ||
      new Set(nodes.map((node) => node.id)).size !== nodes.length
    )
      throw new ReviewError(
        "invalid-response",
        "Duplicate or inconsistent GitHub connection nodes.",
      );
    if (!page.pageInfo.hasNextPage) {
      if (nodes.length !== total)
        throw new ReviewError(
          "invalid-response",
          "Incomplete GitHub connection; refusing partial feedback.",
        );
      return nodes;
    }
    const next = page.pageInfo.endCursor;
    if (!next || cursors.includes(next))
      throw new ReviewError(
        "invalid-response",
        "GitHub pagination cursor did not advance.",
      );
    cursor = next;
    cursors = [...cursors, next];
  }
  throw new ReviewError(
    "response-limit",
    "GitHub pagination exceeds the response budget. Use a manual handoff.",
  );
}

export function createFeedbackReader(
  pi: Pick<ExtensionAPI, "exec">,
  target: Target,
  signal: AbortSignal,
) {
  let requests = 0;
  let bytes = 0;
  const query = async (
    source: string,
    variables: Readonly<Record<string, string | number>>,
  ) => {
    signal.throwIfAborted();
    if (++requests > feedbackLimits.requests)
      throw new ReviewError(
        "response-limit",
        "GitHub request budget exhausted; no further operation attempted.",
      );
    const args = [
      "api",
      "graphql",
      "--hostname",
      target.hostname,
      "--method",
      "POST",
      "-f",
      `query=${source}`,
      ...Object.entries(variables).flatMap(([key, value]) => [
        typeof value === "number" ? "-F" : "-f",
        `${key}=${value}`,
      ]),
    ];
    const response = await pi.exec("gh", args, { signal, timeout: 30000 });
    signal.throwIfAborted();
    bytes += Buffer.byteLength(response.stdout);
    if (bytes > feedbackLimits.bytes)
      throw new ReviewError(
        "response-limit",
        "GitHub feedback exceeds the response byte budget. Use a manual handoff.",
      );
    if (response.code !== 0 || response.killed)
      throw new ReviewError(
        "preflight-failed",
        "GitHub feedback query failed or timed out. Check host permissions and compatibility.",
      );
    return graphqlData(response.stdout);
  };
  const variables = {
    owner: target.repository.split("/")[0],
    name: target.repository.split("/")[1],
    number: target.pullRequest,
  };
  const prPage = async (source: string, cursor?: string) => {
    const data = await query(source, {
      ...variables,
      ...(cursor ? { cursor } : {}),
    });
    const pr = record(record(data.repository).pullRequest);
    return { pr, context: parseContext(data.viewer, pr, target) };
  };
  const context = async (): Promise<FeedbackContext> =>
    (await prPage(contextQuery)).context;

  const rawThread = (value: unknown) => {
    const raw = record(value);
    return {
      ...threadMetadata(checked(threadHeader, raw)),
      comments: connection(raw.comments, (node) =>
        checked(CommentSchema, node),
      ),
    };
  };
  const threadPage = async (id: string, cursor?: string) => {
    const data = await query(threadQuery, {
      id,
      ...(cursor ? { cursor } : {}),
    });
    const raw = record(data.node);
    const observed = rawThread(raw);
    if (observed.id !== id)
      throw new ReviewError(
        "invalid-response",
        "GitHub returned a different review thread.",
      );
    return {
      ...observed,
      context: parseContext(data.viewer, raw.pullRequest, target),
    };
  };
  const finishThread = async (
    first: ReturnType<typeof rawThread>,
    initial: FeedbackContext,
  ): Promise<FeedbackThread> => {
    const comments = await collectNodes(async (cursor) => {
      if (!cursor) return first.comments;
      const page = await threadPage(first.id, cursor);
      checkContext(page.context, initial);
      if (
        JSON.stringify(threadMetadata(page)) !==
        JSON.stringify(threadMetadata(first))
      )
        throw new ReviewError(
          "stale-thread",
          "Thread metadata changed during comment pagination.",
        );
      return page.comments;
    });
    return checked(ThreadSchema, { ...threadMetadata(first), comments });
  };
  const thread = async (id: string): Promise<ThreadObservation> => {
    const first = await threadPage(id);
    return {
      context: first.context,
      thread: await finishThread(first, first.context),
    };
  };
  const feedback = async () => {
    const initial = await context();
    const threads = await collectNodes(async (cursor) => {
      const page = await prPage(threadsQuery, cursor);
      checkContext(page.context, initial);
      const raw = connection(page.pr.reviewThreads, rawThread);
      let nodes: (FeedbackThread & { version: string })[] = [];
      for (const item of raw.nodes) {
        const complete = await finishThread(item, initial);
        nodes = [...nodes, { ...complete, version: threadVersion(complete) }];
      }
      return { ...raw, nodes };
    });
    const channel = async <T extends { id: string }>(
      source: string,
      field: string,
      parse: (node: unknown) => T,
    ) =>
      collectNodes(async (cursor) => {
        const page = await prPage(source, cursor);
        checkContext(page.context, initial);
        return connection(page.pr[field], parse);
      });
    const reviews = await channel(reviewsQuery, "reviews", (node) =>
      checked(ReviewSummarySchema, node),
    );
    const discussion = await channel(discussionQuery, "comments", (node) =>
      checked(DiscussionSchema, node),
    );
    checkContext(await context(), initial);
    const result = {
      target,
      context: initial,
      threads,
      reviews,
      discussion,
      complete: true as const,
    };
    if (
      Buffer.byteLength(JSON.stringify(result, null, 2)) >
      feedbackLimits.outputBytes
    )
      throw new ReviewError(
        "response-limit",
        "Complete feedback is too large for this tool. Use an approved scoped integration or manual handoff.",
      );
    return result;
  };
  return { context, thread, feedback };
}
export type FeedbackReader = ReturnType<typeof createFeedbackReader>;

export async function readFeedback(
  pi: Pick<ExtensionAPI, "exec">,
  request: ReviewTarget,
  signal: AbortSignal,
) {
  checked(ReviewTargetSchema, request);
  const target = normalizeTarget(request, process.env.GH_HOST || "github.com");
  return createFeedbackReader(pi, target, signal).feedback();
}

export function registerGitHubFeedback(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "github_review_feedback",
    label: "Read GitHub review feedback",
    description:
      "Read complete bounded PR feedback through authenticated gh: threads with all replies, reviews, and discussion. Returns head/base SHAs and per-thread versions for github_respond_to_review. Never writes GitHub state; fails rather than silently truncating pagination.",
    parameters: ReviewTargetSchema,
    outputSchema: FeedbackOutputSchema,
    executionMode: "sequential",
    async execute(_id, params, signal) {
      const feedback = await readFeedback(
        pi,
        params,
        signal ?? new AbortController().signal,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(feedback, null, 2) }],
        details: feedback,
        structuredContent: feedback,
      };
    },
  });
}

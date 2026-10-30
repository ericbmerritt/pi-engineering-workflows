import { createHash } from "node:crypto";
import { type Static, type TSchema, Type } from "typebox";
import { Check } from "typebox/value";
import { record, ReviewSchema, type ReviewTarget } from "./review-batch.ts";
import {
  parseJson,
  ReviewError,
  type ReviewErrorCode,
} from "./review-error.ts";

const id = Type.String({ minLength: 1, maxLength: 256 });
const text = Type.String();
const commit = Type.Union([
  Type.Object({ oid: ReviewSchema.properties.reviewedCommit }),
  Type.Null(),
]);
const actor = Type.Union([
  Type.Object({ login: Type.String({ minLength: 1 }) }),
  Type.Null(),
]);
export const CommentSchema = Type.Object({
  id,
  body: text,
  url: Type.String({ minLength: 1 }),
  updatedAt: Type.String({ minLength: 1 }),
  state: Type.Union([Type.Literal("PENDING"), Type.Literal("SUBMITTED")]),
  viewerDidAuthor: Type.Boolean(),
  commit,
  originalCommit: commit,
  author: actor,
  replyTo: Type.Union([Type.Object({ id }), Type.Null()]),
});
export type FeedbackComment = Static<typeof CommentSchema>;

export const ThreadSchema = Type.Object({
  id,
  path: Type.String({ minLength: 1 }),
  line: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  originalLine: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  isResolved: Type.Boolean(),
  isOutdated: Type.Boolean(),
  viewerCanReply: Type.Boolean(),
  viewerCanResolve: Type.Boolean(),
  comments: Type.Array(CommentSchema, { minItems: 1 }),
});
export type FeedbackThread = Static<typeof ThreadSchema>;

export const ContextSchema = Type.Object({
  viewer: Type.Object({ login: Type.String({ minLength: 1 }) }),
  pr: Type.Object({
    id,
    number: Type.Integer({ minimum: 1 }),
    url: Type.String({ minLength: 1 }),
    state: Type.Union([
      Type.Literal("OPEN"),
      Type.Literal("CLOSED"),
      Type.Literal("MERGED"),
    ]),
    headRefOid: ReviewSchema.properties.reviewedCommit,
    baseRefOid: ReviewSchema.properties.reviewedCommit,
    headRefName: Type.String({ minLength: 1 }),
    baseRefName: Type.String({ minLength: 1 }),
    repository: Type.Object({ nameWithOwner: Type.String({ minLength: 1 }) }),
  }),
});
export type FeedbackContext = Static<typeof ContextSchema>;

export const ReviewSummarySchema = Type.Object({
  id,
  body: text,
  url: Type.String({ minLength: 1 }),
  state: Type.String({ minLength: 1 }),
  submittedAt: Type.Union([Type.String(), Type.Null()]),
  author: actor,
  commit,
});
export const DiscussionSchema = Type.Object({
  id,
  body: text,
  url: Type.String({ minLength: 1 }),
  updatedAt: Type.String({ minLength: 1 }),
  author: actor,
});
const ConnectionSchema = Type.Object({
  totalCount: Type.Integer({ minimum: 0 }),
  nodes: Type.Array(Type.Unknown(), { maxItems: 100 }),
  pageInfo: Type.Object({
    hasNextPage: Type.Boolean(),
    endCursor: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  }),
});
export type Connection<T> = Omit<Static<typeof ConnectionSchema>, "nodes"> & {
  readonly nodes: readonly T[];
};

export function checked<T extends TSchema>(
  schema: T,
  value: unknown,
  code: ReviewErrorCode = "invalid-response",
): Static<T> {
  if (!Check(schema, value))
    throw new ReviewError(
      code,
      code === "invalid-batch"
        ? "Invalid review response request."
        : "Unexpected GitHub response shape.",
    );
  return value;
}

export function graphqlData(output: string): Record<string, unknown> {
  const envelope = record(parseJson(output));
  if (
    envelope.errors !== undefined &&
    (!Array.isArray(envelope.errors) || envelope.errors.length !== 0)
  )
    throw new ReviewError(
      "preflight-failed",
      "GitHub returned GraphQL errors; incomplete data was rejected.",
    );
  return record(envelope.data);
}

export function connection<T>(
  value: unknown,
  parse: (node: unknown) => T,
): Connection<T> {
  const page = checked(ConnectionSchema, value);
  if (
    page.nodes.length > page.totalCount ||
    (page.pageInfo.hasNextPage && !page.pageInfo.endCursor)
  )
    throw new ReviewError(
      "invalid-response",
      "Invalid GitHub pagination metadata.",
    );
  return { ...page, nodes: page.nodes.map(parse) };
}

export function parseContext(
  viewer: unknown,
  pr: unknown,
  target: ReviewTarget,
): FeedbackContext {
  const context = checked(ContextSchema, { viewer, pr });
  if (
    context.pr.number !== target.pullRequest ||
    context.pr.repository.nameWithOwner.toLowerCase() !==
      target.repository.toLowerCase()
  )
    throw new ReviewError(
      "invalid-response",
      "GitHub returned a different PR destination.",
    );
  return context;
}

export function contextIdentity(context: FeedbackContext): string {
  const { pr, viewer } = context;
  return JSON.stringify([
    viewer.login.toLowerCase(),
    pr.id,
    pr.number,
    pr.repository.nameWithOwner.toLowerCase(),
    pr.state,
    pr.headRefOid.toLowerCase(),
    pr.baseRefOid.toLowerCase(),
    pr.headRefName,
    pr.baseRefName,
  ]);
}

export function checkContext(
  actual: FeedbackContext,
  expected: FeedbackContext,
): void {
  if (contextIdentity(actual) !== contextIdentity(expected))
    throw new ReviewError(
      "stale-review",
      "PR identity, revision, state, or authenticated viewer changed. Refresh and obtain approval again.",
    );
}

function commentIdentity(comment: FeedbackComment): unknown {
  return [
    comment.id,
    comment.body,
    comment.url,
    comment.updatedAt,
    comment.state,
    comment.viewerDidAuthor,
    comment.commit?.oid ?? null,
    comment.originalCommit?.oid ?? null,
    comment.author?.login ?? null,
    comment.replyTo?.id ?? null,
  ];
}

export function threadMetadata(thread: Omit<FeedbackThread, "comments">) {
  const {
    id,
    path,
    line,
    originalLine,
    isResolved,
    isOutdated,
    viewerCanReply,
    viewerCanResolve,
  } = thread;
  return {
    id,
    path,
    line,
    originalLine,
    isResolved,
    isOutdated,
    viewerCanReply,
    viewerCanResolve,
  };
}

export function threadVersion(thread: FeedbackThread): string {
  return digest([threadMetadata(thread), thread.comments.map(commentIdentity)]);
}

export function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function checkThread(
  actual: FeedbackThread,
  expectedVersion: string,
): void {
  if (threadVersion(actual) !== expectedVersion)
    throw new ReviewError(
      "stale-thread",
      "Review thread changed. Refresh the complete conversation and obtain approval again.",
    );
}

export function withoutReply(
  thread: FeedbackThread,
  replyId: string,
): FeedbackThread {
  return {
    ...thread,
    comments: thread.comments.filter((comment) => comment.id !== replyId),
  };
}

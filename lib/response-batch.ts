import { type Static, Type } from "typebox";
import {
  checked,
  checkThread,
  digest,
  type FeedbackComment,
  type FeedbackContext,
  type FeedbackThread,
} from "./feedback-model.ts";
import {
  normalizeTarget,
  ReviewSchema,
  ReviewTargetSchema,
} from "./review-batch.ts";
import { ReviewError } from "./review-error.ts";
import { replyMutation, resolveMutation } from "./response-queries.ts";

const id = Type.String({ minLength: 1, maxLength: 256 });
export const ResponseSchema = Type.Object(
  {
    ...ReviewTargetSchema.properties,
    headCommit: ReviewSchema.properties.reviewedCommit,
    baseCommit: ReviewSchema.properties.reviewedCommit,
    responses: Type.Array(
      Type.Object(
        {
          threadId: id,
          threadVersion: Type.String({ pattern: "^[a-f0-9]{64}$" }),
          reply: Type.Optional(Type.String({ minLength: 1, maxLength: 4000 })),
          existingReplyId: Type.Optional(id),
          resolve: Type.Boolean(),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 20 },
    ),
  },
  { additionalProperties: false },
);
export type ResponseRequest = Static<typeof ResponseSchema>;
export type ResponseAction = ResponseRequest["responses"][number];
export type NormalizedResponse = ReturnType<typeof normalizeResponse>;

export function normalizeResponse(value: unknown, defaultHost: string) {
  const request = checked(ResponseSchema, value, "invalid-batch");
  if (
    new Set(request.responses.map((action) => action.threadId)).size !==
    request.responses.length
  )
    throw new ReviewError(
      "invalid-batch",
      "Each review thread may appear only once in a response batch.",
    );
  for (const action of request.responses) {
    if (
      Boolean(action.reply) === Boolean(action.existingReplyId) ||
      (action.reply !== undefined && !action.reply.trim()) ||
      (action.existingReplyId !== undefined && !action.resolve)
    )
      throw new ReviewError(
        "invalid-batch",
        "Choose nonblank reply text, or an existing reply ID with resolution; not both.",
      );
  }
  return {
    ...request,
    ...normalizeTarget(request, defaultHost),
    headCommit: request.headCommit.toLowerCase(),
    baseCommit: request.baseCommit.toLowerCase(),
  };
}

export function checkResponseRevision(
  context: FeedbackContext,
  request: NormalizedResponse,
): void {
  if (context.pr.state !== "OPEN")
    throw new ReviewError(
      "closed-pr",
      "PR is not open; no further response operation is permitted.",
    );
  if (
    context.pr.headRefOid.toLowerCase() !== request.headCommit ||
    context.pr.baseRefOid.toLowerCase() !== request.baseCommit
  )
    throw new ReviewError(
      "stale-review",
      "PR head or base differs from the inspected feedback. Refresh before publication.",
    );
}

export function replyBody(
  request: NormalizedResponse,
  action: ResponseAction,
  viewer: string,
): string {
  if (action.reply === undefined)
    throw new ReviewError(
      "invalid-batch",
      "Reply text is required for a new reply.",
    );
  const marker = digest([
    request.hostname,
    request.repository,
    request.pullRequest,
    request.headCommit,
    request.baseCommit,
    action.threadId,
    viewer.toLowerCase(),
    action.reply,
  ]);
  return `${action.reply}\n\n<!-- pi-review-response:${marker} -->`;
}

export function matchingReply(
  thread: FeedbackThread,
  body: string,
  viewer: string,
): FeedbackComment | undefined {
  const matches = thread.comments.filter(
    (comment) =>
      comment.viewerDidAuthor &&
      comment.author?.login.toLowerCase() === viewer.toLowerCase() &&
      comment.state === "SUBMITTED" &&
      comment.replyTo !== null &&
      comment.body === body,
  );
  if (matches.length > 1)
    throw new ReviewError(
      "invalid-response",
      "Multiple identical authenticated replies exist. Inspect the thread manually.",
    );
  return matches[0];
}

export function selectedReply(
  thread: FeedbackThread,
  id: string,
): FeedbackComment {
  const reply = thread.comments.find(
    (comment) =>
      comment.id === id &&
      comment.replyTo !== null &&
      comment.state === "SUBMITTED",
  );
  if (!reply)
    throw new ReviewError(
      "invalid-batch",
      "The selected existing reply is not a published reply in this thread.",
    );
  return reply;
}

export function planResponse(
  request: NormalizedResponse,
  action: ResponseAction,
  thread: FeedbackThread,
  viewer: string,
) {
  checkThread(thread, action.threadVersion);
  const body =
    action.reply === undefined ? undefined : replyBody(request, action, viewer);
  const existing =
    action.existingReplyId === undefined
      ? body === undefined
        ? undefined
        : matchingReply(thread, body, viewer)
      : selectedReply(thread, action.existingReplyId);
  if (!existing && !thread.viewerCanReply)
    throw new ReviewError(
      "thread-permission",
      "The authenticated viewer cannot reply to this thread.",
    );
  if (action.resolve && !thread.isResolved && !thread.viewerCanResolve)
    throw new ReviewError(
      "thread-permission",
      "The authenticated viewer cannot resolve this thread.",
    );
  return { action, thread, body, existing };
}
export type PlannedResponse = ReturnType<typeof planResponse>;

const ReplyPayloadSchema = Type.Object({
  query: Type.Literal(replyMutation),
  variables: Type.Object({
    input: Type.Object({
      pullRequestReviewThreadId: id,
      body: Type.String(),
      clientMutationId: Type.String(),
    }),
  }),
});
const ResolvePayloadSchema = Type.Object({
  query: Type.Literal(resolveMutation),
  variables: Type.Object({
    input: Type.Object({ threadId: id, clientMutationId: Type.String() }),
  }),
});
export type MutationPayload =
  | Static<typeof ReplyPayloadSchema>
  | Static<typeof ResolvePayloadSchema>;

export function replyPayload(
  threadId: string,
  body: string,
): Static<typeof ReplyPayloadSchema> {
  return {
    query: replyMutation,
    variables: {
      input: {
        pullRequestReviewThreadId: threadId,
        body,
        clientMutationId: digest([threadId, body]),
      },
    },
  };
}
export function resolvePayload(
  thread: FeedbackThread,
): Static<typeof ResolvePayloadSchema> {
  return {
    query: resolveMutation,
    variables: {
      input: {
        threadId: thread.id,
        // The batch's own reply must not change the approved resolution payload.
        clientMutationId: digest([thread.id, "resolve"]),
      },
    },
  };
}

const ReplyReceiptSchema = Type.Object({
  id,
  body: Type.String(),
  url: Type.String({ minLength: 1 }),
  state: Type.Literal("SUBMITTED"),
  viewerDidAuthor: Type.Literal(true),
});
export function replyReceipt(value: unknown, body: string) {
  const receipt = checked(ReplyReceiptSchema, value);
  if (receipt.body !== body)
    throw new ReviewError(
      "invalid-response",
      "GitHub returned an unexpected reply receipt.",
    );
  return receipt;
}
export function resolutionReceipt(value: unknown, threadId: string): void {
  const receipt = checked(
    Type.Object({ id, isResolved: Type.Literal(true) }),
    value,
  );
  if (receipt.id !== threadId)
    throw new ReviewError(
      "invalid-response",
      "GitHub returned a different resolved thread.",
    );
}

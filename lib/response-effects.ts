import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import type { FeedbackComment, FeedbackThread } from "./feedback-model.ts";
import { graphqlData } from "./feedback-model.ts";
import type { FeedbackReader, ThreadObservation } from "./github-feedback.ts";
import { record } from "./review-batch.ts";
import { ReviewError } from "./review-error.ts";
import {
  matchingReply,
  replyPayload,
  replyReceipt,
  resolutionReceipt,
  resolvePayload,
} from "./response-batch.ts";
import { writeResponseMutation } from "./response-transport.ts";

const FailureSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
});
const ReplyEffectSchema = Type.Object({
  status: StringEnum([
    "not-started",
    "already-posted",
    "posted",
    "unknown",
    "accepted-unverified",
  ] as const),
  id: Type.Optional(Type.String()),
  url: Type.Optional(Type.String()),
});
const ResolutionEffectSchema = Type.Object({
  status: StringEnum([
    "not-requested",
    "not-started",
    "already-resolved",
    "resolved",
    "unknown",
    "accepted-unverified",
  ] as const),
});
const ReceiptSchema = Type.Object({
  threadId: Type.String(),
  reply: ReplyEffectSchema,
  resolution: ResolutionEffectSchema,
});
export const ResponseOutputSchema = Type.Object({
  status: StringEnum(["completed", "cancelled", "stopped"] as const),
  receipts: Type.Array(ReceiptSchema),
  failure: Type.Optional(FailureSchema),
});
export type ResponseFailure = Static<typeof FailureSchema>;
export type ReplyEffect = Static<typeof ReplyEffectSchema>;
export type ResolutionEffect = Static<typeof ResolutionEffectSchema>;
export type ResponseReceipt = Static<typeof ReceiptSchema>;

export function responseFailure(error: unknown): ResponseFailure {
  return error instanceof ReviewError
    ? { code: error.code, message: error.message }
    : {
        code: "response-interrupted",
        message:
          "Response operation interrupted. Inspect the per-effect receipts before continuing.",
      };
}

async function readBack(
  reader: FeedbackReader,
  threadId: string,
  signal: AbortSignal,
): Promise<{
  observation?: ThreadObservation;
  failure?: ResponseFailure;
}> {
  try {
    signal.throwIfAborted();
    return { observation: await reader.thread(threadId) };
  } catch (error) {
    return { failure: responseFailure(error) };
  }
}

export async function applyReply(
  pi: Pick<ExtensionAPI, "exec">,
  hostname: string,
  reader: FeedbackReader,
  threadId: string,
  body: string,
  viewer: string,
  signal: AbortSignal,
): Promise<{
  reply: ReplyEffect;
  observation?: ThreadObservation;
  failure?: ResponseFailure;
}> {
  const write = await writeResponseMutation(
    pi,
    hostname,
    replyPayload(threadId, body),
    signal,
  );
  if (write.outcome === "not-submitted")
    return {
      reply: { status: "not-started" },
      failure: {
        code: "preflight-failed",
        message: write.problem ?? "Reply was not submitted.",
      },
    };
  let receipt: ReturnType<typeof replyReceipt> | undefined;
  let receiptFailure: ResponseFailure | undefined;
  try {
    receipt = replyReceipt(
      record(graphqlData(write.output).addPullRequestReviewThreadReply).comment,
      body,
    );
  } catch {
    receiptFailure = {
      code: "unverified-submission",
      message:
        "Reply receipt could not be verified; no further mutation will be attempted.",
    };
  }
  const observed = await readBack(reader, threadId, signal);
  let comment: FeedbackComment | undefined;
  let matchFailure: ResponseFailure | undefined;
  try {
    if (observed.observation) {
      if (
        observed.observation.context.viewer.login.toLowerCase() !==
        viewer.toLowerCase()
      )
        throw new ReviewError(
          "stale-review",
          "Authenticated viewer changed after reply submission.",
        );
      comment = matchingReply(observed.observation.thread, body, viewer);
    }
  } catch (error) {
    matchFailure = responseFailure(error);
  }
  const reply: ReplyEffect = comment
    ? { status: "posted", id: comment.id, url: comment.url }
    : {
        status: receipt ? "accepted-unverified" : "unknown",
        ...(receipt ? { id: receipt.id, url: receipt.url } : {}),
      };
  const mismatch =
    receipt &&
    comment &&
    (receipt.id !== comment.id || receipt.url !== comment.url);
  const failure = write.problem
    ? { code: "ambiguous-submission", message: write.problem }
    : (receiptFailure ??
      observed.failure ??
      matchFailure ??
      (!comment || mismatch
        ? {
            code: "unverified-submission",
            message:
              "Reply readback did not match the mutation receipt. Inspect the thread before any retry.",
          }
        : undefined));
  return { reply, observation: observed.observation, failure };
}

export async function applyResolution(
  pi: Pick<ExtensionAPI, "exec">,
  hostname: string,
  reader: FeedbackReader,
  thread: FeedbackThread,
  signal: AbortSignal,
): Promise<{
  resolution: ResolutionEffect;
  observation?: ThreadObservation;
  failure?: ResponseFailure;
}> {
  const write = await writeResponseMutation(
    pi,
    hostname,
    resolvePayload(thread),
    signal,
  );
  if (write.outcome === "not-submitted")
    return {
      resolution: { status: "not-started" },
      failure: {
        code: "preflight-failed",
        message: write.problem ?? "Resolution was not submitted.",
      },
    };
  let receiptVerified = false;
  let receiptFailure: ResponseFailure | undefined;
  try {
    resolutionReceipt(
      record(graphqlData(write.output).resolveReviewThread).thread,
      thread.id,
    );
    receiptVerified = true;
  } catch {
    receiptFailure = {
      code: "unverified-submission",
      message:
        "Resolution receipt could not be verified; no further mutation will be attempted.",
    };
  }
  const observed = await readBack(reader, thread.id, signal);
  const resolution: ResolutionEffect = {
    status: observed.observation?.thread.isResolved
      ? "resolved"
      : receiptVerified
        ? "accepted-unverified"
        : "unknown",
  };
  const failure = write.problem
    ? { code: "ambiguous-submission", message: write.problem }
    : (receiptFailure ??
      observed.failure ??
      (!observed.observation?.thread.isResolved
        ? {
            code: "unverified-submission",
            message:
              "Thread was not resolved in independent readback. Inspect it before any retry.",
          }
        : undefined));
  return { resolution, observation: observed.observation, failure };
}

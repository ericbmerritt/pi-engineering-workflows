import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  checkContext,
  checkThread,
  type FeedbackContext,
  threadVersion,
  withoutReply,
} from "./feedback-model.ts";
import {
  createFeedbackReader,
  feedbackLimits,
  type FeedbackReader,
} from "./github-feedback.ts";
import { ReviewError } from "./review-error.ts";
import {
  checkResponseRevision,
  normalizeResponse,
  planResponse,
  type PlannedResponse,
  ResponseSchema,
  selectedReply,
  replyPayload,
  resolvePayload,
} from "./response-batch.ts";
import {
  applyReply,
  applyResolution,
  type ResponseFailure,
  type ResponseReceipt,
  responseFailure,
  ResponseOutputSchema,
} from "./response-effects.ts";

function responseResult(
  status: "completed" | "cancelled" | "stopped",
  receipts: readonly ResponseReceipt[],
  failure?: ResponseFailure,
) {
  const details = {
    status,
    receipts: [...receipts],
    ...(failure ? { failure } : {}),
  };
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(details, null, 2) },
    ],
    details,
    structuredContent: details,
    ...(status === "completed" ? {} : { terminate: true }),
    ...(failure ? { isError: true } : {}),
  };
}

async function refreshPlan(
  reader: FeedbackReader,
  plan: PlannedResponse,
  initial: FeedbackContext,
): Promise<PlannedResponse> {
  const current = await reader.thread(plan.action.threadId);
  checkContext(current.context, initial);
  checkThread(current.thread, plan.action.threadVersion);
  return { ...plan, thread: current.thread };
}

function replaceReceipt(
  receipts: readonly ResponseReceipt[],
  index: number,
  receipt: ResponseReceipt,
): readonly ResponseReceipt[] {
  return receipts.map((value, position) =>
    position === index ? receipt : value,
  );
}

export async function respondToReview(
  pi: Pick<ExtensionAPI, "exec">,
  value: unknown,
  signal: AbortSignal,
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
) {
  signal.throwIfAborted();
  if (!ctx.hasUI)
    throw new ReviewError(
      "approval-required",
      "Responding requires interactive human approval. No GitHub write was attempted.",
    );
  const request = normalizeResponse(value, process.env.GH_HOST || "github.com");
  const target = {
    hostname: request.hostname,
    repository: request.repository,
    pullRequest: request.pullRequest,
  };
  const reader = createFeedbackReader(pi, target, signal);
  const initial = await reader.context();
  checkResponseRevision(initial, request);
  let plans: PlannedResponse[] = [];
  for (const action of request.responses) {
    const current = await reader.thread(action.threadId);
    checkContext(current.context, initial);
    plans = [
      ...plans,
      planResponse(request, action, current.thread, initial.viewer.login),
    ];
  }
  checkContext(await reader.context(), initial);
  let receipts: readonly ResponseReceipt[] = plans.map((plan) => ({
    threadId: plan.thread.id,
    reply: { status: "not-started" },
    resolution: {
      status: plan.action.resolve ? "not-started" : "not-requested",
    },
  }));
  const preview = JSON.stringify(
    {
      ...target,
      headCommit: request.headCommit,
      baseCommit: request.baseCommit,
      viewer: initial.viewer.login,
      responses: plans.map((plan) => ({
        threadId: plan.thread.id,
        version: plan.action.threadVersion,
        conversation: plan.thread,
        reply: plan.existing
          ? { existingReply: plan.existing }
          : plan.body === undefined
            ? null
            : replyPayload(plan.thread.id, plan.body),
        resolution: !plan.action.resolve
          ? "not requested"
          : plan.thread.isResolved
            ? "already resolved"
            : resolvePayload(plan.thread),
      })),
    },
    null,
    2,
  );
  if (Buffer.byteLength(preview) > feedbackLimits.outputBytes)
    throw new ReviewError(
      "response-limit",
      "Response preview exceeds the inspection budget. Use a smaller batch or manual handoff.",
    );
  const inspected = await ctx.ui.editor(
    "Inspect exact review responses and resolutions. Save unchanged; Esc cancels.",
    preview,
  );
  signal.throwIfAborted();
  if (inspected === undefined) return responseResult("cancelled", receipts);
  if (inspected !== preview)
    throw new ReviewError(
      "approval-changed",
      "Response preview was edited. Update the proposal and obtain approval again; no writes were attempted.",
    );
  const approved = await ctx.ui.confirm(
    "Publish these review responses?",
    `${target.hostname}/${target.repository} PR #${target.pullRequest}\n${plans.length} thread action(s) at ${request.headCommit}. Replies and resolutions are separate, non-atomic effects. Publish exactly what you inspected?`,
    { signal },
  );
  signal.throwIfAborted();
  if (!approved) return responseResult("cancelled", receipts);

  // Refresh the entire approved set before the first write, then each thread
  // again at its own write boundary. Later drift can still cause a partial round.
  checkContext(await reader.context(), initial);
  for (const plan of plans) await refreshPlan(reader, plan, initial);

  for (const [index, plan] of plans.entries()) {
    let receipt = receipts[index];
    try {
      signal.throwIfAborted();
      let current = (await refreshPlan(reader, plan, initial)).thread;
      if (plan.existing) {
        const existing = selectedReply(current, plan.existing.id);
        receipt = {
          ...receipt,
          reply: {
            status: "already-posted",
            id: existing.id,
            url: existing.url,
          },
        };
        receipts = replaceReceipt(receipts, index, receipt);
      } else {
        if (plan.body === undefined)
          throw new ReviewError(
            "invalid-batch",
            "A new reply requires exact approved text.",
          );
        const applied = await applyReply(
          pi,
          target.hostname,
          reader,
          current.id,
          plan.body,
          initial.viewer.login,
          signal,
        );
        receipt = { ...receipt, reply: applied.reply };
        receipts = replaceReceipt(receipts, index, receipt);
        if (applied.failure)
          return responseResult("stopped", receipts, applied.failure);
        if (!applied.observation || !applied.reply.id)
          throw new ReviewError(
            "unverified-submission",
            "Reply lacks a verified readback; resolution was not attempted.",
          );
        checkContext(applied.observation.context, initial);
        checkThread(
          withoutReply(applied.observation.thread, applied.reply.id),
          threadVersion(current),
        );
        current = applied.observation.thread;
      }
      if (!plan.action.resolve) continue;
      if (current.isResolved) {
        receipt = { ...receipt, resolution: { status: "already-resolved" } };
        receipts = replaceReceipt(receipts, index, receipt);
        continue;
      }
      const beforeResolution = await reader.thread(current.id);
      checkContext(beforeResolution.context, initial);
      checkThread(beforeResolution.thread, threadVersion(current));
      if (!receipt.reply.id)
        throw new ReviewError(
          "invalid-batch",
          "Resolution requires a verified published reply.",
        );
      selectedReply(beforeResolution.thread, receipt.reply.id);
      const applied = await applyResolution(
        pi,
        target.hostname,
        reader,
        beforeResolution.thread,
        signal,
      );
      receipt = { ...receipt, resolution: applied.resolution };
      receipts = replaceReceipt(receipts, index, receipt);
      if (applied.failure)
        return responseResult("stopped", receipts, applied.failure);
      if (!applied.observation)
        throw new ReviewError(
          "unverified-submission",
          "Resolution lacks independent readback.",
        );
      checkContext(applied.observation.context, initial);
      checkThread(
        {
          ...applied.observation.thread,
          isResolved: current.isResolved,
          viewerCanResolve: current.viewerCanResolve,
          viewerCanReply: current.viewerCanReply,
        },
        threadVersion(current),
      );
    } catch (error) {
      return responseResult("stopped", receipts, responseFailure(error));
    }
  }
  return responseResult("completed", receipts);
}

export function registerGitHubResponses(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "github_respond_to_review",
    label: "Respond to GitHub review",
    description:
      "Publish an approved batch of existing review-thread replies and optional resolutions through authenticated gh. Requires pinned PR head/base and complete thread versions from github_review_feedback. Shows exact conversation/effects, then requires separate human confirmation. Verifies each reply before resolving; stops with per-effect receipts on drift, failure, or uncertain outcomes. No unattended writes, general comments, or automatic retries.",
    parameters: ResponseSchema,
    outputSchema: ResponseOutputSchema,
    executionMode: "sequential",
    async execute(_id, params, signal, _onUpdate, ctx) {
      return respondToReview(
        pi,
        params,
        signal ?? new AbortController().signal,
        ctx,
      );
    },
  });
}

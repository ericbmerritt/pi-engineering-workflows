import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  buildBatch,
  checkSnapshot,
  matchingReview,
  normalizeRequest,
  parseSnapshot,
  record,
  ReviewSchema,
  type ReviewRequest,
  validateAnchors,
} from "./review-batch.ts";
import { parseJson, ReviewError } from "./review-error.ts";

const wrapper = fileURLToPath(
  new URL("../scripts/submit-review-batch.sh", import.meta.url),
);

function result(status: string, text: string, url?: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: { status, url: url ?? null },
  };
}

function bounded(text: string): string {
  return text.slice(0, 3000);
}

export async function submitReview(
  pi: Pick<ExtensionAPI, "exec">,
  request: ReviewRequest,
  signal: AbortSignal,
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
) {
  signal.throwIfAborted();
  if (!ctx.hasUI)
    throw new ReviewError(
      "approval-required",
      "Posting requires interactive human approval. No GitHub write was attempted.",
    );
  const normalized = normalizeRequest(
    request,
    process.env.GH_HOST || "github.com",
  );
  const { hostname, repository, pullRequest, reviewedCommit } = normalized;
  const endpoint = `repos/${repository}/pulls/${pullRequest}`;
  const batch = buildBatch(normalized);
  const api = async (path: string, extra: string[] = []) => {
    const response = await pi.exec(
      "gh",
      ["api", path, "--hostname", hostname, "--method", "GET", ...extra],
      { signal, timeout: 30000 },
    );
    signal.throwIfAborted();
    if (response.code !== 0 || response.killed) {
      throw new ReviewError(
        "preflight-failed",
        `GitHub preflight failed: ${bounded(response.stderr || response.stdout)}. No new POST was attempted by this check.`,
      );
    }
    if (Buffer.byteLength(response.stdout) > 20 * 1024 * 1024) {
      throw new ReviewError(
        "preflight-failed",
        "GitHub response exceeds the posting validation budget. Refusing to submit.",
      );
    }
    return response.stdout;
  };
  const snapshot = async () => parseSnapshot(await api(endpoint), repository);
  const existingReview = async () =>
    matchingReview(
      await api(`${endpoint}/reviews`, ["--paginate", "--slurp"]),
      batch.marker,
      reviewedCommit,
    );

  const initial = await snapshot();
  checkSnapshot(initial, reviewedCommit);
  const previous = await existingReview();
  if (previous)
    return result(
      "already-posted",
      `This exact batch is already posted: ${previous}`,
      previous,
    );

  if (normalized.comments.length) {
    const diff = await api(endpoint, [
      "--header",
      "Accept: application/vnd.github.v3.diff",
    ]);
    validateAnchors(normalized, diff);
  }
  checkSnapshot(await snapshot(), reviewedCommit, initial);

  const preview = JSON.stringify(
    {
      hostname,
      repository,
      pullRequest,
      ...batch.payload,
    },
    null,
    2,
  );
  const inspected = await ctx.ui.editor(
    "Inspect exact GitHub review. Save unchanged to continue; Esc cancels.",
    preview,
  );
  signal.throwIfAborted();
  if (inspected === undefined)
    return {
      ...result("cancelled", "Review cancelled. Nothing was submitted."),
      terminate: true,
    };
  if (inspected !== preview)
    throw new ReviewError(
      "approval-changed",
      "Preview was edited. Update the proposed batch and request approval again; nothing was submitted.",
    );
  const approved = await ctx.ui.confirm(
    "Publish this GitHub review?",
    `${hostname}/${repository} PR #${pullRequest}\n${normalized.verdict} at ${reviewedCommit}\n${normalized.comments.length} inline comment(s). Publish the exact inspected batch?`,
    { signal },
  );
  signal.throwIfAborted();
  if (!approved)
    return {
      ...result("cancelled", "Review not approved. Nothing was submitted."),
      terminate: true,
    };

  const concurrent = await existingReview();
  if (concurrent)
    return result(
      "already-posted",
      `This exact batch is already posted: ${concurrent}`,
      concurrent,
    );
  checkSnapshot(await snapshot(), reviewedCommit, initial);

  const directory = await mkdtemp(join(tmpdir(), "pi-review-"));
  try {
    const path = join(directory, "review.json");
    await writeFile(path, JSON.stringify(batch.payload), { mode: 0o600 });
    signal.throwIfAborted();
    let response: Awaited<ReturnType<ExtensionAPI["exec"]>>;
    try {
      response = await pi.exec(
        "bash",
        [wrapper, hostname, repository, String(pullRequest), path],
        { signal, timeout: 30000 },
      );
    } catch (error) {
      throw new ReviewError(
        "ambiguous-submission",
        `Review submission outcome is unknown. Inspect GitHub before retrying. ${bounded(error instanceof Error ? error.message : String(error))}`,
        { cause: error },
      );
    }
    // Once the write starts, even cancellation or a CLI error can follow a
    // successful server write. Never describe that case as 'nothing posted'.
    if (response.code !== 0 || response.killed || signal.aborted) {
      if (!signal.aborted) {
        try {
          const posted = await existingReview();
          if (posted)
            return result(
              "posted",
              `Review confirmed on GitHub: ${posted}`,
              posted,
            );
        } catch {
          // The original write outcome remains unknown; do not retry it.
        }
      }
      throw new ReviewError(
        "ambiguous-submission",
        `Review submission failed or its outcome is unknown. Do not blindly retry; inspect GitHub first. ${bounded(response.stderr)}`,
      );
    }
    try {
      const review = record(parseJson(response.stdout));
      const expectedState = {
        approve: "APPROVED",
        "request-changes": "CHANGES_REQUESTED",
        comment: "COMMENTED",
      } as const;
      if (
        review.commit_id !== reviewedCommit ||
        review.state !== expectedState[normalized.verdict] ||
        typeof review.html_url !== "string"
      ) {
        throw new ReviewError(
          "unverified-submission",
          "Unexpected review receipt.",
        );
      }
      return result(
        "posted",
        `Review posted: ${review.html_url}`,
        review.html_url,
      );
    } catch {
      throw new ReviewError(
        "unverified-submission",
        "GitHub accepted the write but its receipt could not be verified. Inspect the PR before any retry.",
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }
}

export function registerGitHubReview(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "github_submit_review",
    label: "Submit GitHub review",
    description:
      "Publish one PR review containing its verdict and all approved inline findings. " +
      "Uses authenticated gh CLI with an explicit hostname or GH_HOST/github.com. Validates " +
      "the current head/base and diff anchors, shows an exact scrollable preview, then requires " +
      "a separate human confirmation. No unattended posting or automatic POST retries. " +
      "Use a minimal review body; every finding belongs in comments. Empty comments allows a body-only verdict.",
    parameters: ReviewSchema,
    executionMode: "sequential",
    async execute(_id, params, signal, _onUpdate, ctx) {
      return submitReview(
        pi,
        params,
        signal ?? new AbortController().signal,
        ctx,
      );
    },
  });
}

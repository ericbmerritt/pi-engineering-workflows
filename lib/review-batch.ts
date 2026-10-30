import { createHash } from "node:crypto";
import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import { parseJson, ReviewError } from "./review-error.ts";

export const ReviewTargetSchema = Type.Object({
  hostname: Type.Optional(Type.String({ maxLength: 253 })),
  repository: Type.String({
    pattern: "^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$",
  }),
  pullRequest: Type.Integer({ minimum: 1, maximum: 2147483647 }),
});
export type ReviewTarget = Static<typeof ReviewTargetSchema>;

export const ReviewSchema = Type.Object({
  ...ReviewTargetSchema.properties,
  reviewedCommit: Type.String({
    pattern: "^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$",
  }),
  verdict: StringEnum(["approve", "request-changes", "comment"] as const),
  body: Type.String({ minLength: 1, maxLength: 4000 }),
  comments: Type.Array(
    Type.Object({
      path: Type.String({ minLength: 1, maxLength: 4096 }),
      line: Type.Integer({ minimum: 1 }),
      side: StringEnum(["LEFT", "RIGHT"] as const),
      body: Type.String({ minLength: 1, maxLength: 4000 }),
    }),
    { maxItems: 100 },
  ),
});

export type ReviewRequest = Static<typeof ReviewSchema>;
export type Side = "LEFT" | "RIGHT";
export type Anchors = ReadonlyMap<
  string,
  ReadonlyMap<Side, ReadonlySet<number>>
>;
export type Snapshot = {
  readonly head: string;
  readonly base: string;
  readonly state: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ReviewError(
      "invalid-response",
      "Unexpected GitHub response shape.",
    );
  }
  return value;
}

function sha(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value)
  ) {
    throw new ReviewError(
      "invalid-response",
      "GitHub did not return a full commit SHA.",
    );
  }
  return value.toLowerCase();
}

export function parseSnapshot(output: string, repository: string): Snapshot {
  const pr = record(parseJson(output));
  const base = record(pr.base);
  const repo = record(base.repo);
  if (
    typeof repo.full_name !== "string" ||
    repo.full_name.toLowerCase() !== repository.toLowerCase()
  ) {
    throw new ReviewError(
      "invalid-response",
      "GitHub returned a different destination repository.",
    );
  }
  if (typeof pr.state !== "string")
    throw new ReviewError("invalid-response", "Missing PR state.");
  return {
    head: sha(record(pr.head).sha),
    base: sha(base.sha),
    state: pr.state,
  };
}

export function checkSnapshot(
  snapshot: Snapshot,
  commit: string,
  initial?: Snapshot,
): void {
  if (snapshot.state !== "open")
    throw new ReviewError(
      "closed-pr",
      "PR is not open. Nothing was submitted.",
    );
  if (
    snapshot.head !== commit.toLowerCase() ||
    (initial && snapshot.base !== initial.base)
  ) {
    throw new ReviewError(
      "stale-review",
      "PR head or base changed. Refresh the review and obtain approval again.",
    );
  }
}

export function normalizeTarget(
  request: ReviewTarget,
  defaultHost: string,
): ReviewTarget & { hostname: string } {
  const hostname = (request.hostname || defaultHost).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?$/.test(hostname)) {
    throw new ReviewError(
      "invalid-batch",
      "Use a GitHub hostname, not a URL or API path.",
    );
  }
  return {
    ...request,
    repository: request.repository.toLowerCase(),
    hostname,
  };
}

export function normalizeRequest(
  request: ReviewRequest,
  defaultHost: string,
): ReviewRequest & { hostname: string } {
  const target = normalizeTarget(request, defaultHost);
  if (
    !request.body.trim() ||
    request.comments.some((comment) => !comment.body.trim())
  ) {
    throw new ReviewError(
      "invalid-batch",
      "Review and comment bodies must not be blank.",
    );
  }
  return {
    ...request,
    ...target,
    reviewedCommit: request.reviewedCommit.toLowerCase(),
  };
}

export function buildBatch(request: ReviewRequest & { hostname: string }) {
  const events = {
    approve: "APPROVE",
    "request-changes": "REQUEST_CHANGES",
    comment: "COMMENT",
  } as const;
  const comments = request.comments.map(({ path, line, side, body }) => ({
    path,
    line,
    side,
    body,
  }));
  const identity = {
    hostname: request.hostname,
    repository: request.repository,
    pullRequest: request.pullRequest,
    reviewedCommit: request.reviewedCommit,
    verdict: request.verdict,
    body: request.body,
    comments,
  };
  const digest = createHash("sha256")
    .update(JSON.stringify(identity))
    .digest("hex");
  const marker = `<!-- pi-review:${digest} -->`;
  return {
    marker,
    payload: {
      commit_id: request.reviewedCommit,
      event: events[request.verdict],
      body: `${request.body}\n\n${marker}`,
      ...(comments.length ? { comments } : {}),
    },
  };
}

function decodePath(header: string): string {
  if (!header.startsWith('"')) return header;
  if (!header.endsWith('"'))
    throw new ReviewError("invalid-anchor", "Malformed quoted diff path.");
  const input = header.slice(1, -1);
  const chunks: Buffer[] = [];
  const escapes: Record<string, number> = {
    a: 7,
    b: 8,
    t: 9,
    n: 10,
    v: 11,
    f: 12,
    r: 13,
    '"': 34,
    "\\": 92,
  };
  for (let i = 0; i < input.length; ) {
    if (input[i] !== "\\") {
      const end = input.indexOf("\\", i);
      const next = end < 0 ? input.length : end;
      chunks.push(Buffer.from(input.slice(i, next)));
      i = next;
      continue;
    }
    const octal = input.slice(i + 1).match(/^[0-7]{1,3}/)?.[0];
    if (octal) {
      chunks.push(Buffer.from([Number.parseInt(octal, 8)]));
      i += octal.length + 1;
    } else {
      const byte = escapes[input[i + 1]];
      if (byte === undefined)
        throw new ReviewError(
          "invalid-anchor",
          "Unsupported diff path escape.",
        );
      chunks.push(Buffer.from([byte]));
      i += 2;
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function parseAnchors(diff: string): Anchors {
  const files = new Map<string, Map<Side, Set<number>>>();
  for (const section of diff.split(/^diff --git /m).slice(1)) {
    const lines = section.split("\n");
    const oldHeader = lines.find((line) => line.startsWith("--- "));
    const newHeader = lines.find((line) => line.startsWith("+++ "));
    if (!oldHeader || !newHeader) continue;
    const oldPath = decodePath(oldHeader.slice(4));
    const newPath = decodePath(newHeader.slice(4));
    const path = newPath === "/dev/null" ? oldPath.slice(2) : newPath.slice(2);
    const left = new Set<number>();
    const right = new Set<number>();
    let oldLine = 0;
    let newLine = 0;
    let oldRemaining = 0;
    let newRemaining = 0;
    for (const line of lines) {
      if (oldRemaining || newRemaining) {
        if (line.startsWith("\\ No newline")) continue;
        if (line.startsWith(" ") || line.startsWith("-")) {
          if (--oldRemaining < 0)
            throw new ReviewError(
              "invalid-anchor",
              "Malformed or truncated PR diff.",
            );
          left.add(oldLine++);
        }
        if (line.startsWith(" ") || line.startsWith("+")) {
          if (--newRemaining < 0)
            throw new ReviewError(
              "invalid-anchor",
              "Malformed or truncated PR diff.",
            );
          right.add(newLine++);
        }
        if (!/^[ +-]/.test(line))
          throw new ReviewError(
            "invalid-anchor",
            "Malformed or truncated PR diff.",
          );
        continue;
      }
      const hunk = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (hunk) {
        oldLine = Number(hunk[1]);
        oldRemaining = Number(hunk[2] ?? 1);
        newLine = Number(hunk[3]);
        newRemaining = Number(hunk[4] ?? 1);
      }
    }
    if (oldRemaining || newRemaining)
      throw new ReviewError(
        "invalid-anchor",
        "Malformed or truncated PR diff.",
      );
    files.set(
      path,
      new Map<Side, Set<number>>([
        ["LEFT", left],
        ["RIGHT", right],
      ]),
    );
  }
  return files;
}

export function validateAnchors(request: ReviewRequest, diff: string): void {
  const anchors = parseAnchors(diff);
  for (const comment of request.comments) {
    if (!anchors.get(comment.path)?.get(comment.side)?.has(comment.line)) {
      throw new ReviewError(
        "invalid-anchor",
        `Invalid inline anchor: ${comment.path}:${comment.line} (${comment.side}). Nothing was submitted.`,
      );
    }
  }
}

export function matchingReview(
  output: string,
  marker: string,
  commit: string,
): string | undefined {
  const pages = parseJson(output);
  if (!Array.isArray(pages))
    throw new ReviewError(
      "invalid-response",
      "Unexpected review-list response.",
    );
  for (const page of pages) {
    if (!Array.isArray(page))
      throw new ReviewError(
        "invalid-response",
        "Unexpected paginated review-list response.",
      );
    for (const value of page) {
      const review = record(value);
      if (typeof review.body !== "string" || !review.body.includes(marker))
        continue;
      if (
        review.commit_id !== commit ||
        !["APPROVED", "CHANGES_REQUESTED", "COMMENTED"].includes(
          String(review.state),
        )
      ) {
        throw new ReviewError(
          "existing-review",
          "A matching pending or dismissed review exists. Inspect it on GitHub before proceeding.",
        );
      }
      if (typeof review.html_url !== "string")
        throw new ReviewError(
          "existing-review",
          "Matching review exists but its URL is unavailable. Do not resubmit.",
        );
      return review.html_url;
    }
  }
  return undefined;
}

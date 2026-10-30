export type ReviewErrorCode =
  | "skill-load-failed"
  | "invalid-batch"
  | "invalid-response"
  | "invalid-anchor"
  | "stale-review"
  | "stale-thread"
  | "thread-permission"
  | "response-limit"
  | "closed-pr"
  | "approval-required"
  | "approval-changed"
  | "preflight-failed"
  | "existing-review"
  | "ambiguous-submission"
  | "unverified-submission";

export class ReviewError extends Error {
  readonly code: ReviewErrorCode;
  readonly outcome: "not-submitted" | "unknown" | "accepted-unverified";

  constructor(code: ReviewErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ReviewError";
    this.code = code;
    this.outcome =
      code === "ambiguous-submission"
        ? "unknown"
        : code === "unverified-submission"
          ? "accepted-unverified"
          : "not-submitted";
  }
}

export function parseJson(output: string): unknown {
  try {
    return JSON.parse(output);
  } catch (cause) {
    throw new ReviewError("invalid-response", "GitHub returned invalid JSON.", {
      cause,
    });
  }
}

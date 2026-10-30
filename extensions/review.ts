import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { registerGitHubFeedback } from "../lib/github-feedback.ts";
import { registerGitHubResponses } from "../lib/github-respond.ts";
import { registerGitHubReview } from "../lib/github-review.ts";
import { registerSkillCommand } from "../lib/skill-command.ts";

export default function reviewExtension(pi: ExtensionAPI): void {
  registerGitHubReview(pi);
  registerGitHubFeedback(pi);
  registerGitHubResponses(pi);
  registerSkillCommand(pi, {
    name: "review",
    description: "Review a PR or commit range with the bundled review workflow",
    directory: new URL("../review/", import.meta.url),
    defaultRequest: "Ask me which repository and change to review.",
  });
  registerSkillCommand(pi, {
    name: "self-review",
    description:
      "Review local changes, the Git index, or an explicit comparison before opening a PR",
    directory: new URL("../self-review/", import.meta.url),
    defaultRequest:
      "Review my current local changes, including untracked files.",
  });

  registerSkillCommand(pi, {
    name: "review-respond",
    description:
      "Triage existing PR feedback, prepare fixes, and seek approval for replies and resolution",
    directory: new URL("../review-respond/", import.meta.url),
    defaultRequest:
      "Identify the current change's PR and triage its review feedback; ask if the target is ambiguous, and do not edit or publish without approval.",
  });

  registerSkillCommand(pi, {
    name: "spec",
    description:
      "Collaboratively draft or revise a specification and optional delivery plan",
    directory: new URL("../spec-workflow/", import.meta.url),
    defaultRequest:
      "Help me define the problem, scope, and acceptance criteria for a spec.",
  });
  registerSkillCommand(pi, {
    name: "spec-review",
    description:
      "Challenge a drafted spec and explicitly distinguish independent cold reads",
    directory: new URL("../adversarial-spec-review/", import.meta.url),
    defaultRequest:
      "Ask me which spec to review and whether an independent cold read is required.",
  });

  registerSkillCommand(pi, {
    name: "test-plan",
    description:
      "Map change contracts to discriminating tests and a contained smoke plan",
    directory: new URL("../test-plan/", import.meta.url),
    defaultRequest:
      "Help me map the change's contracts to meaningful checks; do not execute them yet.",
  });
  registerSkillCommand(pi, {
    name: "validate",
    description:
      "Discover approved project checks and report revision-specific validation evidence",
    directory: new URL("../validation-standards/", import.meta.url),
    defaultRequest:
      "Inspect project checks and propose a scoped validation run; ask before executing repository code.",
  });
  registerSkillCommand(pi, {
    name: "pr",
    description:
      "Prepare a GitHub PR and seek exact approval before pushing or creating it",
    directory: new URL("../pr-workflow/", import.meta.url),
    defaultRequest:
      "Prepare a PR from the current branch; do not push or create it without approval of the exact destination and content.",
  });

  registerSkillCommand(pi, {
    name: "commit",
    description:
      "Prepare a Git commit or jj description and seek approval before recording changes",
    directory: new URL("../commit-workflow/", import.meta.url),
    defaultRequest:
      "Inspect the intended Git index or jj change and draft a commit message; do not stage, commit, rewrite history, or run hooks without approval.",
  });
  registerSkillCommand(pi, {
    name: "fix-ci",
    description:
      "Diagnose revision-matched PR CI failures and prepare approved fixes and publication",
    directory: new URL("../fix-ci/", import.meta.url),
    defaultRequest:
      "Identify the current change's PR and diagnose its CI failures; ask if the target is ambiguous, and do not edit, execute repository code, commit, or push without approval.",
  });

  pi.registerTool({
    name: "review_decision",
    label: "Review decision",
    description:
      "Ask the reviewer to choose among already explained finding actions or verdict options. " +
      "Never use this for free-text reasoning questions. Cancellation or unavailable UI " +
      "is not approval. This tool never publishes anything. Question limit: 4000 characters; " +
      "up to 12 options of 256 characters each.",
    parameters: Type.Object({
      question: Type.String({ minLength: 1, maxLength: 4000 }),
      options: Type.Array(Type.String({ minLength: 1, maxLength: 256 }), {
        minItems: 1,
        maxItems: 12,
        uniqueItems: true,
      }),
    }),
    executionMode: "sequential",
    async execute(_id, params, signal, _onUpdate, ctx) {
      signal?.throwIfAborted();
      if (!ctx.hasUI) {
        return {
          content: [
            {
              type: "text",
              text: "UI unavailable. No choice or approval was recorded.",
            },
          ],
          details: { status: "unavailable", choice: null },
        };
      }

      const choice = await ctx.ui.select(params.question, params.options, {
        signal,
      });
      signal?.throwIfAborted();
      if (choice === undefined) {
        return {
          content: [
            {
              type: "text",
              text: "Reviewer cancelled. No choice or approval was recorded.",
            },
          ],
          details: { status: "cancelled", choice: null },
          terminate: true,
        };
      }

      return {
        content: [{ type: "text", text: `Reviewer selected: ${choice}` }],
        details: { status: "selected", choice },
      };
    },
  });
}

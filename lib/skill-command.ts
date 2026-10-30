import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ReviewError } from "./review-error.ts";

interface SkillCommand {
  readonly name: string;
  readonly description: string;
  readonly directory: URL;
  readonly defaultRequest: string;
}

export function registerSkillCommand(
  pi: ExtensionAPI,
  skill: SkillCommand,
): void {
  pi.registerCommand(skill.name, {
    description: skill.description,
    handler: async (args, ctx) => {
      let instructions: string;
      try {
        instructions = await readFile(
          new URL("SKILL.md", skill.directory),
          "utf8",
        );
      } catch (cause) {
        const failure = new ReviewError(
          "skill-load-failed",
          `Cannot load the bundled ${skill.name} skill: ${cause instanceof Error ? cause.message : String(cause)}`,
          { cause },
        );
        if (!ctx.hasUI) throw failure;
        ctx.ui.notify(failure.message, "error");
        return;
      }

      pi.sendUserMessage(
        `${instructions}\n\n` +
          `Skill directory: ${fileURLToPath(skill.directory)}\n` +
          "Resolve references against the directory of the document containing them.\n" +
          `Mode: ${ctx.hasUI ? "interactive" : "noninteractive"}.\n` +
          "Follow the loaded workflow's scope and permission boundaries.\n\n" +
          `User request: ${args.trim() || skill.defaultRequest}`,
        { deliverAs: "followUp" },
      );
    },
  });
}

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { MutationPayload } from "./response-batch.ts";

const wrapper = fileURLToPath(
  new URL("../scripts/respond-review-thread.sh", import.meta.url),
);
export type WriteOutcome = {
  readonly outcome: "not-submitted" | "unknown" | "returned";
  readonly output: string;
  readonly problem?: string;
};

export async function writeResponseMutation(
  pi: Pick<ExtensionAPI, "exec">,
  hostname: string,
  payload: MutationPayload,
  signal: AbortSignal,
): Promise<WriteOutcome> {
  let directory: string | undefined;
  let started = false;
  let outcome: WriteOutcome;
  try {
    signal.throwIfAborted();
    directory = await mkdtemp(join(tmpdir(), "pi-response-"));
    const path = join(directory, "mutation.json");
    await writeFile(path, JSON.stringify(payload), { mode: 0o600 });
    signal.throwIfAborted();
    started = true;
    const result = await pi.exec("bash", [wrapper, hostname, path], {
      signal,
      timeout: 30000,
    });
    outcome =
      result.code === 0 && !result.killed && !signal.aborted
        ? { outcome: "returned", output: result.stdout }
        : {
            outcome: "unknown",
            output: result.stdout,
            problem:
              "Response transport failed, timed out, or was cancelled. Inspect GitHub before any retry.",
          };
  } catch {
    outcome = {
      outcome: started ? "unknown" : "not-submitted",
      output: "",
      problem: started
        ? "Response transport was interrupted; the write outcome is unknown."
        : "Response stopped before submission began.",
    };
  }
  if (directory) {
    try {
      await rm(directory, { recursive: true, force: true });
    } catch {
      outcome = {
        ...outcome,
        problem: `${outcome.problem ?? "Response transport returned."} Temporary payload cleanup failed at ${directory}.`,
      };
    }
  }
  return outcome;
}

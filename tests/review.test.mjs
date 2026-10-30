import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import reviewExtension from "../extensions/review.ts";

function harness({ hasUI = true, select = async () => "Keep" } = {}) {
  const commands = new Map();
  const tools = new Map();
  const messages = [];
  const selections = [];
  const pi = {
    registerCommand: (name, definition) => commands.set(name, definition),
    registerTool: (definition) => tools.set(definition.name, definition),
    sendUserMessage: (text, options) => messages.push({ text, options }),
  };
  reviewExtension(pi);
  const ctx = {
    hasUI,
    ui: {
      select: async (...args) => {
        selections.push(args);
        return select(...args);
      },
    },
  };
  return { commands, tools, messages, selections, ctx };
}

async function decide(h, signal = new AbortController().signal) {
  return h.tools
    .get("review_decision")
    .execute(
      "call-1",
      { question: "Keep F1?", options: ["Keep", "Skip"] },
      signal,
      undefined,
      h.ctx,
    );
}

test("registers workflow commands and native review tools without starting work", () => {
  const h = harness();
  assert.deepEqual(
    [...h.commands.keys()],
    [
      "review",
      "self-review",
      "review-respond",
      "spec",
      "spec-review",
      "test-plan",
      "validate",
      "pr",
      "commit",
      "fix-ci",
    ],
  );
  assert.deepEqual(
    [...h.tools.keys()],
    [
      "github_submit_review",
      "github_review_feedback",
      "github_respond_to_review",
      "review_decision",
    ],
  );
  assert.equal(h.tools.get("review_decision").executionMode, "sequential");
  assert.equal(h.messages.length, 0);
});

test("registered posting tool requires real UI even without an abort signal", async () => {
  const h = harness({ hasUI: false });
  await assert.rejects(
    h.tools
      .get("github_submit_review")
      .execute("post-1", {}, undefined, undefined, h.ctx),
    (error) =>
      error.name === "ReviewError" && error.code === "approval-required",
  );
  assert.equal(h.messages.length, 0);
});

test("response publication requires UI even without an abort signal", async () => {
  const h = harness({ hasUI: false });
  await assert.rejects(
    h.tools
      .get("github_respond_to_review")
      .execute("respond-1", {}, undefined, undefined, h.ctx),
    (error) =>
      error.name === "ReviewError" && error.code === "approval-required",
  );
  assert.equal(h.messages.length, 0);
});

test("command loads bundled instructions, request, and reference directory", async () => {
  const h = harness();
  await h.commands.get("review").handler(" owner/repo 42 ", h.ctx);
  assert.equal(h.messages.length, 1);
  const { text, options } = h.messages[0];
  const instructions = await readFile(
    new URL("../review/SKILL.md", import.meta.url),
    "utf8",
  );
  assert.ok(text.startsWith(instructions));
  assert.ok(
    text.includes(fileURLToPath(new URL("../review/", import.meta.url))),
  );
  assert.ok(text.includes("User request: owner/repo 42"));
  assert.ok(text.includes("Mode: interactive"));
  assert.deepEqual(options, { deliverAs: "followUp" });
});

test("missing arguments request context rather than inventing a PR", async () => {
  const h = harness();
  await h.commands.get("review").handler("  ", h.ctx);
  assert.ok(
    h.messages[0].text.includes(
      "Ask me which repository and change to review.",
    ),
  );
});

test("headless command requests a noninteractive review", async () => {
  const h = harness({ hasUI: false });
  await h.commands.get("review").handler("HEAD~1..HEAD", h.ctx);
  assert.ok(h.messages[0].text.includes("Mode: noninteractive"));
});

test("self-review defaults to all local changes without guessing a PR", async () => {
  const h = harness();
  await h.commands.get("self-review").handler("  ", h.ctx);
  const instructions = await readFile(
    new URL("../self-review/SKILL.md", import.meta.url),
    "utf8",
  );
  assert.equal(h.messages.length, 1);
  const { text, options } = h.messages[0];
  assert.ok(text.startsWith(instructions));
  assert.ok(
    text.includes(fileURLToPath(new URL("../self-review/", import.meta.url))),
  );
  assert.ok(
    text.includes(
      "User request: Review my current local changes, including untracked files.",
    ),
  );
  assert.ok(text.includes("Mode: interactive"));
  assert.deepEqual(options, { deliverAs: "followUp" });
});

test("self-review forwards staged, range, and jj scope as text rather than executing it", async () => {
  for (const scope of [
    "--staged",
    "HEAD~2..HEAD",
    "--from @- --to @",
    "--staged; echo unsafe",
  ]) {
    const h = harness();
    await h.commands.get("self-review").handler(` ${scope} `, h.ctx);
    assert.equal(h.messages.length, 1);
    assert.ok(h.messages[0].text.includes(`User request: ${scope}`));
    assert.deepEqual(h.messages[0].options, { deliverAs: "followUp" });
  }
});

test("headless self-review keeps the requested scope without inventing choices", async () => {
  const h = harness({ hasUI: false });
  await h.commands.get("self-review").handler("--staged", h.ctx);
  assert.ok(h.messages[0].text.includes("Mode: noninteractive"));
  assert.ok(h.messages[0].text.includes("User request: --staged"));
  assert.equal(h.selections.length, 0);
});

test("spec command loads its workflow and starts problem discovery without assumptions", async () => {
  const h = harness();
  await h.commands.get("spec").handler("  ", h.ctx);
  const instructions = await readFile(
    new URL("../spec-workflow/SKILL.md", import.meta.url),
    "utf8",
  );
  assert.equal(h.messages.length, 1);
  assert.ok(h.messages[0].text.startsWith(instructions));
  assert.ok(
    h.messages[0].text.includes(
      fileURLToPath(new URL("../spec-workflow/", import.meta.url)),
    ),
  );
  assert.ok(
    h.messages[0].text.includes(
      "User request: Help me define the problem, scope, and acceptance criteria for a spec.",
    ),
  );
  assert.equal(h.selections.length, 0);
  assert.doesNotMatch(
    h.messages[0].text,
    /Use github_submit_review for publication/,
  );
});

test("spec workflows preserve requested context as data in interactive and headless modes", async () => {
  for (const name of ["spec", "spec-review"]) {
    for (const hasUI of [true, false]) {
      const h = harness({ hasUI });
      const request = "specs/retry policy.md; do not execute this text";
      await h.commands.get(name).handler(` ${request} `, h.ctx);
      assert.equal(h.messages.length, 1);
      assert.ok(h.messages[0].text.includes(`User request: ${request}`));
      assert.ok(
        h.messages[0].text.includes(
          `Mode: ${hasUI ? "interactive" : "noninteractive"}`,
        ),
      );
      assert.deepEqual(h.messages[0].options, { deliverAs: "followUp" });
      assert.equal(h.selections.length, 0);
    }
  }
});

test("spec-review loads the adversarial workflow without choosing a model or spec", async () => {
  const h = harness();
  await h.commands.get("spec-review").handler("", h.ctx);
  const instructions = await readFile(
    new URL("../adversarial-spec-review/SKILL.md", import.meta.url),
    "utf8",
  );
  assert.ok(h.messages[0].text.startsWith(instructions));
  assert.ok(
    h.messages[0].text.includes(
      fileURLToPath(new URL("../adversarial-spec-review/", import.meta.url)),
    ),
  );
  assert.ok(
    h.messages[0].text.includes(
      "Ask me which spec to review and whether an independent cold read is required.",
    ),
  );
  assert.doesNotMatch(
    h.messages[0].text,
    /Use github_submit_review for publication/,
  );
});

const deliveryWorkflows = [
  {
    command: "commit",
    directory: "commit-workflow",
    defaultRequest:
      "Inspect the intended Git index or jj change and draft a commit message; do not stage, commit, rewrite history, or run hooks without approval.",
  },
  {
    command: "fix-ci",
    directory: "fix-ci",
    defaultRequest:
      "Identify the current change's PR and diagnose its CI failures; ask if the target is ambiguous, and do not edit, execute repository code, commit, or push without approval.",
  },
  {
    command: "review-respond",
    directory: "review-respond",
    defaultRequest:
      "Identify the current change's PR and triage its review feedback; ask if the target is ambiguous, and do not edit or publish without approval.",
  },
  {
    command: "test-plan",
    directory: "test-plan",
    defaultRequest:
      "Help me map the change's contracts to meaningful checks; do not execute them yet.",
  },
  {
    command: "validate",
    directory: "validation-standards",
    defaultRequest:
      "Inspect project checks and propose a scoped validation run; ask before executing repository code.",
  },
  {
    command: "pr",
    directory: "pr-workflow",
    defaultRequest:
      "Prepare a PR from the current branch; do not push or create it without approval of the exact destination and content.",
  },
];

for (const workflow of deliveryWorkflows) {
  test(`${workflow.command} loads its bundled skill and defaults to preparation`, async () => {
    const h = harness();
    await h.commands.get(workflow.command).handler("  ", h.ctx);
    const directory = new URL(`../${workflow.directory}/`, import.meta.url);
    const instructions = await readFile(new URL("SKILL.md", directory), "utf8");
    assert.equal(h.messages.length, 1);
    assert.ok(h.messages[0].text.startsWith(instructions));
    assert.ok(
      h.messages[0].text.includes(
        `Skill directory: ${fileURLToPath(directory)}`,
      ),
    );
    assert.ok(
      h.messages[0].text.includes(`User request: ${workflow.defaultRequest}`),
    );
    assert.ok(h.messages[0].text.includes("Mode: interactive"));
    assert.deepEqual(h.messages[0].options, { deliverAs: "followUp" });
    assert.equal(h.selections.length, 0);
  });

  test(`${workflow.command} forwards scope as text without invoking UI or execution`, async () => {
    for (const hasUI of [true, false]) {
      const h = harness({ hasUI });
      const request = "docs/retry policy.md; $(do-not-execute) --base release";
      await h.commands.get(workflow.command).handler(` ${request} `, h.ctx);
      assert.equal(h.messages.length, 1);
      assert.ok(h.messages[0].text.includes(`User request: ${request}`));
      assert.ok(
        h.messages[0].text.includes(
          `Mode: ${hasUI ? "interactive" : "noninteractive"}`,
        ),
      );
      assert.deepEqual(h.messages[0].options, { deliverAs: "followUp" });
      assert.equal(h.selections.length, 0);
    }
  });

  test(`${workflow.command} has the same safe default when UI is unavailable`, async () => {
    const h = harness({ hasUI: false });
    await h.commands.get(workflow.command).handler("", h.ctx);
    assert.ok(
      h.messages[0].text.includes(`User request: ${workflow.defaultRequest}`),
    );
    assert.ok(h.messages[0].text.includes("Mode: noninteractive"));
    assert.equal(h.selections.length, 0);
  });
}

test("review-respond loads response instructions without starting a new review", async () => {
  const h = harness();
  await h.commands.get("review-respond").handler("example/project#42", h.ctx);
  assert.ok(h.messages[0].text.includes("User request: example/project#42"));
  assert.doesNotMatch(
    h.messages[0].text,
    /Use github_submit_review for publication/,
  );
  assert.equal(h.messages.length, 1);
  assert.equal(h.selections.length, 0);
});

test("choice returns the actual human selection and passes the abort signal", async () => {
  const h = harness({ select: async () => "Skip" });
  const signal = new AbortController().signal;
  const result = await decide(h, signal);
  assert.deepEqual(result.details, { status: "selected", choice: "Skip" });
  assert.equal(h.selections[0][2].signal, signal);
  assert.equal(h.messages.length, 0);
});

test("dismissed selection is not approval and stops automatic follow-up", async () => {
  const h = harness({ select: async () => undefined });
  const result = await decide(h);
  assert.deepEqual(result.details, { status: "cancelled", choice: null });
  assert.equal(result.terminate, true);
});

test("headless choices do not invoke UI or invent an answer", async () => {
  const h = harness({ hasUI: false });
  const result = await decide(h);
  assert.deepEqual(result.details, { status: "unavailable", choice: null });
  assert.equal(h.selections.length, 0);
});

test("aborted calls do not open UI", async () => {
  const h = harness();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(decide(h, controller.signal), { name: "AbortError" });
  assert.equal(h.selections.length, 0);
});

test("abort while dialog is open cannot produce a choice", async () => {
  const controller = new AbortController();
  const h = harness({
    select: async () => {
      controller.abort();
      return "Keep";
    },
  });
  await assert.rejects(decide(h, controller.signal), { name: "AbortError" });
});

test("dialog failures propagate rather than masquerading as a human answer", async () => {
  const h = harness({
    select: async () => {
      throw new Error("UI disconnected");
    },
  });
  await assert.rejects(decide(h), /UI disconnected/);
});

test("all local Markdown links resolve inside the package", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const manifest = JSON.parse(
    await readFile(resolve(root, "package.json"), "utf8"),
  );
  const files = [
    resolve(root, "README.md"),
    ...manifest.pi.skills.map((directory) =>
      resolve(root, directory, "SKILL.md"),
    ),
  ];
  const visited = new Set();
  for (const path of files) {
    if (visited.has(path)) continue;
    visited.add(path);
    const text = await readFile(path, "utf8");
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^(https?:|#)/.test(target)) continue;
      const resolved = resolve(dirname(path), target.split("#")[0]);
      assert.ok(resolved.startsWith(root), `Link escapes package: ${target}`);
      await readFile(resolved, "utf8");
      if (resolved.endsWith(".md")) files.push(resolved);
    }
    assert.doesNotMatch(
      text,
      /GH_HOST=[a-z]|Ticket: [A-Z]+-\d|\/Users\/|\/nix\/store\/|Skill\(|~\/\.(?:claude|pi)\/|\bpgc\b/i,
    );
  }
});

test("manifest targets Pi 1.2.0 as its minimum supported 1.x release", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(
    manifest.peerDependencies["@earendil-works/pi-coding-agent"],
    "^1.2.0",
  );
  assert.equal(manifest.peerDependencies["@earendil-works/pi-ai"], "^1.2.0");
  assert.equal(
    manifest.devDependencies["@earendil-works/pi-coding-agent"],
    "1.2.0",
  );
});

test("manifest includes every workflow and keeps publication disabled", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const lock = JSON.parse(
    await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
  );
  assert.equal(manifest.name, "pi-engineering-workflows");
  assert.equal(lock.name, manifest.name);
  assert.equal(lock.packages[""].name, manifest.name);
  assert.deepEqual(manifest.repository, {
    type: "git",
    url: "git+https://github.com/ericbmerritt/pi-engineering-workflows.git",
  });
  assert.equal(manifest.private, true);
  assert.ok(manifest.keywords.includes("pi-package"));
  assert.deepEqual(manifest.pi.extensions, ["./extensions/review.ts"]);
  assert.deepEqual(manifest.pi.skills, [
    "./review",
    "./self-review",
    "./review-respond",
    "./spec-workflow",
    "./adversarial-spec-review",
    "./test-plan",
    "./validation-standards",
    "./pr-workflow",
    "./commit-workflow",
    "./fix-ci",
    "./test-writing",
  ]);
  for (const directory of manifest.pi.skills) {
    assert.ok(manifest.files.includes(`${directory.slice(2)}/`));
  }
  assert.ok(manifest.files.includes("lib/"));
  assert.ok(manifest.files.includes("scripts/"));
});

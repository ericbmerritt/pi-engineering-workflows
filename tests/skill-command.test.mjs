import assert from "node:assert/strict";
import { test } from "node:test";
import { registerSkillCommand } from "../lib/skill-command.ts";
import { ReviewError } from "../lib/review-error.ts";

function missingSkill(hasUI) {
  const commands = new Map();
  const notifications = [];
  const messages = [];
  registerSkillCommand(
    {
      registerCommand: (name, definition) => commands.set(name, definition),
      sendUserMessage: (...args) => messages.push(args),
    },
    {
      name: "missing-test-skill",
      description: "Test missing resources",
      directory: new URL("../not-a-bundled-skill/", import.meta.url),
      defaultRequest: "Review local changes",
    },
  );
  return {
    command: commands.get("missing-test-skill"),
    ctx: { hasUI, ui: { notify: (...args) => notifications.push(args) } },
    notifications,
    messages,
  };
}

test("missing interactive skill reports an error without starting a review", async () => {
  const h = missingSkill(true);
  await h.command.handler("", h.ctx);
  assert.equal(h.messages.length, 0);
  assert.equal(h.notifications.length, 1);
  assert.equal(h.notifications[0][1], "error");
  assert.match(
    h.notifications[0][0],
    /Cannot load the bundled missing-test-skill skill/,
  );
});

test("missing headless skill raises a structured load error with its original cause", async () => {
  const h = missingSkill(false);
  await assert.rejects(
    h.command.handler("", h.ctx),
    (error) =>
      error instanceof ReviewError &&
      error.code === "skill-load-failed" &&
      error.cause?.code === "ENOENT",
  );
  assert.equal(h.messages.length, 0);
  assert.equal(h.notifications.length, 0);
});

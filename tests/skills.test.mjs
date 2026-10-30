import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";

for (const name of ["commit-workflow", "fix-ci", "test-writing"]) {
  test(`${name} is discoverable as a portable skill by the pinned Pi SDK`, () => {
    const directory = new URL(`../${name}/`, import.meta.url);
    const result = loadSkillsFromDir({
      dir: fileURLToPath(directory),
      source: "test",
    });
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.skills.length, 1);
    const [skill] = result.skills;
    assert.equal(skill.name, name);
    assert.ok(skill.description.length > 0);
    assert.equal(skill.disableModelInvocation, false);
    assert.equal(skill.filePath, fileURLToPath(new URL("SKILL.md", directory)));
  });
}

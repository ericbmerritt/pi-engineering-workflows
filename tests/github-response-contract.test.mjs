import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { replyPayload, resolvePayload } from "../lib/response-batch.ts";
import { thread } from "./fixtures/response-harness.mjs";

// The fixture is a field/type projection of the public schema, not a provider
// simulator's invented contract. Its source and full-schema digest are retained.
const contract = JSON.parse(
  await readFile(
    new URL("./fixtures/github-response-contract.json", import.meta.url),
    "utf8",
  ),
);
for (const operation of [
  {
    payload: replyPayload("thread-1", "Literal reply"),
    resolver: "addPullRequestReviewThreadReply",
    inputType: "AddPullRequestReviewThreadReplyInput",
    returnField: "comment",
  },
  {
    payload: resolvePayload(thread()),
    resolver: "resolveReviewThread",
    inputType: "ResolveReviewThreadInput",
    returnField: "thread",
  },
]) {
  test(`${operation.resolver} uses the captured official input and receipt contract`, () => {
    const payload = JSON.parse(JSON.stringify(operation.payload));
    const fields = contract.types[operation.inputType];
    assert.ok(payload.query.includes(`$input: ${operation.inputType}!`));
    assert.ok(payload.query.includes(`${operation.resolver}(input: $input)`));
    for (const [name, value] of Object.entries(payload.variables.input)) {
      assert.ok(
        ["String", "String!", "ID", "ID!"].includes(fields[name]),
        `${name} is not a documented scalar input`,
      );
      assert.equal(typeof value, "string");
    }
    for (const [name, type] of Object.entries(fields))
      if (type.endsWith("!"))
        assert.ok(
          name in payload.variables.input,
          `Required input ${name} is absent`,
        );
    const payloadType = contract.types.Mutation[operation.resolver];
    const resultType = contract.types[payloadType][operation.returnField];
    const selection = payload.query
      .match(new RegExp(`${operation.returnField}\\s*\\{([^{}]*)\\}`))[1]
      .trim()
      .split(/\s+/);
    for (const field of selection)
      assert.ok(
        field in contract.types[resultType],
        `${field} is not a documented result field`,
      );
  });
}

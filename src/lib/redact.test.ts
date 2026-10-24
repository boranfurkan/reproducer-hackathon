import assert from "node:assert/strict";
import { test } from "node:test";
import { redact, redactDeep } from "./redact";

test("removes Google keys, GitHub tokens and connection strings", () => {
  const text = `key AIza${"B".repeat(35)} token ghp_${"c".repeat(30)} uri mongodb+srv://user:pw@cluster0.example.mongodb.net/db`;
  const out = redact(text);
  assert.ok(!/AIza|ghp_|user:pw/.test(out), out);
  assert.equal((out.match(/\[REDACTED\]/g) ?? []).length, 3);
});

test("removes exact secret values the caller supplies, but ignores very short ones", () => {
  assert.equal(redact("password is hunter2-value", ["hunter2-value"]), "password is [REDACTED]");
  assert.equal(redact("a=b", ["a"]), "a=b");
});

test("redacts strings nested in objects and arrays without touching other values", () => {
  const out = redactDeep({ n: 3, ok: true, list: ["x", `ghp_${"d".repeat(30)}`], deep: { v: "secret-value-123" } }, ["secret-value-123"]);
  assert.deepEqual(out, { n: 3, ok: true, list: ["x", "[REDACTED]"], deep: { v: "[REDACTED]" } });
});

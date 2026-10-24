import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { BOT_MARKER, commentOnPr, listPrFeedback, pushToBranch } from "./github";

// A local stand-in for the GitHub API: records every call, answers just enough for the calls under test.
async function mock(routes: Record<string, (body: unknown) => unknown>) {
  const calls: string[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const key = `${req.method} ${decodeURIComponent(req.url?.split("?")[0] ?? "")}`;
      calls.push(key);
      const handler = routes[key];
      res.setHeader("content-type", "application/json");
      if (!handler) {
        res.statusCode = 404;
        res.end(JSON.stringify({ message: `unexpected ${key}` }));
        return;
      }
      res.statusCode = key.startsWith("POST") ? 201 : 200;
      res.end(JSON.stringify(handler(raw ? JSON.parse(raw) : undefined)));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  return { calls, baseUrl: `http://127.0.0.1:${port}`, close: () => server.close() };
}

test("a revision becomes one commit on the pull request's branch, never on the default branch", async () => {
  let treeBody: { base_tree: string; tree: { path: string }[] } | undefined;
  let commitBody: { parents: string[] } | undefined;
  let refBody: { sha: string } | undefined;
  const gh = await mock({
    "GET /repos/o/r/git/ref/heads/reproducer/issue-1-abc": () => ({ ref: "refs/heads/reproducer/issue-1-abc", object: { sha: "head1" } }),
    "GET /repos/o/r/git/commits/head1": () => ({ sha: "head1", tree: { sha: "tree1" } }),
    "POST /repos/o/r/git/trees": (b) => ((treeBody = b as typeof treeBody), { sha: "tree2" }),
    "POST /repos/o/r/git/commits": (b) => ((commitBody = b as typeof commitBody), { sha: "commit2", html_url: "https://example.test/commit2" }),
    "PATCH /repos/o/r/git/refs/heads/reproducer/issue-1-abc": (b) => ((refBody = b as typeof refBody), {}),
  });
  try {
    const r = await pushToBranch({ token: "t", owner: "o", repo: "r", branch: "reproducer/issue-1-abc", message: "Address review", files: [{ path: "src/a.js", content: "x" }, { path: "tests/repro.spec.js", content: "y" }], baseUrl: gh.baseUrl });
    assert.equal(r.sha, "commit2");
    assert.equal(treeBody?.base_tree, "tree1");
    assert.deepEqual(treeBody?.tree.map((f) => f.path), ["src/a.js", "tests/repro.spec.js"]);
    assert.deepEqual(commitBody?.parents, ["head1"]);
    assert.equal(refBody?.sha, "commit2");
    assert.ok(gh.calls.every((c) => !c.includes("/heads/main")), gh.calls.join("\n"));
  } finally {
    gh.close();
  }
});

test("reviewer feedback skips ReProducer's own comments and empty reviews", async () => {
  const gh = await mock({
    "GET /repos/o/r/pulls/5/reviews": () => [
      { user: { login: "rev" }, state: "CHANGES_REQUESTED", body: "Please also handle az-AZ." },
      { user: { login: "rev" }, state: "APPROVED", body: "" },
      { user: { login: "rev" }, state: "PENDING", body: "draft" },
    ],
    "GET /repos/o/r/pulls/5/comments": () => [{ user: { login: "rev" }, path: "src/a.js", line: 3, body: "Why not toLowerCase()?" }],
    "GET /repos/o/r/issues/5/comments": () => [
      { user: { login: "me" }, body: `Updated the fix.\n\n${BOT_MARKER}` },
      { user: { login: "other" }, body: "LGTM otherwise" },
    ],
  });
  try {
    const f = await listPrFeedback("t", "o", "r", 5, gh.baseUrl);
    assert.deepEqual(f.map((x) => `${x.kind}:${x.author}`), ["review:rev", "inline:rev", "comment:other"]);
    assert.equal(f[1].path, "src/a.js");
  } finally {
    gh.close();
  }
});

test("the reply to the reviewer carries the marker", async () => {
  let body: { body: string } | undefined;
  const gh = await mock({ "POST /repos/o/r/issues/5/comments": (b) => ((body = b as typeof body), { id: 1 }) });
  try {
    await commentOnPr("t", "o", "r", 5, "Changed it.", gh.baseUrl);
    assert.match(body!.body, /Changed it\./);
    assert.ok(body!.body.includes(BOT_MARKER));
  } finally {
    gh.close();
  }
});

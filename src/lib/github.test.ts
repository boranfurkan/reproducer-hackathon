import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { openFixPullRequest } from "./github";

interface Seen {
  method: string;
  path: string;
  body: Record<string, unknown>;
}

/** A tiny stand-in for the GitHub API: records every request and answers like GitHub does. Nothing real is touched. */
async function mockGitHub() {
  const seen: Seen[] = [];
  const server = createServer(async (req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    // Octokit encodes the slash in "heads/main"; GitHub accepts that, so the mock decodes it before matching.
    const path = decodeURIComponent(req.url ?? "");
    seen.push({ method: req.method ?? "", path, body });
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (req.method === "GET" && path === "/repos/o/r") return json(200, { default_branch: "main" });
    if (req.method === "GET" && path === "/repos/o/r/git/ref/heads/main") return json(200, { object: { sha: "base-sha" } });
    if (req.method === "GET" && path === "/repos/o/r/git/commits/base-sha") return json(200, { tree: { sha: "base-tree" } });
    if (req.method === "POST" && path === "/repos/o/r/git/refs") return json(201, { ref: body.ref });
    if (req.method === "POST" && path === "/repos/o/r/git/trees") return json(201, { sha: "new-tree" });
    if (req.method === "POST" && path === "/repos/o/r/git/commits") return json(201, { sha: "new-commit" });
    if (req.method === "PATCH" && path.startsWith("/repos/o/r/git/refs/heads/")) return json(200, {});
    if (req.method === "POST" && path === "/repos/o/r/pulls") return json(201, { html_url: "https://github.com/o/r/pull/7", number: 7 });
    return json(404, { message: `unexpected ${req.method} ${path}` });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { seen, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

test("the pull request is built from the default branch with one commit and never merged", async () => {
  const gh = await mockGitHub();
  try {
    const pr = await openFixPullRequest({
      token: "test-token",
      owner: "o",
      repo: "r",
      issueNumber: 5,
      title: "Fix: the locale upper-cases i wrongly",
      body: "Fixes #5\n\nbody text",
      files: [
        { path: "src/categories.js", content: "export const x = 1;\n" },
        { path: "tests/repro.spec.js", content: "// test\n" },
      ],
      baseUrl: gh.baseUrl,
    });
    assert.deepEqual([pr.url, pr.number], ["https://github.com/o/r/pull/7", 7]);
    assert.match(pr.branch, /^reproducer\/issue-5-[a-z0-9]+$/);

    const call = (method: string, pathPart: string) => gh.seen.find((s) => s.method === method && s.path.includes(pathPart));
    // The branch starts at the head of the default branch.
    assert.equal(call("POST", "/git/refs")?.body.sha, "base-sha");
    assert.equal(call("POST", "/git/refs")?.body.ref, `refs/heads/${pr.branch}`);
    // One tree with both files, with their content, on top of the base tree.
    const tree = call("POST", "/git/trees")!.body as { base_tree: string; tree: { path: string; mode: string; type: string; content: string }[] };
    assert.equal(tree.base_tree, "base-tree");
    assert.deepEqual(tree.tree.map((t) => [t.path, t.mode, t.type, t.content]), [
      ["src/categories.js", "100644", "blob", "export const x = 1;\n"],
      ["tests/repro.spec.js", "100644", "blob", "// test\n"],
    ]);
    // One commit whose parent is the base and whose message closes the issue.
    const commit = call("POST", "/git/commits")!.body as { message: string; tree: string; parents: string[] };
    assert.deepEqual([commit.tree, commit.parents], ["new-tree", ["base-sha"]]);
    assert.match(commit.message, /Fixes #5/);
    // The branch moves to the commit, and a pull request is opened against the default branch. Nothing is merged.
    assert.equal(call("PATCH", `/git/refs/heads/${pr.branch}`)?.body.sha, "new-commit");
    const pull = call("POST", "/pulls")!.body as { head: string; base: string; title: string; body: string };
    assert.deepEqual([pull.head, pull.base, pull.title], [pr.branch, "main", "Fix: the locale upper-cases i wrongly"]);
    assert.match(pull.body, /Fixes #5/);
    assert.ok(!gh.seen.some((s) => s.path.includes("/merge")), "must never merge");
    assert.ok(!gh.seen.some((s) => s.method === "DELETE"), "must never delete anything");
  } finally {
    gh.close();
  }
});

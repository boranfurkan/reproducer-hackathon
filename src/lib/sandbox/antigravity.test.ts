import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assertSandboxPath, writeFilesCommand } from "./antigravity";

test("only absolute paths under /opt or /workspace are accepted", () => {
  for (const ok of ["/opt/a.txt", "/workspace/x/y.js", "/opt/stage/abc-a1/fix/src/App.jsx"]) assert.doesNotThrow(() => assertSandboxPath(ok));
  for (const bad of ["/etc/passwd", "/opt/../etc/passwd", "relative/path", "/opt/a b", "/opt/a;rm", "/opt/$(id)", "/workspacex/a", "/opt/a'b"]) {
    assert.throws(() => assertSandboxPath(bad), /Refusing/, bad);
  }
});

test("written files arrive byte for byte, including quotes, dollars, backslashes and a missing trailing newline", () => {
  const tricky = "line 'single' \"double\" $HOME `ticks` \\back\\ $(subshell) <<EOF\n__EOF_abc__\n\ttabbed  trailing  \nno newline at the end";
  const cmd = writeFilesCommand([{ path: "/opt/t/tricky.txt", content: tricky }, { path: "/opt/t/two.sh", content: "echo two\n" }]);
  const dir = mkdtempSync(path.join(tmpdir(), "repro-write-"));
  execFileSync("bash", ["-c", cmd.replaceAll("/opt/", `${dir}/`)]);
  // The heredoc always ends the file with a newline, and the checksum is computed over that.
  assert.equal(readFileSync(`${dir}/t/tricky.txt`, "utf8"), `${tricky}\n`);
  assert.equal(readFileSync(`${dir}/t/two.sh`, "utf8"), "echo two\n");
});

test("a corrupted file is detected: the command stops with PAYLOAD_BAD and exit code 97", () => {
  const cmd = writeFilesCommand([{ path: "/opt/t/a.txt", content: "original content" }]).replace("original content", "tampered content");
  const dir = mkdtempSync(path.join(tmpdir(), "repro-bad-"));
  let status = 0;
  let out = "";
  try {
    out = execFileSync("bash", ["-c", cmd.replaceAll("/opt/", `${dir}/`)], { encoding: "utf8" });
  } catch (e) {
    status = (e as { status: number }).status;
    out = String((e as { stdout: string }).stdout);
  }
  assert.equal(status, 97);
  assert.match(out, /PAYLOAD_BAD/);
});

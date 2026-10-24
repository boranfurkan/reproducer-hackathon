// Drives the real web app through one investigation with Playwright and records it as video. Stops at the approval card (it never clicks Approve).
//
//   GITHUB_TOKEN=... npm run demo:record -- 4 --notes "Chrome on a Windows laptop, language Turkish" [--media recording.webm] [--base http://localhost:3000]
//
// It signs in with a session cookie built from AUTH_SECRET and the token in GITHUB_TOKEN (the GitHub login screen itself is not recorded), so the
// app must be running with the same AUTH_SECRET. Output: .demo/<timestamp>/raw.webm and, if the bundled ffmpeg is found, fast.webm (sped up).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { seal } from "../src/lib/auth";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const issue = Number(args.find((a) => /^\d+$/.test(a)) ?? 1);
  const notes = flag("--notes") ?? "";
  const media = flag("--media");
  const base = flag("--base") ?? "http://localhost:3000";
  const repo = { owner: "boranfurkan", name: "reproducer-hackathon-demo" };
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Set GITHUB_TOKEN (used for the session cookie only; the app reads issues with it)");

  const dir = path.join(".demo", new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir, size: { width: 1280, height: 800 } } });
  await ctx.addCookies([{ name: "reproducer_session", value: seal({ login: repo.owner, name: null, avatar: "", token, exp: Date.now() + 3600_000 }), url: base }]);
  const page = await ctx.newPage();
  const pause = (ms: number) => page.waitForTimeout(ms);

  await page.goto(base);
  await page.getByText(`${repo.owner}/${repo.name}`).first().waitFor({ timeout: 30_000 });
  await pause(1500);
  await page.getByText(`${repo.owner}/${repo.name}`).first().click();
  await page.getByText(new RegExp(`#${issue} `)).first().waitFor({ timeout: 30_000 });
  await pause(1200);
  await page.getByText(new RegExp(`#${issue} `)).first().click();
  const textarea = page.locator("textarea").first();
  await textarea.waitFor({ timeout: 30_000 });
  await pause(800);
  await textarea.pressSequentially(notes, { delay: 35 });
  if (media) {
    await page.locator('input[type="file"]').setInputFiles(media);
    await page.getByText(/Video:|Image:/).first().waitFor({ timeout: 90_000 });
  }
  await pause(1200);
  await page.getByRole("button", { name: "Investigate" }).click();
  await page.waitForURL(/\/runs\//, { timeout: 30_000 });

  // Wait for the run to end: the status badge changes from "Running".
  const started = Date.now();
  while (Date.now() - started < 20 * 60_000) {
    await pause(5000);
    if (!(await page.getByText("Running", { exact: true }).count())) break;
  }
  await pause(2500);
  await page.screenshot({ path: path.join(dir, "result.png"), fullPage: true });
  await ctx.close();
  await browser.close();

  const raw = readdirSync(dir).find((f) => f.endsWith(".webm"));
  if (!raw) throw new Error("No video was recorded");
  renameSync(path.join(dir, raw), path.join(dir, "raw.webm"));
  const ffmpeg = readdirSync(path.join(os.homedir(), "Library/Caches/ms-playwright"))
    .filter((d) => d.startsWith("ffmpeg"))
    .sort()
    .map((d) => path.join(os.homedir(), "Library/Caches/ms-playwright", d, "ffmpeg-mac"))
    .reverse()
    .find(existsSync);
  if (ffmpeg) {
    execFileSync(ffmpeg, ["-y", "-i", path.join(dir, "raw.webm"), "-vf", "setpts=PTS/8", "-an", "-c:v", "libvpx", "-b:v", "1500k", path.join(dir, "fast.webm")], { stdio: "ignore" });
  }
  console.log(`Saved ${dir}/raw.webm${ffmpeg ? ` and fast.webm (8x)` : ""} and result.png. The run stopped at the approval card.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

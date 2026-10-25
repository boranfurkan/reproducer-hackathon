export interface RepoRef {
  owner: string;
  name: string;
}

export interface RepoDigest {
  files: { path: string; content: string }[];
  truncated: boolean;
}

export interface RepoFile {
  path: string;
  size: number;
  sha: string;
}

/** One repository as the investigation sees it: the file tree, files fetched on demand (cached) and the git history. */
export interface RepoTree {
  repo: RepoRef;
  branch: string;
  files: RepoFile[];
  read(path: string): Promise<string>;
}

// The application's own code goes into every prompt. Vendored framework files and dependencies do not (the deep investigation reads them
// on demand or loads the ones the failing page uses).
const WANTED = /^(README\.md|package\.json|index\.html|[\w.-]+\.config\.[jt]s|(src|server|tests|app|apps|pages|lib|shared|static|components)\/.+\.(js|jsx|mjs|ts|tsx|css|json|md|html|vue|svelte))$/;
const SKIP = /(^|\/)(node_modules|vendor|dist|build|\.git)\//;
const MAX_FILE = 60_000;
const MAX_TOTAL = 400_000;

async function octokitFor(token?: string) {
  // octokit is ESM-only; a dynamic import also works when this file is loaded as CommonJS (tsx scripts).
  const { Octokit } = await import("octokit");
  // Fail fast on a GitHub rate limit instead of letting the throttling plugin hold the request for up to an hour.
  return new Octokit({ ...(token ? { auth: token } : {}), throttle: { onRateLimit: () => false, onSecondaryRateLimit: () => false } });
}

/** The file tree of the default branch, with a cached reader. Without a token, public files come from raw.githubusercontent.com (no API quota). */
export async function readRepoTree(repo: RepoRef, token?: string): Promise<RepoTree> {
  const octokit = await octokitFor(token);
  const { data: info } = await octokit.rest.repos.get({ owner: repo.owner, repo: repo.name });
  const { data: tree } = await octokit.rest.git.getTree({ owner: repo.owner, repo: repo.name, tree_sha: info.default_branch, recursive: "true" });
  const files = tree.tree.filter((n) => n.type === "blob" && n.path && n.sha).map((n) => ({ path: n.path!, size: n.size ?? 0, sha: n.sha! }));
  const cache = new Map<string, Promise<string>>();
  const read = (path: string): Promise<string> => {
    const file = files.find((f) => f.path === path);
    if (!file) return Promise.reject(new Error(`No such file: ${path}`));
    if (!cache.has(path)) {
      cache.set(
        path,
        (async () => {
          if (token) {
            const { data } = await octokit.rest.git.getBlob({ owner: repo.owner, repo: repo.name, file_sha: file.sha });
            return Buffer.from(data.content, "base64").toString("utf8");
          }
          const res = await fetch(`https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${info.default_branch}/${path}`);
          if (!res.ok) throw new Error(`Could not read ${path} (${res.status})`);
          return res.text();
        })(),
      );
      cache.get(path)!.catch(() => cache.delete(path));
    }
    return cache.get(path)!;
  };
  return { repo, branch: info.default_branch, files, read };
}

/** Read the application's own text files (not vendored code) for the prompt. */
export async function readRepoDigest(repo: RepoRef, token?: string, tree?: RepoTree): Promise<RepoDigest> {
  const t = tree ?? (await readRepoTree(repo, token));
  const wanted = t.files.filter((f) => WANTED.test(f.path) && !SKIP.test(f.path) && f.size <= MAX_FILE);
  const out: RepoDigest["files"] = [];
  let total = 0;
  let truncated = false;
  for (const f of wanted) {
    if (total + f.size > MAX_TOTAL) {
      truncated = true;
      break;
    }
    const content = await t.read(f.path);
    out.push({ path: f.path, content });
    total += content.length;
  }
  return { files: out, truncated };
}

export function formatDigest(d: RepoDigest): string {
  return d.files.map((f) => `=== ${f.path}\n${f.content}`).join("\n\n") + (d.truncated ? "\n\n[digest truncated]" : "");
}

export interface CommitInfo {
  sha: string;
  date: string;
  message: string;
  files: string[];
}

/** The history of the default branch (newest first), optionally only the commits that touched `path`. */
export async function gitLog(repo: RepoRef, token?: string, path?: string, limit = 30): Promise<CommitInfo[]> {
  const octokit = await octokitFor(token);
  const { data } = await octokit.rest.repos.listCommits({ owner: repo.owner, repo: repo.name, per_page: limit, ...(path ? { path } : {}) });
  return Promise.all(
    data.map(async (c) => {
      const { data: full } = await octokit.rest.repos.getCommit({ owner: repo.owner, repo: repo.name, ref: c.sha });
      return { sha: c.sha.slice(0, 7), date: c.commit.author?.date ?? "", message: c.commit.message, files: (full.files ?? []).map((f) => `${f.status} ${f.filename}`) };
    }),
  );
}

/** One commit with its diff. Vendored files are summarised, not shown in full. */
export async function gitShow(repo: RepoRef, sha: string, token?: string): Promise<string> {
  const octokit = await octokitFor(token);
  const { data } = await octokit.rest.repos.getCommit({ owner: repo.owner, repo: repo.name, ref: sha });
  let budget = 24_000;
  const parts = [`commit ${data.sha.slice(0, 7)}  ${data.commit.author?.date ?? ""}\n${data.commit.message}\n`];
  for (const f of data.files ?? []) {
    const vendored = SKIP.test(f.filename);
    const patch = vendored ? "" : (f.patch ?? "").slice(0, Math.max(0, Math.min(8_000, budget)));
    budget -= patch.length;
    parts.push(`--- ${f.status} ${f.filename} (+${f.additions} -${f.deletions})${vendored ? " [vendored file, diff not shown]" : ""}\n${patch}`);
  }
  return parts.join("\n");
}

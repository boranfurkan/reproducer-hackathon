
export interface RepoRef {
  owner: string;
  name: string;
}

export interface RepoDigest {
  files: { path: string; content: string }[];
  truncated: boolean;
}

const WANTED = /^(README\.md|package\.json|vite\.config\.[jt]s|playwright\.config\.[jt]s|(src|server|tests|app|pages|lib)\/.+\.(js|jsx|ts|tsx|css|json|md))$/;
const MAX_FILE = 20_000;
const MAX_TOTAL = 120_000;

/** Read the text files the model needs from GitHub (default branch). Token is optional for public repos. */
export async function readRepoDigest(repo: RepoRef, token?: string): Promise<RepoDigest> {
  // octokit is ESM-only; a dynamic import also works when this file is loaded as CommonJS (tsx scripts).
  const { Octokit } = await import("octokit");
  // Fail fast on a GitHub rate limit instead of letting the throttling plugin hold the request for up to an hour.
  const octokit = new Octokit({ ...(token ? { auth: token } : {}), throttle: { onRateLimit: () => false, onSecondaryRateLimit: () => false } });
  const { data: info } = await octokit.rest.repos.get({ owner: repo.owner, repo: repo.name });
  const { data: tree } = await octokit.rest.git.getTree({
    owner: repo.owner,
    repo: repo.name,
    tree_sha: info.default_branch,
    recursive: "true",
  });
  const wanted = tree.tree.filter((n) => n.type === "blob" && n.path && WANTED.test(n.path) && (n.size ?? 0) <= MAX_FILE);
  const files: RepoDigest["files"] = [];
  let total = 0;
  let truncated = false;
  for (const n of wanted) {
    if (total + (n.size ?? 0) > MAX_TOTAL) { truncated = true; break; }
    let content: string;
    if (token) {
      const { data } = await octokit.rest.git.getBlob({ owner: repo.owner, repo: repo.name, file_sha: n.sha! });
      content = Buffer.from(data.content, "base64").toString("utf8");
    } else {
      // Public repository without a token: raw.githubusercontent.com does not count against the 60 requests per hour API limit.
      const res = await fetch(`https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${info.default_branch}/${n.path}`);
      if (!res.ok) throw new Error(`Could not read ${n.path} (${res.status})`);
      content = await res.text();
    }
    files.push({ path: n.path!, content });
    total += content.length;
  }
  return { files, truncated };
}

export function formatDigest(d: RepoDigest): string {
  return d.files.map((f) => `=== ${f.path}\n${f.content}`).join("\n\n") + (d.truncated ? "\n\n[digest truncated]" : "");
}

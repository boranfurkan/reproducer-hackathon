import type { Octokit } from "octokit";

/** `baseUrl` is only for tests (a local mock of the GitHub API). octokit is ESM-only, so it is imported dynamically. */
export async function octokitFor(token: string, baseUrl?: string): Promise<Octokit> {
  const { Octokit } = await import("octokit");
  return new Octokit({ auth: token, ...(baseUrl ? { baseUrl } : {}) });
}

export interface RepoSummary {
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  openIssues: number;
  updatedAt: string | null;
}

export async function listRepos(token: string): Promise<RepoSummary[]> {
  const { data } = await (await octokitFor(token)).rest.repos.listForAuthenticatedUser({
    sort: "updated",
    per_page: 60,
    affiliation: "owner,collaborator,organization_member",
  });
  return data.map((r) => ({
    fullName: r.full_name,
    owner: r.owner.login,
    name: r.name,
    description: r.description,
    isPrivate: r.private,
    openIssues: r.open_issues_count,
    updatedAt: r.updated_at ?? null,
  }));
}

export interface IssueSummary {
  number: number;
  title: string;
  body: string;
  author: string | null;
  createdAt: string;
  comments: number;
  url: string;
}

export async function listIssues(token: string, owner: string, repo: string): Promise<IssueSummary[]> {
  const { data } = await (await octokitFor(token)).rest.issues.listForRepo({ owner, repo, state: "open", per_page: 50 });
  return data.filter((i) => !i.pull_request).map(toIssue);
}

export async function getIssue(token: string, owner: string, repo: string, number: number): Promise<IssueSummary> {
  const { data } = await (await octokitFor(token)).rest.issues.get({ owner, repo, issue_number: number });
  return toIssue(data);
}

function toIssue(i: { number: number; title: string; body?: string | null; user?: { login: string } | null; created_at: string; comments: number; html_url: string }): IssueSummary {
  return { number: i.number, title: i.title, body: i.body ?? "", author: i.user?.login ?? null, createdAt: i.created_at, comments: i.comments, url: i.html_url };
}

export interface PullRequestInput {
  token: string;
  owner: string;
  repo: string;
  issueNumber: number;
  title: string;
  body: string;
  files: { path: string; content: string }[];
  /** Tests only. */
  baseUrl?: string;
}

/**
 * Create a branch from the default branch, commit the files in one commit and open a pull request.
 * Commits are authored by the token's owner. Nothing is merged.
 */
export async function openFixPullRequest(input: PullRequestInput): Promise<{ url: string; number: number; branch: string }> {
  const gh = (await octokitFor(input.token, input.baseUrl)).rest;
  const { owner, repo } = input;
  const { data: info } = await gh.repos.get({ owner, repo });
  const base = info.default_branch;
  const { data: ref } = await gh.git.getRef({ owner, repo, ref: `heads/${base}` });
  const { data: baseCommit } = await gh.git.getCommit({ owner, repo, commit_sha: ref.object.sha });

  const branch = `reproducer/issue-${input.issueNumber}-${Date.now().toString(36)}`;
  await gh.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: ref.object.sha });

  const { data: tree } = await gh.git.createTree({
    owner,
    repo,
    base_tree: baseCommit.tree.sha,
    tree: input.files.map((f) => ({ path: f.path, mode: "100644" as const, type: "blob" as const, content: f.content })),
  });
  const { data: commit } = await gh.git.createCommit({
    owner,
    repo,
    message: `${input.title}\n\nFixes #${input.issueNumber}`,
    tree: tree.sha,
    parents: [ref.object.sha],
  });
  await gh.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.sha });

  const { data: pr } = await gh.pulls.create({ owner, repo, title: input.title, head: branch, base, body: input.body });
  return { url: pr.html_url, number: pr.number, branch };
}

/** Marker in the comments ReProducer writes, so its own words are never read back as reviewer feedback. */
export const BOT_MARKER = "<!-- reproducer -->";

export interface PrFeedback {
  author: string;
  kind: "review" | "inline" | "comment";
  /** For a review: APPROVED, CHANGES_REQUESTED or COMMENTED. */
  state?: string;
  path?: string;
  line?: number;
  body: string;
}

/** What reviewers wrote on a pull request: review summaries, inline comments on the code, and conversation comments (read-only). */
export async function listPrFeedback(token: string, owner: string, repo: string, number: number, baseUrl?: string): Promise<PrFeedback[]> {
  const gh = (await octokitFor(token, baseUrl)).rest;
  const [reviews, inline, comments] = await Promise.all([
    gh.pulls.listReviews({ owner, repo, pull_number: number, per_page: 50 }),
    gh.pulls.listReviewComments({ owner, repo, pull_number: number, per_page: 50 }),
    gh.issues.listComments({ owner, repo, issue_number: number, per_page: 50 }),
  ]);
  const clip = (s: string) => s.slice(0, 1200);
  return [
    ...reviews.data.filter((r) => r.body && r.state !== "PENDING").map((r) => ({ author: r.user?.login ?? "?", kind: "review" as const, state: r.state, body: clip(r.body!) })),
    ...inline.data.map((c) => ({ author: c.user?.login ?? "?", kind: "inline" as const, path: c.path, line: c.line ?? c.original_line ?? undefined, body: clip(c.body) })),
    ...comments.data.map((c) => ({ author: c.user?.login ?? "?", kind: "comment" as const, body: clip(c.body ?? "") })),
  ].filter((f) => f.body && !f.body.includes(BOT_MARKER));
}

/** Add a commit to the branch of an open pull request (the revision the developer approved). */
export async function pushToBranch(input: { token: string; owner: string; repo: string; branch: string; message: string; files: { path: string; content: string }[]; baseUrl?: string }): Promise<{ sha: string; url: string }> {
  const gh = (await octokitFor(input.token, input.baseUrl)).rest;
  const { owner, repo } = input;
  const { data: ref } = await gh.git.getRef({ owner, repo, ref: `heads/${input.branch}` });
  const { data: head } = await gh.git.getCommit({ owner, repo, commit_sha: ref.object.sha });
  const { data: tree } = await gh.git.createTree({
    owner,
    repo,
    base_tree: head.tree.sha,
    tree: input.files.map((f) => ({ path: f.path, mode: "100644" as const, type: "blob" as const, content: f.content })),
  });
  const { data: commit } = await gh.git.createCommit({ owner, repo, message: input.message, tree: tree.sha, parents: [ref.object.sha] });
  await gh.git.updateRef({ owner, repo, ref: `heads/${input.branch}`, sha: commit.sha });
  return { sha: commit.sha, url: commit.html_url };
}

/** A comment on an issue (the developer's reply to the reporter, posted only after they approve it). */
export async function commentOnIssue(token: string, owner: string, repo: string, number: number, body: string, baseUrl?: string): Promise<{ url: string }> {
  const gh = (await octokitFor(token, baseUrl)).rest;
  const { data } = await gh.issues.createComment({ owner, repo, issue_number: number, body: `${body}\n\n${BOT_MARKER}` });
  return { url: data.html_url };
}

export async function commentOnPr(token: string, owner: string, repo: string, number: number, body: string, baseUrl?: string): Promise<void> {
  const gh = (await octokitFor(token, baseUrl)).rest;
  await gh.issues.createComment({ owner, repo, issue_number: number, body: `${body}\n\n${BOT_MARKER}` });
}

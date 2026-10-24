import { Octokit } from "octokit";

export function octokitFor(token: string): Octokit {
  return new Octokit({ auth: token });
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
  const { data } = await octokitFor(token).rest.repos.listForAuthenticatedUser({
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
  const { data } = await octokitFor(token).rest.issues.listForRepo({ owner, repo, state: "open", per_page: 50 });
  return data.filter((i) => !i.pull_request).map(toIssue);
}

export async function getIssue(token: string, owner: string, repo: string, number: number): Promise<IssueSummary> {
  const { data } = await octokitFor(token).rest.issues.get({ owner, repo, issue_number: number });
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
}

/**
 * Create a branch from the default branch, commit the files in one commit and open a pull request.
 * Commits are authored by the token's owner. Nothing is merged.
 */
export async function openFixPullRequest(input: PullRequestInput): Promise<{ url: string; number: number; branch: string }> {
  const gh = octokitFor(input.token).rest;
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

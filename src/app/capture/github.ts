/**
 * Minimal GitHub Contents API client for the capture and publish flows.
 *
 * Everything here runs in the browser with a fine-grained token the author pastes in
 * once. The token is scoped to Contents: read and write on exactly two repositories, so
 * the worst a leaked one can do is commit to this blog.
 */

export const OWNER = 'jamesjdougherty';
export const BLOG_REPO = 'dough-blog';
export const DRAFTS_REPO = 'dough-blog-drafts';
export const POSTS_PATH = 'src/content/posts.json';
export const DRAFTS_DIR = 'drafts';

const API = 'https://api.github.com';
const TOKEN_KEY = 'dough-capture-token';
const SAVED_AT_KEY = 'dough-capture-token-saved';

/**
 * How old a token has to be before the authoring pages mention it.
 *
 * This is a guess, and deliberately so. GitHub does send the real expiry date, as the
 * `github-authentication-token-expiration` response header — but that header is not in
 * the API's `Access-Control-Expose-Headers`, so the browser strips it before any of this
 * code can read it. Age since this device saved the token is the only honest signal
 * available without asking the author to type the date in by hand.
 */
export const TOKEN_STALE_DAYS = 60;

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

/* ---------- token ---------- */

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token.trim());
    localStorage.setItem(SAVED_AT_KEY, new Date().toISOString());
  } catch {
    /* Private mode; the token still applies for this page's lifetime. */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SAVED_AT_KEY);
  } catch {
    /* Nothing to do. */
  }
}

/** Whole days since this device saved its token, or null if that is not knowable. */
export function tokenAgeDays(): number | null {
  let saved: string | null;
  try {
    saved = localStorage.getItem(SAVED_AT_KEY);
  } catch {
    return null;
  }
  if (!saved) {
    return null;
  }
  const elapsed = Date.now() - Date.parse(saved);
  return Number.isFinite(elapsed) && elapsed >= 0
    ? Math.floor(elapsed / 86_400_000)
    : null;
}

/* ---------- base64 that survives emoji ---------- */

/**
 * The Contents API takes base64. btoa() throws on anything outside Latin-1, and these
 * posts contain emoji and accented characters, so encode through UTF-8 bytes first.
 */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function fromBase64(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ---------- requests ---------- */

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const token = readToken();
  if (!token) {
    throw new GitHubError('No token saved on this device.', 401);
  }

  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers
    }
  });

  if (!response.ok) {
    // An expired or revoked token fails every later call the same way, so drop it here
    // and let the pages fall back to the paste screen instead of retrying with it.
    if (response.status === 401) {
      clearToken();
    }
    throw new GitHubError(await describeFailure(response), response.status);
  }
  return response;
}

async function describeFailure(response: Response): Promise<string> {
  // A fine-grained token that cannot see a repository gets 404, not 403 — say so,
  // because "not found" sends people looking for the wrong problem.
  if (response.status === 401) {
    return 'That token was rejected. It may have expired or been revoked.';
  }
  if (response.status === 404) {
    return 'Not found — most often the token does not list this repository.';
  }
  if (response.status === 409) {
    return 'The file changed since it was read.';
  }
  if (response.status === 422) {
    return 'GitHub rejected the commit as invalid.';
  }
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `GitHub returned ${response.status}.`;
  } catch {
    return `GitHub returned ${response.status}.`;
  }
}

/* ---------- repository metadata ---------- */

const branchCache = new Map<string, string>();

/** dough-blog is on master and dough-blog-drafts is on main, so never assume. */
export async function defaultBranch(repo: string): Promise<string> {
  const cached = branchCache.get(repo);
  if (cached) {
    return cached;
  }
  const response = await request(`/repos/${OWNER}/${repo}`);
  const body = (await response.json()) as { default_branch: string };
  branchCache.set(repo, body.default_branch);
  return body.default_branch;
}

/** Cheap round-trip used to validate a freshly pasted token against both repos. */
export async function checkAccess(): Promise<void> {
  await Promise.all([defaultBranch(BLOG_REPO), defaultBranch(DRAFTS_REPO)]);
}

/* ---------- file operations ---------- */

export interface RemoteFile {
  text: string;
  sha: string;
}

export async function readFile(repo: string, path: string): Promise<RemoteFile> {
  const response = await request(`/repos/${OWNER}/${repo}/contents/${path}`);
  const body = (await response.json()) as { content: string; sha: string };
  return { text: fromBase64(body.content), sha: body.sha };
}

export async function writeFile(
  repo: string,
  path: string,
  text: string,
  message: string,
  sha?: string
): Promise<string> {
  const branch = await defaultBranch(repo);
  const response = await request(`/repos/${OWNER}/${repo}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: toBase64(text),
      branch,
      ...(sha ? { sha } : {})
    })
  });
  const body = (await response.json()) as { commit: { sha: string } };
  return body.commit.sha;
}

export async function deleteFile(
  repo: string,
  path: string,
  sha: string,
  message: string
): Promise<void> {
  const branch = await defaultBranch(repo);
  await request(`/repos/${OWNER}/${repo}/contents/${path}`, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha, branch })
  });
}

export interface DirEntry {
  name: string;
  path: string;
  sha: string;
}

/** An empty drafts directory does not exist as far as git is concerned; that is not an error. */
export async function listDir(repo: string, path: string): Promise<DirEntry[]> {
  try {
    const response = await request(`/repos/${OWNER}/${repo}/contents/${path}`);
    const body = (await response.json()) as DirEntry[];
    return Array.isArray(body) ? body : [];
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) {
      return [];
    }
    throw error;
  }
}

import { Post } from '../blog/posts';
import {
  BLOG_REPO,
  DRAFTS_DIR,
  DRAFTS_REPO,
  POSTS_PATH,
  deleteFile,
  listDir,
  readFile,
  writeFile
} from './github';

export interface Draft {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  /** Raw text as typed; blank lines separate paragraphs. */
  body: string;
  tags: string[];
  date: string;
}

const QUEUE_KEY = 'dough-capture-queue';

/* ---------- pure helpers ---------- */

/** Filename-safe and lexicographically sortable, so drafts list newest-last by name. */
export function draftId(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

export function draftPath(id: string): string {
  return `${DRAFTS_DIR}/${id}.json`;
}

export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Blank lines separate paragraphs, matching the shape blog posts already use. */
export function toParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim().replace(/\s*\n\s*/g, ' '))
    .filter(paragraph => paragraph.length > 0);
}

/** Must satisfy the slug rule the content tests enforce: ^[a-z0-9]+(-[a-z0-9]+)*$ */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Appends -2, -3 … until the slug is free. */
export function uniqueSlug(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) {
    return base;
  }
  let n = 2;
  while (taken.includes(`${base}-${n}`)) {
    n++;
  }
  return `${base}-${n}`;
}

export function draftToPost(draft: Draft, taken: readonly string[]): Post {
  return {
    slug: uniqueSlug(slugify(draft.title), taken),
    title: draft.title.trim(),
    date: draft.date,
    tags: draft.tags.map(tag => tag.trim()).filter(Boolean),
    body: toParagraphs(draft.body)
  };
}

/**
 * The same rules posts.spec.ts enforces in CI. Checking here means a bad post is refused
 * in the UI rather than committed and then failing the build, which would leave the post
 * in the repository but never live.
 */
export function validateForPublish(draft: Draft): string[] {
  const problems: string[] = [];
  if (!draft.title.trim()) {
    problems.push('A published post needs a title.');
  } else if (!slugify(draft.title)) {
    problems.push('That title has no letters or numbers to build a link from.');
  }
  if (draft.tags.filter(tag => tag.trim()).length === 0) {
    problems.push('Pick at least one tag.');
  }
  if (toParagraphs(draft.body).length === 0) {
    problems.push('There is nothing written yet.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
    problems.push('The date is not a real calendar date.');
  }
  return problems;
}

/* ---------- offline queue ---------- */

export function readQueue(): Draft[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Draft[]) : [];
  } catch {
    return [];
  }
}

export function writeQueue(drafts: Draft[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(drafts));
  } catch {
    /* Storage unavailable; the draft stays in memory only. */
  }
}

export function enqueue(draft: Draft): void {
  const queue = readQueue().filter(item => item.id !== draft.id);
  queue.push(draft);
  writeQueue(queue);
}

/* ---------- remote operations ---------- */

export async function saveDraft(draft: Draft): Promise<void> {
  const path = draftPath(draft.id);
  let sha: string | undefined;
  try {
    sha = (await readFile(DRAFTS_REPO, path)).sha;
  } catch {
    // Not there yet; this is a create.
  }
  await writeFile(
    DRAFTS_REPO,
    path,
    JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }, null, 2) + '\n',
    sha ? `Update draft ${draft.id}` : `Capture draft ${draft.id}`,
    sha
  );
}

/** Sends every queued draft, keeping any that still fail so nothing is silently dropped. */
export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  const queue = readQueue();
  const stuck: Draft[] = [];
  let sent = 0;

  for (const draft of queue) {
    try {
      await saveDraft(draft);
      sent++;
    } catch {
      stuck.push(draft);
    }
  }

  writeQueue(stuck);
  return { sent, failed: stuck.length };
}

export async function listDrafts(): Promise<Draft[]> {
  const entries = await listDir(DRAFTS_REPO, DRAFTS_DIR);
  const drafts: Draft[] = [];
  for (const entry of entries.filter(item => item.name.endsWith('.json'))) {
    try {
      drafts.push(JSON.parse((await readFile(DRAFTS_REPO, entry.path)).text) as Draft);
    } catch {
      // A hand-edited or truncated file should not hide the rest.
    }
  }
  return drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteDraft(id: string): Promise<void> {
  const path = draftPath(id);
  const { sha } = await readFile(DRAFTS_REPO, path);
  await deleteFile(DRAFTS_REPO, path, sha, `Publish draft ${id}`);
}

/**
 * Read posts.json, put the new post at the front, write it back. Retries once on a
 * conflict, which is what a stale sha looks like when something else committed first.
 */
export async function publish(draft: Draft): Promise<Post> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const file = await readFile(BLOG_REPO, POSTS_PATH);
    const posts = JSON.parse(file.text) as Post[];
    const post = draftToPost(draft, posts.map(item => item.slug));

    try {
      await writeFile(
        BLOG_REPO,
        POSTS_PATH,
        JSON.stringify([post, ...posts], null, 2) + '\n',
        `Add post: ${post.title}`,
        file.sha
      );
      return post;
    } catch (error) {
      const conflict =
        error instanceof Error && 'status' in error && (error as { status: number }).status === 409;
      if (!conflict || attempt === 1) {
        throw error;
      }
    }
  }
  throw new Error('Could not publish after a retry.');
}

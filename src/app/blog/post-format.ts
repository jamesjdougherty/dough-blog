import { Post } from './posts';

const WORDS_PER_MINUTE = 220;

/** Renders an ISO date as e.g. "August 29, 2026" without pulling in a locale pipe. */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export function readingTime(post: Pick<Post, 'body'>): number {
  const words = post.body.reduce(
    (total, paragraph) => total + paragraph.split(/\s+/).length,
    0
  );
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

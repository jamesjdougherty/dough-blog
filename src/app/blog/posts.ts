import postsData from '../../content/posts.json';

export interface Post {
  slug: string;
  title: string;
  /** ISO date, used for sorting and for the <time> element. */
  date: string;
  tags: string[];
  body: string[];
}

/**
 * Post content lives in content/posts.json rather than in this file so it can be
 * written programmatically — generating JSON is safe, generating TypeScript source
 * means emitting escaped string literals. The JSON is imported, not fetched, so it
 * still compiles into the bundle and readers make no extra request.
 */
export const POSTS: Post[] = postsData;

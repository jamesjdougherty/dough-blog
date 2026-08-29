import { POSTS, Post } from './posts';

/**
 * Content integrity. posts.json is data rather than source, and is meant to be written
 * programmatically, so these guard the shape a malformed entry could break before it
 * reaches a deploy.
 */
describe('POSTS content', () => {
  it('is a non-empty list', () => {
    expect(POSTS.length).toBeGreaterThan(0);
  });

  it('gives every post a unique slug', () => {
    const slugs = POSTS.map(post => post.slug);
    expect(new Set(slugs).size).toEqual(slugs.length);
  });

  it('uses lowercase kebab-case slugs', () => {
    for (const post of POSTS) {
      expect(post.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('gives every post a non-empty title', () => {
    for (const post of POSTS) {
      expect(post.title.trim().length).toBeGreaterThan(0);
    }
  });

  it('dates every post as a real calendar date', () => {
    for (const post of POSTS) {
      expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const [year, month, day] = post.date.split('-').map(Number);
      const parsed = new Date(year, month - 1, day);
      // Round-trips only if the date actually exists — catches 2026-02-31.
      expect(parsed.getFullYear()).toEqual(year);
      expect(parsed.getMonth()).toEqual(month - 1);
      expect(parsed.getDate()).toEqual(day);
    }
  });

  it('gives every post at least one paragraph, none of them blank', () => {
    for (const post of POSTS) {
      expect(post.body.length).toBeGreaterThan(0);
      for (const paragraph of post.body) {
        expect(paragraph.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('gives every post at least one non-blank tag', () => {
    for (const post of POSTS) {
      expect(post.tags.length).toBeGreaterThan(0);
      for (const tag of post.tags) {
        expect(tag.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('carries no keys beyond the Post interface', () => {
    const allowed: (keyof Post)[] = ['slug', 'title', 'date', 'tags', 'body'];
    for (const post of POSTS) {
      expect(Object.keys(post).sort()).toEqual([...allowed].sort());
    }
  });
});

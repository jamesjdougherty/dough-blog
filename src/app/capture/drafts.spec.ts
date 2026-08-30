import { POSTS } from '../blog/posts';
import {
  Draft,
  draftId,
  draftPath,
  draftToExistingPost,
  postToDraft,
  slugify,
  toParagraphs,
  today,
  uniqueSlug,
  draftToPost,
  validateForPublish
} from './drafts';
import { fromBase64, toBase64 } from './github';

function draft(overrides: Partial<Draft> = {}): Draft {
  const now = new Date().toISOString();
  return {
    id: 'x',
    createdAt: now,
    updatedAt: now,
    title: 'A Fine Title',
    body: 'First paragraph.\n\nSecond paragraph.',
    tags: ['Musings'],
    date: '2026-08-29',
    ...overrides
  };
}

describe('base64 encoding', () => {
  it('round-trips text the posts actually contain', () => {
    // btoa() alone throws on all of these.
    for (const text of ['plain', 'emoji 🚧 and 😂', 'bebé', 'em — dash', '"quotes" and \'apostrophes\'']) {
      expect(fromBase64(toBase64(text))).toEqual(text);
    }
  });

  it('produces something GitHub would accept', () => {
    expect(toBase64('hi')).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });
});

describe('toParagraphs', () => {
  it('splits on blank lines', () => {
    expect(toParagraphs('one\n\ntwo')).toEqual(['one', 'two']);
  });

  it('joins soft-wrapped lines into one paragraph', () => {
    expect(toParagraphs('a line\nand its continuation')).toEqual(['a line and its continuation']);
  });

  it('drops empty and whitespace-only paragraphs', () => {
    expect(toParagraphs('one\n\n   \n\ntwo\n\n\n')).toEqual(['one', 'two']);
  });

  it('returns nothing for blank input', () => {
    expect(toParagraphs('   \n\n  ')).toEqual([]);
  });
});

describe('slugify', () => {
  it('matches the slug rule the content tests enforce', () => {
    const pattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    for (const title of ['Java vs C#', 'i3 + Tmux', 'Happy New Year!', 'Schedule: Makers VS Managers']) {
      expect(slugify(title)).withContext(title).toMatch(pattern);
    }
  });

  it('strips accents rather than dropping the letter', () => {
    expect(slugify('bebé days')).toEqual('bebe-days');
  });

  it('returns empty when a title has nothing to build from', () => {
    expect(slugify('!!! ???')).toEqual('');
  });
});

describe('uniqueSlug', () => {
  it('keeps a free slug unchanged', () => {
    expect(uniqueSlug('fresh', ['taken'])).toEqual('fresh');
  });

  it('suffixes until it finds a gap', () => {
    expect(uniqueSlug('post', ['post'])).toEqual('post-2');
    expect(uniqueSlug('post', ['post', 'post-2'])).toEqual('post-3');
  });

  it('avoids colliding with real posts', () => {
    const slugs = POSTS.map(post => post.slug);
    expect(slugs).toContain('algorithms');
    expect(uniqueSlug('algorithms', slugs)).toEqual('algorithms-2');
  });
});

describe('draftToPost', () => {
  it('produces a post that satisfies the content rules', () => {
    const post = draftToPost(draft(), POSTS.map(p => p.slug));
    expect(post.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(post.title.length).toBeGreaterThan(0);
    expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(post.tags.length).toBeGreaterThan(0);
    expect(post.body).toEqual(['First paragraph.', 'Second paragraph.']);
    expect(Object.keys(post).sort()).toEqual(['body', 'date', 'slug', 'tags', 'title']);
  });

  it('drops blank tags', () => {
    const post = draftToPost(draft({ tags: ['Musings', '  '] }), []);
    expect(post.tags).toEqual(['Musings']);
  });
});

describe('editing a published post', () => {
  it('round-trips a real post through the editor without changing it', () => {
    for (const post of POSTS) {
      expect(draftToExistingPost(postToDraft(post), post.slug)).toEqual(post);
    }
  });

  it('keeps the published slug even when the title changes', () => {
    const edited = { ...postToDraft(POSTS[0]), title: 'A Completely Different Title' };
    const post = draftToExistingPost(edited, POSTS[0].slug);

    expect(post.slug).toEqual(POSTS[0].slug);
    expect(post.title).toEqual('A Completely Different Title');
  });

  it('keeps the slug even when the new title would not produce one', () => {
    const edited = { ...postToDraft(POSTS[0]), title: '!!!' };
    expect(draftToExistingPost(edited, POSTS[0].slug).slug).toEqual(POSTS[0].slug);
  });

  it('re-splits an edited body into paragraphs', () => {
    const edited = { ...postToDraft(POSTS[0]), body: 'One.\n\nTwo.\n\nThree.' };
    expect(draftToExistingPost(edited, POSTS[0].slug).body).toEqual(['One.', 'Two.', 'Three.']);
  });

  it('produces a post that still satisfies the content rules', () => {
    const post = draftToExistingPost(postToDraft(POSTS[0]), POSTS[0].slug);

    expect(post.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(post.title.trim().length).toBeGreaterThan(0);
    expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(post.tags.length).toBeGreaterThan(0);
    expect(post.body.length).toBeGreaterThan(0);
    expect(Object.keys(post).sort()).toEqual(['body', 'date', 'slug', 'tags', 'title']);
  });
});

describe('validateForPublish', () => {
  it('passes a complete draft', () => {
    expect(validateForPublish(draft())).toEqual([]);
  });

  it('requires a title', () => {
    expect(validateForPublish(draft({ title: '  ' })).length).toBeGreaterThan(0);
  });

  it('rejects a title with no usable characters', () => {
    expect(validateForPublish(draft({ title: '???' })).join(' ')).toContain('link');
  });

  it('requires at least one tag, matching what CI enforces', () => {
    expect(validateForPublish(draft({ tags: [] })).join(' ')).toContain('tag');
  });

  it('requires something written', () => {
    expect(validateForPublish(draft({ body: '  \n\n ' })).length).toBeGreaterThan(0);
  });

  it('rejects a malformed date', () => {
    expect(validateForPublish(draft({ date: '29-08-2026' })).length).toBeGreaterThan(0);
  });
});

describe('identifiers', () => {
  it('builds a filename-safe, sortable draft id', () => {
    const id = draftId(new Date('2026-08-29T01:30:00.000Z'));
    expect(id).toEqual('2026-08-29T01-30-00-000Z');
    expect(id).not.toContain(':');
    expect(draftPath(id)).toEqual('drafts/2026-08-29T01-30-00-000Z.json');
  });

  it('sorts ids chronologically as plain strings', () => {
    const earlier = draftId(new Date('2026-08-29T01:00:00Z'));
    const later = draftId(new Date('2026-08-29T02:00:00Z'));
    expect([later, earlier].sort()).toEqual([earlier, later]);
  });

  it('formats today in the local calendar, not UTC', () => {
    const value = today(new Date(2026, 7, 29, 23, 30));
    expect(value).toEqual('2026-08-29');
  });
});

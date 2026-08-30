import { Component, ChangeDetectionStrategy, computed, signal } from '@angular/core';
import { POSTS, Post } from '../blog/posts';
import { PostCardComponent } from '../blog/post-card.component';
import {
  Draft,
  deleteDraft,
  deletePost,
  draftId,
  draftToExistingPost,
  draftToPost,
  listDrafts,
  listPosts,
  postToDraft,
  publish,
  saveDraft,
  slugify,
  today,
  toParagraphs,
  uniqueSlug,
  updatePost,
  validateForPublish
} from '../capture/drafts';
import {
  GitHubError,
  TOKEN_STALE_DAYS,
  checkAccess,
  clearToken,
  readToken,
  tokenAgeDays,
  writeToken
} from '../capture/github';

type View = 'list' | 'edit';
type Tab = 'drafts' | 'published';
type Status = { kind: 'idle' | 'working' | 'ok' | 'error'; text: string; href?: string };

/** What `editing` currently holds: an unpublished draft, or a post already live. */
type Editing = { draft: Draft; slug: string | null };

const EDIT_KEY = 'dough-admin-editing';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [PostCardComponent],
  templateUrl: './admin.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./admin.component.css']
})
export class AdminComponent {
  readonly hasToken = signal(readToken() !== null);
  readonly tokenInput = signal('');
  readonly checkingToken = signal(false);
  readonly tokenAge = signal(tokenAgeDays());

  /** Null age means a token saved before this was tracked; say nothing rather than guess. */
  readonly tokenStale = computed(() => {
    const age = this.tokenAge();
    return age !== null && age >= TOKEN_STALE_DAYS;
  });

  readonly view = signal<View>('list');
  readonly tab = signal<Tab>('drafts');
  readonly drafts = signal<Draft[]>([]);
  readonly loadingDrafts = signal(false);
  readonly status = signal<Status>({ kind: 'idle', text: '' });
  readonly confirming = signal(false);
  readonly confirmingDelete = signal(false);

  /** The draft being edited. Null until New post or a list row opens one. */
  readonly editing = signal<Draft | null>(null);
  readonly isNew = signal(false);

  /**
   * The slug this edit belongs to when a *published* post is open, null for a draft. Set
   * only through `open()`, so the two signals cannot drift apart.
   */
  readonly editingSlug = signal<string | null>(null);

  /** The live posts as read from the repository. Empty until fetched. */
  readonly posts = signal<Post[]>([]);
  readonly loadingPosts = signal(false);

  /**
   * Tags to offer as chips. The fetched posts are the truth, but the bundled snapshot is a
   * reasonable stand-in before the first fetch lands, and identical in the common case.
   */
  readonly knownTags = computed(() => {
    const source = this.posts().length ? this.posts() : POSTS;
    return [...new Set(source.flatMap(post => post.tags))].sort((a, b) => a.localeCompare(b));
  });

  private readonly existingSlugs = computed(() =>
    (this.posts().length ? this.posts() : POSTS).map(post => post.slug)
  );

  /** The post exactly as it would be committed, so the preview cannot drift from reality. */
  readonly preview = computed<Post | null>(() => {
    const draft = this.editing();
    if (!draft) {
      return null;
    }
    const slug = this.editingSlug();
    const post = slug
      ? draftToExistingPost(draft, slug)
      : draftToPost(draft, this.existingSlugs());
    return post.body.length ? post : { ...post, body: ['…'] };
  });

  readonly problems = computed(() => {
    const draft = this.editing();
    return draft ? validateForPublish(draft) : [];
  });

  readonly slugPreview = computed(() => {
    const draft = this.editing();
    if (!draft) {
      return '';
    }
    // A published post keeps the slug it has; only a draft is still choosing one.
    const slug = this.editingSlug();
    if (slug) {
      return slug;
    }
    const base = slugify(draft.title);
    return base ? uniqueSlug(base, this.existingSlugs()) : '';
  });

  constructor() {
    if (this.hasToken()) {
      void this.refresh();
    }
    const resumed = restoreEditing();
    if (resumed) {
      this.editing.set(resumed.draft);
      this.editingSlug.set(resumed.slug);
      this.view.set('edit');
    }
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  /* ---------- token ---------- */

  async saveToken(): Promise<void> {
    const token = this.tokenInput().trim();
    if (!token) {
      return;
    }
    this.checkingToken.set(true);
    writeToken(token);
    try {
      await checkAccess();
      this.hasToken.set(true);
      this.tokenAge.set(tokenAgeDays());
      this.tokenInput.set('');
      await this.refresh();
    } catch (error) {
      clearToken();
      this.status.set({ kind: 'error', text: describe(error) });
    } finally {
      this.checkingToken.set(false);
    }
  }

  forgetToken(): void {
    clearToken();
    this.hasToken.set(false);
    this.tokenAge.set(null);
    this.drafts.set([]);
  }

  /**
   * A dead token is only discovered mid-request, inside a call this page did not make
   * directly, so re-read after any failure and fall back to the gate if it was dropped.
   * Whatever is being edited stays in `editing`, and comes back when a new token is in.
   */
  private syncToken(): void {
    if (readToken() === null) {
      this.hasToken.set(false);
      this.tokenAge.set(null);
    }
  }

  /* ---------- list ---------- */

  async refresh(): Promise<void> {
    this.loadingDrafts.set(true);
    try {
      this.drafts.set(await listDrafts());
      this.status.set({ kind: 'idle', text: '' });
    } catch (error) {
      this.status.set({ kind: 'error', text: describe(error) });
      this.syncToken();
    } finally {
      this.loadingDrafts.set(false);
    }
  }

  async refreshPosts(): Promise<void> {
    this.loadingPosts.set(true);
    try {
      this.posts.set(await listPosts());
      this.status.set({ kind: 'idle', text: '' });
    } catch (error) {
      this.status.set({ kind: 'error', text: describe(error) });
      this.syncToken();
    } finally {
      this.loadingPosts.set(false);
    }
  }

  /** Fetches the published list the first time that tab is opened, then on demand. */
  showTab(tab: Tab): void {
    this.tab.set(tab);
    if (tab === 'published' && this.posts().length === 0 && !this.loadingPosts()) {
      void this.refreshPosts();
    }
  }

  startNew(): void {
    const now = new Date().toISOString();
    this.open(
      { id: draftId(), createdAt: now, updatedAt: now, title: '', body: '', tags: [], date: today() },
      true
    );
  }

  open(draft: Draft, isNew = false): void {
    this.openEditing({ draft, slug: null }, isNew);
  }

  /** Opens a post that is already live. Its slug is carried along and never recomputed. */
  openPost(post: Post): void {
    this.openEditing({ draft: postToDraft(post), slug: post.slug }, false);
  }

  private openEditing(editing: Editing, isNew: boolean): void {
    this.editing.set(editing.draft);
    this.editingSlug.set(editing.slug);
    this.isNew.set(isNew);
    this.view.set('edit');
    this.confirming.set(false);
    this.confirmingDelete.set(false);
    this.status.set({ kind: 'idle', text: '' });
    rememberEditing(editing);
  }

  backToList(): void {
    this.editing.set(null);
    this.editingSlug.set(null);
    this.confirming.set(false);
    this.confirmingDelete.set(false);
    this.view.set('list');
    forgetEditing();
    void (this.tab() === 'published' ? this.refreshPosts() : this.refresh());
  }

  /** First non-empty line, for the list row. */
  summarise(draft: Draft): string {
    if (draft.title.trim()) {
      return draft.title.trim();
    }
    const [first] = toParagraphs(draft.body);
    return first ? first.slice(0, 80) : 'Empty draft';
  }

  /* ---------- editing ---------- */

  private patch(change: Partial<Draft>): void {
    this.editing.update(draft => {
      if (!draft) {
        return draft;
      }
      const next = { ...draft, ...change };
      rememberEditing({ draft: next, slug: this.editingSlug() });
      return next;
    });
  }

  setTitle(value: string): void {
    this.patch({ title: value });
  }

  setBody(value: string): void {
    this.patch({ body: value });
  }

  setDate(value: string): void {
    this.patch({ date: value });
  }

  toggleTag(tag: string): void {
    const draft = this.editing();
    if (!draft) {
      return;
    }
    this.patch({
      tags: draft.tags.includes(tag)
        ? draft.tags.filter(item => item !== tag)
        : [...draft.tags, tag]
    });
  }

  /* ---------- actions ---------- */

  async saveChanges(): Promise<void> {
    const draft = this.editing();
    if (!draft) {
      return;
    }
    const slug = this.editingSlug();
    this.status.set({ kind: 'working', text: 'Saving…' });
    try {
      if (slug) {
        // Editing something already live: this commit deploys.
        const post = await updatePost(slug, draft);
        this.posts.update(posts => posts.map(item => (item.slug === slug ? post : item)));
        this.status.set({
          kind: 'ok',
          text: `Updated "${post.title}". Live in about a minute.`,
          href: 'https://github.com/jamesjdougherty/dough-blog/actions'
        });
      } else {
        await saveDraft(draft);
        this.isNew.set(false);
        this.status.set({ kind: 'ok', text: 'Draft saved.' });
      }
    } catch (error) {
      this.status.set({ kind: 'error', text: describe(error) });
      this.syncToken();
    }
  }

  /** Removes a post that is already live. The only way to unpublish. */
  async confirmDeletePost(): Promise<void> {
    const slug = this.editingSlug();
    if (!slug) {
      return;
    }
    this.status.set({ kind: 'working', text: 'Removing…' });
    try {
      const post = await deletePost(slug);
      this.posts.update(posts => posts.filter(item => item.slug !== slug));
      forgetEditing();
      this.editing.set(null);
      this.editingSlug.set(null);
      this.confirmingDelete.set(false);
      this.view.set('list');
      this.status.set({
        kind: 'ok',
        text: `Removed "${post.title}". Gone from the site in about a minute.`,
        href: 'https://github.com/jamesjdougherty/dough-blog/actions'
      });
    } catch (error) {
      this.status.set({ kind: 'error', text: describe(error) });
      this.syncToken();
    }
  }

  async discard(): Promise<void> {
    const draft = this.editing();
    if (!draft) {
      return;
    }
    this.status.set({ kind: 'working', text: 'Discarding…' });
    try {
      if (!this.isNew()) {
        await deleteDraft(draft.id);
      }
      forgetEditing();
      this.editing.set(null);
      this.editingSlug.set(null);
      this.view.set('list');
      this.status.set({ kind: 'ok', text: 'Draft discarded.' });
      await this.refresh();
    } catch (error) {
      this.status.set({ kind: 'error', text: describe(error) });
      this.syncToken();
    }
  }

  /**
   * Publishes, then removes the draft. The delete is deliberately after the commit and
   * tolerant of failure: a published post with a leftover draft is a tidying problem, a
   * deleted draft that never published is lost writing.
   */
  async confirmPublish(): Promise<void> {
    const draft = this.editing();
    if (!draft) {
      return;
    }
    this.status.set({ kind: 'working', text: 'Publishing…' });
    try {
      const post = await publish(draft);
      let note = '';
      if (!this.isNew()) {
        try {
          await deleteDraft(draft.id);
        } catch {
          note = ' The draft could not be removed, so tidy it up when convenient.';
        }
      }
      forgetEditing();
      this.editing.set(null);
      this.editingSlug.set(null);
      this.confirming.set(false);
      this.view.set('list');
      // Keep the published list honest if it has been loaded; publish puts it at the front.
      this.posts.update(posts => (posts.length ? [post, ...posts] : posts));
      this.status.set({
        kind: 'ok',
        text: `Published "${post.title}". Live in about a minute.${note}`,
        href: 'https://github.com/jamesjdougherty/dough-blog/actions'
      });
      await this.refresh();
    } catch (error) {
      this.status.set({ kind: 'error', text: describe(error) });
      this.syncToken();
    }
  }
}

function rememberEditing(editing: Editing): void {
  try {
    localStorage.setItem(EDIT_KEY, JSON.stringify(editing));
  } catch {
    /* The draft is still on screen. */
  }
}

/**
 * Restores an interrupted edit. Entries written before published posts were editable are
 * a bare `Draft` rather than an `Editing`, so treat anything without a `draft` key as a
 * draft with no slug — otherwise an edit open across this deploy comes back empty.
 */
function restoreEditing(): Editing | null {
  try {
    const raw = localStorage.getItem(EDIT_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Editing | Draft;
    return 'draft' in parsed ? parsed : { draft: parsed, slug: null };
  } catch {
    return null;
  }
}

function forgetEditing(): void {
  try {
    localStorage.removeItem(EDIT_KEY);
  } catch {
    /* Nothing to do. */
  }
}

function describe(error: unknown): string {
  if (error instanceof GitHubError) {
    return error.message;
  }
  if (error instanceof TypeError) {
    return 'Could not reach GitHub.';
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

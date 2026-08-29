import { Component, ChangeDetectionStrategy, computed, signal } from '@angular/core';
import { POSTS } from '../blog/posts';
import {
  Draft,
  draftId,
  enqueue,
  flushQueue,
  publish,
  readQueue,
  saveDraft,
  slugify,
  today,
  toParagraphs,
  uniqueSlug,
  validateForPublish
} from './drafts';
import {
  GitHubError,
  TOKEN_STALE_DAYS,
  checkAccess,
  clearToken,
  readToken,
  tokenAgeDays,
  writeToken
} from './github';

type Status = { kind: 'idle' | 'working' | 'ok' | 'error'; text: string; href?: string };

const BODY_KEY = 'dough-capture-body';

@Component({
  selector: 'app-capture',
  standalone: true,
  imports: [],
  templateUrl: './capture.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./capture.component.css']
})
export class CaptureComponent {
  readonly hasToken = signal(readToken() !== null);
  readonly tokenInput = signal('');
  readonly checkingToken = signal(false);
  readonly tokenAge = signal(tokenAgeDays());

  /** Null age means a token saved before this was tracked; say nothing rather than guess. */
  readonly tokenStale = computed(() => {
    const age = this.tokenAge();
    return age !== null && age >= TOKEN_STALE_DAYS;
  });

  readonly title = signal('');
  readonly body = signal(restoreBody());
  readonly tags = signal<string[]>([]);
  readonly date = signal(today());

  readonly confirming = signal(false);
  readonly status = signal<Status>({ kind: 'idle', text: '' });
  readonly queued = signal(readQueue().length);
  readonly online = signal(navigator.onLine);

  /** Tags already in use, so the phone never has to type one. */
  readonly knownTags = [...new Set(POSTS.flatMap(post => post.tags))].sort((a, b) =>
    a.localeCompare(b)
  );

  private readonly existingSlugs = POSTS.map(post => post.slug);

  readonly paragraphCount = computed(() => toParagraphs(this.body()).length);

  readonly wordCount = computed(() => {
    const text = this.body().trim();
    return text ? text.split(/\s+/).length : 0;
  });

  readonly slugPreview = computed(() => {
    const base = slugify(this.title());
    return base ? uniqueSlug(base, this.existingSlugs) : '';
  });

  readonly canSave = computed(() => this.body().trim().length > 0);

  readonly publishProblems = computed(() => validateForPublish(this.currentDraft()));

  constructor() {
    addEventListener('online', () => {
      this.online.set(true);
      void this.drainQueue();
    });
    addEventListener('offline', () => this.online.set(false));

    if (this.hasToken() && this.queued() > 0 && this.online()) {
      void this.drainQueue();
    }
  }

  /** Reads the value off a native input event, so the page needs no forms module. */
  value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  /* ---------- token ---------- */

  async saveToken(): Promise<void> {
    const value = this.tokenInput().trim();
    if (!value) {
      return;
    }

    this.checkingToken.set(true);
    writeToken(value);
    try {
      await checkAccess();
      this.hasToken.set(true);
      this.tokenAge.set(tokenAgeDays());
      this.tokenInput.set('');
      this.status.set({ kind: 'ok', text: 'Token saved on this device.' });
      void this.drainQueue();
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
    this.status.set({ kind: 'idle', text: '' });
  }

  /**
   * A dead token is only discovered mid-request, inside a call this page did not make
   * directly, so re-read after any failure and fall back to the gate if it was dropped.
   */
  private syncToken(): void {
    if (readToken() === null) {
      this.hasToken.set(false);
      this.tokenAge.set(null);
    }
  }

  /* ---------- editing ---------- */

  updateBody(value: string): void {
    this.body.set(value);
    try {
      localStorage.setItem(BODY_KEY, value);
    } catch {
      /* Nothing to do; the text is still on screen. */
    }
  }

  toggleTag(tag: string): void {
    this.tags.update(current =>
      current.includes(tag) ? current.filter(item => item !== tag) : [...current, tag]
    );
  }

  /* ---------- actions ---------- */

  async save(): Promise<void> {
    const draft = this.currentDraft();

    if (!this.online()) {
      enqueue(draft);
      this.queued.set(readQueue().length);
      this.clearComposer();
      this.status.set({
        kind: 'ok',
        text: 'Saved on this device. It will go up when you are back online.'
      });
      return;
    }

    this.status.set({ kind: 'working', text: 'Saving draft…' });
    try {
      await saveDraft(draft);
      this.clearComposer();
      this.status.set({ kind: 'ok', text: 'Draft saved.' });
    } catch (error) {
      enqueue(draft);
      this.queued.set(readQueue().length);
      this.clearComposer();
      this.status.set({
        kind: 'error',
        text: `${describe(error)} Kept on this device and queued to retry.`
      });
      this.syncToken();
    }
  }

  async confirmPublish(): Promise<void> {
    this.status.set({ kind: 'working', text: 'Publishing…' });
    try {
      const post = await publish(this.currentDraft());
      this.confirming.set(false);
      this.clearComposer();
      this.status.set({
        kind: 'ok',
        text: `Published "${post.title}". Live in about a minute.`,
        href: 'https://github.com/jamesjdougherty/dough-blog/actions'
      });
    } catch (error) {
      this.status.set({ kind: 'error', text: describe(error) });
      this.syncToken();
    }
  }

  private async drainQueue(): Promise<void> {
    if (readQueue().length === 0) {
      return;
    }
    const { sent, failed } = await flushQueue();
    this.queued.set(failed);
    this.syncToken();
    if (sent > 0) {
      this.status.set({
        kind: 'ok',
        text: `Sent ${sent} queued draft${sent === 1 ? '' : 's'}.`
      });
    }
  }

  private currentDraft(): Draft {
    const now = new Date().toISOString();
    return {
      id: draftId(),
      createdAt: now,
      updatedAt: now,
      title: this.title(),
      body: this.body(),
      tags: this.tags(),
      date: this.date()
    };
  }

  private clearComposer(): void {
    this.title.set('');
    this.body.set('');
    this.tags.set([]);
    this.date.set(today());
    try {
      localStorage.removeItem(BODY_KEY);
    } catch {
      /* Nothing to do. */
    }
  }
}

function restoreBody(): string {
  try {
    return localStorage.getItem(BODY_KEY) ?? '';
  } catch {
    return '';
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

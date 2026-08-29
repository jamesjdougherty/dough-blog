import { Component, ChangeDetectionStrategy, computed, signal } from '@angular/core';
import { POSTS, Post } from './posts';

interface YearGroup {
  year: number;
  posts: Post[];
}

const WORDS_PER_MINUTE = 220;

@Component({
  selector: 'app-blog',
  standalone: true,
  imports: [],
  templateUrl: './blog.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./blog.component.css']
})
export class BlogComponent {
  readonly postCount = POSTS.length;
  readonly firstYear = Math.min(...POSTS.map(post => Number(post.date.slice(0, 4))));
  readonly latestYear = Math.max(...POSTS.map(post => Number(post.date.slice(0, 4))));

  readonly activeTag = signal<string | null>(null);

  readonly tags = [...new Set(POSTS.flatMap(post => post.tags))].sort((a, b) =>
    a.localeCompare(b)
  );

  private readonly sorted = [...POSTS].sort((a, b) => b.date.localeCompare(a.date));

  readonly visiblePosts = computed(() => {
    const tag = this.activeTag();
    return tag ? this.sorted.filter(post => post.tags.includes(tag)) : this.sorted;
  });

  /** Posts bucketed by year, newest year first, so the feed reads as a timeline. */
  readonly groups = computed<YearGroup[]>(() => {
    const buckets = new Map<number, Post[]>();
    for (const post of this.visiblePosts()) {
      const year = Number(post.date.slice(0, 4));
      const bucket = buckets.get(year);
      if (bucket) {
        bucket.push(post);
      } else {
        buckets.set(year, [post]);
      }
    }
    return [...buckets.entries()]
      .map(([year, posts]) => ({ year, posts }))
      .sort((a, b) => b.year - a.year);
  });

  toggleTag(tag: string): void {
    this.activeTag.update(current => (current === tag ? null : tag));
  }

  clearTag(): void {
    this.activeTag.set(null);
  }

  /** Renders the ISO date as e.g. "August 29, 2026" without pulling in a locale pipe. */
  formatDate(iso: string): string {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  readingTime(post: Post): number {
    const words = post.body.reduce(
      (total, paragraph) => total + paragraph.split(/\s+/).length,
      0
    );
    return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  }
}

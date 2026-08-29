import { Component, ChangeDetectionStrategy, computed, signal } from '@angular/core';
import { POSTS, Post } from './posts';
import { PostCardComponent } from './post-card.component';
import { formatDate, readingTime } from './post-format';

interface YearGroup {
  year: number;
  posts: Post[];
}

@Component({
  selector: 'app-blog',
  standalone: true,
  imports: [PostCardComponent],
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

  readonly formatDate = formatDate;
  readonly readingTime = readingTime;
}

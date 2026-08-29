import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import { Post } from './posts';
import { formatDate, readingTime } from './post-format';

/**
 * One post, as it appears in the feed. Shared by the blog and by the editor's preview so
 * what you see while writing is the component that actually renders, not a lookalike.
 */
@Component({
  selector: 'app-post-card',
  standalone: true,
  imports: [],
  templateUrl: './post-card.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./post-card.component.css']
})
export class PostCardComponent {
  @Input({ required: true }) post!: Post;

  /** Highlights the tag currently filtering the feed. */
  @Input() activeTag: string | null = null;

  /** False in the editor preview, where tags are illustrative rather than controls. */
  @Input() interactive = true;

  @Output() tagSelected = new EventEmitter<string>();

  readonly formatDate = formatDate;
  readonly readingTime = readingTime;
}

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PostCardComponent } from './post-card.component';
import { Post } from './posts';
import { formatDate, readingTime } from './post-format';

const post: Post = {
  slug: 'a-post',
  title: 'A Post',
  date: '2026-08-29',
  tags: ['Tools', 'Musings'],
  body: ['First paragraph.', 'Second paragraph.']
};

describe('PostCardComponent', () => {
  let fixture: ComponentFixture<PostCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PostCardComponent] }).compileComponents();
    fixture = TestBed.createComponent(PostCardComponent);
    fixture.componentRef.setInput('post', post);
    fixture.detectChanges();
  });

  it('renders the post', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.post__title')?.textContent).toContain('A Post');
    expect(el.querySelectorAll('.post__body p').length).toEqual(2);
    expect(el.querySelectorAll('.tag').length).toEqual(2);
    expect(el.querySelector('.post')?.id).toEqual('a-post');
  });

  it('marks the date up as a machine-readable time', () => {
    const time = fixture.nativeElement.querySelector('time') as HTMLTimeElement;
    expect(time.getAttribute('datetime')).toEqual('2026-08-29');
    expect(time.textContent).toContain('August 29, 2026');
  });

  it('emits the tag when interactive', () => {
    const seen: string[] = [];
    fixture.componentInstance.tagSelected.subscribe((tag: string) => seen.push(tag));
    (fixture.nativeElement.querySelector('.tag') as HTMLButtonElement).click();
    expect(seen).toEqual(['Tools']);
  });

  it('renders tags as plain text when not interactive, so a preview has no dead controls', () => {
    fixture.componentRef.setInput('interactive', false);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('button.tag').length).toEqual(0);
    expect(el.querySelectorAll('span.tag').length).toEqual(2);
  });
});

describe('post formatting', () => {
  it('formats an ISO date for display', () => {
    expect(formatDate('2026-08-29')).toEqual('August 29, 2026');
  });

  it('never reports less than a minute to read', () => {
    expect(readingTime({ body: ['One word.'] })).toEqual(1);
  });

  it('scales with length', () => {
    const long = Array.from({ length: 500 }, () => 'word').join(' ');
    expect(readingTime({ body: [long] })).toBeGreaterThan(1);
  });
});

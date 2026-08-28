import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BlogComponent } from './blog.component';
import { POSTS } from './posts';

describe('BlogComponent', () => {
  let component: BlogComponent;
  let fixture: ComponentFixture<BlogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BlogComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(BlogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render every post by default', () => {
    expect(component.visiblePosts().length).toEqual(POSTS.length);
    expect(fixture.nativeElement.querySelectorAll('.post').length).toEqual(POSTS.length);
  });

  it('should group posts newest year first', () => {
    const years = component.groups().map(group => group.year);
    expect(years).toEqual([...years].sort((a, b) => b - a));
  });

  it('should filter to a tag and back', () => {
    const tag = component.tags[0];

    component.toggleTag(tag);
    expect(component.visiblePosts().every(post => post.tags.includes(tag))).toBeTrue();

    component.toggleTag(tag);
    expect(component.visiblePosts().length).toEqual(POSTS.length);
  });

  it('should format an ISO date for display', () => {
    expect(component.formatDate('2026-08-29')).toEqual('August 29, 2026');
  });
});

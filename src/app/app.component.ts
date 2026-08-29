import { Component, ChangeDetectionStrategy, effect, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

type Theme = 'light' | 'dark';

const THEME_KEY = 'dough-blog-theme';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'dough-blog';

  readonly theme = signal<Theme>(readStoredTheme());

  readonly currentYear = new Date().getFullYear();

  constructor() {
    effect(() => {
      const theme = this.theme();
      document.documentElement.dataset['theme'] = theme;
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        /* Private browsing or blocked storage - the in-memory choice still applies. */
      }
    });
  }

  toggleTheme(): void {
    this.theme.update(current => (current === 'dark' ? 'light' : 'dark'));
  }
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    /* Fall through to the OS preference. */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

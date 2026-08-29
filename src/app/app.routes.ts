import { Routes } from '@angular/router';
import { BlogComponent } from './blog/blog.component';

export const routes: Routes = [
  { path: '', component: BlogComponent },
  {
    // Lazy so readers never download the capture code or the GitHub client.
    path: 'capture',
    loadComponent: () => import('./capture/capture.component').then(m => m.CaptureComponent)
  },
  { path: '**', redirectTo: '' }
];

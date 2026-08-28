import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-blog',
  standalone: true,
  imports: [MatCardModule],
  templateUrl: './blog.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./blog.component.css']
})
export class BlogComponent implements OnInit {
  constructor() { }
  ngOnInit(): void { }
}
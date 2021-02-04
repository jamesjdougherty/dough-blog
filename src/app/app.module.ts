import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AngularFireModule } from '@angular/fire';
import { MatCardModule } from '@angular/material/card';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BlogComponent } from './blog/blog.component';

@NgModule({
  declarations: [
    AppComponent,
    BlogComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    AngularFireModule,
    MatCardModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }

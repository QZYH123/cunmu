import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/wall.css';
import './styles/pages.css';
import './styles/me.css';
// before App: its popstate listener must run ahead of the router's (desktop back flight)
import './lib/backFlight';
import App from './App';
import { DUR } from './tokens';
import { storage } from './lib/storage';
import { migrateImages } from './lib/images';
import { startNativeShell } from './lib/shell';

// the save is read before the first render (on a phone it is a file: an async read)
storage.boot().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );

  // the start screen fades once the first frame of the app is up (v0.4 §10: a 200ms cross-fade, no animation)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.querySelector('.splash');
    if (!el) return;
    el.classList.add('gone');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), DUR.page);
  }));
  void migrateImages();
  startNativeShell();
});

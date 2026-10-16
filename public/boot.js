// Runs before the first paint: puts the chosen look (light / dark / follow the system) on <html>,
// so the start screen and the first frame are already the right colour. The app keeps 'cunmu/theme' current.
(function () {
  try {
    var t = localStorage.getItem('cunmu/theme');
    if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: the stylesheet's media query decides */ }
  // reduced motion is one attribute for every rule (MOTION-SPEC §8); the store keeps it after this
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.setAttribute('data-motion', 'reduce'); } catch (e) { /* no matchMedia */ }
})();

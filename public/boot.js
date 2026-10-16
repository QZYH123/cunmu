// Runs before the first paint: puts the chosen look (light / dark / follow the system) on <html>,
// so the start screen and the first frame are already the right colour. The app keeps 'cunmu/theme' current.
(function () {
  try {
    var t = localStorage.getItem('cunmu/theme');
    if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: the stylesheet's media query decides */ }
})();

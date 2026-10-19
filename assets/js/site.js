// 存目 site: the only script. The film loads nothing until it is asked to play.
(function () {
  var film = document.getElementById('film'); if (!film) return;
  var v = film.querySelector('video'), b = film.querySelector('.film-play');
  b.addEventListener('click', function () {
    var w = v.getBoundingClientRect().width * (window.devicePixelRatio || 1);
    v.src = w > 1400 ? v.dataset.src1080 : v.dataset.src720;
    v.controls = true; film.classList.add('playing');
    var p = v.play(); if (p && p.catch) p.catch(function () {});
    v.focus();
  });
})();

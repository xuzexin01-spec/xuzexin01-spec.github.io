/* 懒加载入口：拆解区接近视口时才动态加载 Three.js 模块。 */
(function () {
  var view = document.getElementById('tdView');
  if (!view) return;
  var started = false;
  function start() {
    if (started) return;
    started = true;
    import('./teardown3d.js?v=2').catch(function () {
      view.classList.add('is-failed');
      var loading = document.getElementById('tdLoading');
      if (loading) loading.querySelector('span').textContent = 'WEBGL UNAVAILABLE';
    });
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { start(); io.disconnect(); } });
    }, { rootMargin: '400px' });
    io.observe(view);
  } else {
    start();
  }

  window.addEventListener('aether:layer', function (e) {
    var map = { L1: 0, L2: 1, L3: 2, L4: 3 };
    var idx = map[e.detail.layer];
    document.querySelectorAll('.td-layer').forEach(function (row, i) {
      row.classList.toggle('is-lit', i === idx);
    });
    var range = document.getElementById('explodeRange');
    if (range && +range.value < 20) {
      range.value = 55;
      range.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
})();

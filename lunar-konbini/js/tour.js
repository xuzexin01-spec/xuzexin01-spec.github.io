/* LUNAR KONBINI — 360 tour UI
 * Five equirectangular stations rendered from the frozen Blender master.
 * Pannellum handles the panorama rendering; this file adds the editorial UI:
 * station navigation, minimap + view cone, hotspots, intro, info modal.
 */
(function () {
  'use strict';

  var SCENES = [
    { id: 'hero',     num: '01', title: '中央全景',   en: 'CENTRAL HALL',  pos: [-3.40, 0.00], yaw: 90.0  },
    { id: 'entrance', num: '02', title: '入口视角',   en: 'ENTRANCE',      pos: [ 0.00, 4.60], yaw: 180.0 },
    { id: 'island',   num: '03', title: '促销岛',     en: 'PROMO ISLAND',  pos: [-2.20, 1.20], yaw: 118.6 },
    { id: 'coffee',   num: '04', title: '咖啡热食台', en: 'COFFEE BAR',    pos: [ 1.30, 3.10], yaw: 163.5 },
    { id: 'lounge',   num: '05', title: '窗边卡座',   en: 'WINDOW LOUNGE', pos: [ 2.90, 1.90], yaw: 227.8 }
  ];

  var INFO = {
    hero: { yaw: 0, pitch: -9, html: '<strong>PROMO ISLAND</strong>中央三层木质促销岛：上层是玻璃罩、月球车与月灯，下面两层摆着月面限定零食和饮料。' },
    island: { yaw: 6, pitch: 14, html: '<strong>MOON ROVER</strong>玻璃罩里停着一台小小的月球车，旁边是月灯和植物。整个展台用暖色灯带托底。' },
    coffee: { yaw: 0, pitch: 2, html: '<strong>COFFEE &amp; HOT FOOD</strong>咖啡机、热水锅炉、杯塔和保温柜。柜台下方藏着一条暖色灯带，是店里最暖的角落之一。' },
    lounge: { yaw: -4, pitch: 1, html: '<strong>EARTH WINDOW</strong>三面加厚舷窗正对静海。天气好的时候，能看见远处的地球悬在月平线上。' }
  };

  var viewer = null;
  var currentScene = null;
  var rotating = false;
  var coneTimer = null;
  var toastTimer = null;

  function norm(d) { d = ((d + 180) % 360 + 360) % 360 - 180; return d; }
  function dirYaw(a, b) { return Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI; }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function $(id) { return document.getElementById(id); }

  function navFunc(num, label) {
    return function (div) {
      div.innerHTML = '<span class="hs-arrow">' + num + '</span><span class="hs-label">' + label + '</span>';
    };
  }

  function buildHotSpots(scene) {
    var others = SCENES.filter(function (s) { return s.id !== scene.id; })
      .map(function (s) { return { s: s, d: dist(scene.pos, s.pos) }; })
      .sort(function (a, b) { return a.d - b.d; })
      .slice(0, 3);
    var used = [];
    var spots = [];
    others.forEach(function (o) {
      var rel = norm(dirYaw(scene.pos, o.s.pos) - scene.yaw);
      for (var i = 0; i < used.length; i++) { if (Math.abs(norm(rel - used[i])) < 10) return; }
      used.push(rel);
      spots.push({
        pitch: -14,
        yaw: rel,
        type: 'scene',
        sceneId: o.s.id,
        targetPitch: 0,
        targetYaw: 0,
        targetHfov: 105,
        cssClass: 'hs-nav',
        createTooltipFunc: navFunc(o.s.num, o.s.title)
      });
    });
    // Note: extra reading cards live in the About modal; panorama hotspots are navigation only.
    return spots;
  }

  function buildConfig() {
    var scenes = {};
    SCENES.forEach(function (s) {
      scenes[s.id] = {
        type: 'equirectangular',
        panorama: 'assets/panos/' + s.id + '.jpg',
        preview: 'assets/panos/preview_' + s.id + '.jpg',
        hfov: 105,
        minHfov: 55,
        maxHfov: 120,
        pitch: 0,
        yaw: (s.viewYaw || 0),
        hotSpots: buildHotSpots(s)
      };
    });
    return {
      default: {
        firstScene: 'hero',
        sceneFadeDuration: 900,
        autoLoad: true,
        showControls: false,
        compass: false,
        autoRotate: 0,
        backgroundColor: [7, 8, 12],
        hfov: 105,
        minHfov: 55,
        maxHfov: 120
      },
      scenes: scenes
    };
  }

  /* ---------------- static SVG mini-map ---------------- */
  var MAP = { cx: 100, cy: 100, px: 78, R: 6 };
  function mp(x, y) { return [MAP.cx + x / MAP.R * MAP.px, MAP.cy - y / MAP.R * MAP.px]; }
  function polar(thetaDeg, r) { var a = thetaDeg * Math.PI / 180; return mp(Math.sin(a) * r, Math.cos(a) * r); }
  function arc(theta0, theta1, r, cls) {
    var p0 = polar(theta0, r), p1 = polar(theta1, r);
    var large = Math.abs(theta1 - theta0) > 180 ? 1 : 0;
    return '<path class="' + cls + '" d="M ' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) +
      ' A ' + (r / MAP.R * MAP.px).toFixed(2) + ' ' + (r / MAP.R * MAP.px).toFixed(2) +
      ' 0 ' + large + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) + '"/>';
  }
  function dotAt(x, y, active, id, num, title) {
    var p = mp(x, y);
    return '<circle class="m-dot' + (active ? ' is-active' : '') + '" data-scene="' + id + '" cx="' + p[0].toFixed(2) + '" cy="' + p[1].toFixed(2) + '" r="' + (active ? 4.4 : 3.4) + '"><title>' + num + ' · ' + title + '</title></circle>';
  }
  function buildMap() {
    var s = '<svg viewBox="0 0 200 200" aria-hidden="true">';
    s += '<circle class="m-core" cx="100" cy="100" r="7"/>';
    s += '<circle class="m-wall" cx="100" cy="100" r="78"/>';
    [186, 216, 246].forEach(function (a) { s += arc(a - 11, a + 11, 6, 'm-window'); });
    s += arc(-7, 7, 6, 'm-door');
    s += arc(186, 258, 5.0, 'm-booth');
    [[88, 4], [112.6, 11], [140, 16], [166, 9], [296.5, 8], [324, 10], [309, 4], [40, 7]].forEach(function (f) {
      s += arc(f[0] - f[1], f[0] + f[1], 5.62, 'm-fixture');
    });
    s += '<circle class="m-island" cx="100" cy="100" r="14.3"/>';
    s += '<circle id="m-active-ring" class="m-ring" cx="100" cy="100" r="7.2"/>';
    s += '<g id="m-cone"></g>';
    SCENES.forEach(function (sc) { s += dotAt(sc.pos[0], sc.pos[1], false, sc.id, sc.num, sc.title); });
    s += '</svg>';
    $('minimap').innerHTML = s;
    Array.prototype.forEach.call(document.querySelectorAll('#minimap .m-dot'), function (el) {
      el.addEventListener('click', function () { go(el.getAttribute('data-scene')); });
    });
  }
  function setMapActive(id) {
    var activeEl = null;
    Array.prototype.forEach.call(document.querySelectorAll('#minimap .m-dot'), function (el) {
      var on = el.getAttribute('data-scene') === id;
      el.classList.toggle('is-active', on);
      el.setAttribute('r', on ? '4.4' : '3.4');
      if (on) activeEl = el;
    });
    var ring = $('m-active-ring');
    if (ring && activeEl) {
      ring.setAttribute('cx', activeEl.getAttribute('cx'));
      ring.setAttribute('cy', activeEl.getAttribute('cy'));
    }
  }
  function updateCone() {
    var g = $('m-cone');
    if (!g || !currentScene || !viewer) return;
    var yaw = currentScene.yaw + viewer.getYaw();
    var a = yaw * Math.PI / 180;
    var step = 0.55;
    var x0 = currentScene.pos[0], y0 = currentScene.pos[1];
    var p0 = mp(x0, y0);
    var pA = mp(x0 + Math.sin(a - step) * 1.55, y0 + Math.cos(a - step) * 1.55);
    var pB = mp(x0 + Math.sin(a + step) * 1.55, y0 + Math.cos(a + step) * 1.55);
    g.innerHTML = '<path class="m-cone" d="M ' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) +
      ' L ' + pA[0].toFixed(2) + ' ' + pA[1].toFixed(2) +
      ' A 20 20 0 0 1 ' + pB[0].toFixed(2) + ' ' + pB[1].toFixed(2) + ' Z"/>';
  }

  /* ---------------- station pills ---------------- */
  function buildNav() {
    var host = $('scene-nav');
    SCENES.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'scene-pill';
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('data-scene', s.id);
      b.innerHTML = '<em>' + s.num + '</em>' + s.title;
      b.addEventListener('click', function () { go(s.id); });
      host.appendChild(b);
    });
  }
  function setNavActive(id) {
    Array.prototype.forEach.call(document.querySelectorAll('.scene-pill'), function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-scene') === id);
      b.setAttribute('aria-selected', b.getAttribute('data-scene') === id ? 'true' : 'false');
    });
  }

  /* ---------------- interactions ---------------- */
  function go(id) {
    if (!viewer) return;
    try { viewer.loadScene(id, 0, 0, 105, 900); } catch (e) { /* noop */ }
    try { history.replaceState(null, '', '#/' + id); } catch (e) { /* noop */ }
  }

  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 1800);
  }

  function onSceneChange(id) {
    var sid = id;
    if (typeof sid !== 'string') {
      try { sid = viewer.getScene(); } catch (e) { sid = null; }
    }
    var sc = SCENES.filter(function (s) { return s.id === sid; })[0];
    if (!sc) return;
    currentScene = sc;
    setNavActive(sc.id);
    setMapActive(sc.id);
    updateCone();
    var capNum = $('cap-num'), capName = $('cap-name'), capEn = $('cap-en');
    if (capNum) capNum.textContent = sc.num;
    if (capName) capName.textContent = sc.title;
    if (capEn) capEn.textContent = sc.en;
    document.title = '月球便利店 · ' + sc.title + ' — 360° 全景导览';
    if (document.getElementById('intro').classList.contains('is-hidden')) {
      try { history.replaceState(null, '', '#/' + sc.id); } catch (e) { /* noop */ }
    }
  }

  function toggleRotate() {
    if (!viewer) return;
    rotating = !rotating;
    if (rotating) { viewer.startAutoRotate(1.15); } else { viewer.stopAutoRotate(); }
    $('btn-autorotate').classList.toggle('is-on', rotating);
  }

  function toggleFullscreen() {
    try { viewer.toggleFullscreen(); return; } catch (e) { /* fallback */ }
    var el = document.documentElement;
    if (!document.fullscreenElement) { if (el.requestFullscreen) el.requestFullscreen(); }
    else if (document.exitFullscreen) { document.exitFullscreen(); }
  }

  function openInfo(open) {
    $('info-modal').classList.toggle('hidden', !open);
  }

  function hideIntro() {
    $('intro').classList.add('is-hidden');
    var sid = currentScene ? currentScene.id : 'hero';
    try { history.replaceState(null, '', '#/' + sid); } catch (e) { /* noop */ }
    setTimeout(function () { var h = $('hint'); if (h) h.classList.add('is-faded'); }, 7000);
  }

  function hashScene() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    if (!h || h === 'tour') return null;
    return SCENES.filter(function (s) { return s.id === h; })[0] ? h : null;
  }
  function directMode() {
    return location.hash.indexOf('#tour') === 0 || location.hash.indexOf('#/') === 0;
  }

  function init() {
    if (!window.pannellum) {
      $('loader-text').textContent = '全景组件加载失败，请刷新页面。';
      return;
    }
    buildNav();
    buildMap();
    try {
      viewer = pannellum.viewer('panorama', buildConfig());
    } catch (e) {
      $('loader-text').textContent = '当前浏览器未启用 WebGL，无法显示全景。';
      console.error(e);
      return;
    }
    window.__viewer = viewer;
    viewer.on('load', function () {
      var l = $('loader');
      l.classList.add('is-hidden');
      if (!currentScene) onSceneChange('hero');
      if (directMode()) hideIntro();
    });
    viewer.on('scenechange', function (id) {
      onSceneChange(id);
    });
    viewer.on('error', function () {
      $('loader-text').textContent = '全景加载失败，请检查网络后刷新。';
      $('loader').classList.remove('is-hidden');
    });
    currentScene = SCENES[0];
    setNavActive('hero');
    setMapActive('hero');
    coneTimer = setInterval(updateCone, 120);
    var startScene = hashScene();
    if (startScene && startScene !== 'hero') {
      setTimeout(function () { try { viewer.loadScene(startScene); } catch (e) { /* noop */ } }, 60);
    }

    $('btn-autorotate').addEventListener('click', toggleRotate);
    $('btn-fullscreen').addEventListener('click', toggleFullscreen);
    $('btn-info').addEventListener('click', function () { openInfo(true); });
    $('btn-close-info').addEventListener('click', function () { openInfo(false); });
    $('info-modal').addEventListener('click', function (e) { if (e.target === $('info-modal')) openInfo(false); });
    $('btn-enter').addEventListener('click', hideIntro);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') openInfo(false);
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
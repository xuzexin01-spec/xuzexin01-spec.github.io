/* ============================================================================
 * 未来车站 · FUTURE STATION — 360° station tour controller
 * ----------------------------------------------------------------------------
 * Data      manifest.json (8 stations: id, num, zh, en, pos, yaw, pitch, blurb)
 * Renderer  Pannellum 2.5.6 (vendored). Pano orientation contract: the image
 *           centre is world +Y (north) and pano yaw = world bearing, so a
 *           station's manifest yaw is the initial view and hotspot yaw is the
 *           raw bearing to the neighbouring station (never re-offset).
 * UI        station caption, minimap + live view cone, auto hotspots, station
 *           nav, intro, about modal, loader, toast, deep links, keyboard.
 * ==========================================================================*/
(function () {
  'use strict';

  var PANO_DIR = 'assets/panos/';
  var POSTER_DIR = 'assets/poster/';
  var HFOV = 100;
  var MIN_HFOV = 45;
  var MAX_HFOV = 120;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* noop */ }

  var S = {
    manifest: null,
    stations: [],
    byId: {},
    current: null,
    startId: null,
    viewer: null,
    config: null,
    viewerLoaded: false,
    switching: true,
    queued: null,
    loadingId: null,
    introOpen: true,
    modalOpen: false,
    rotating: false,
    loaderDone: false,
    loaderError: false,
    panoFailed: false,
    toastTimer: 0,
    spinnerTimer: 0,
    hintTimer: 0,
    watchdog: 0,
    probes: {},
    warmed: {},
    planRequested: false,
    planFallbackTried: false,
    map: { w: 0, h: 0 },
    bounds: null,
    boundsAspect: 0,
    lastYaw: null,
    lastHfov: null,
    raf: 0,
    lastFocus: null
  };

  var el = {};

  /* ---------------------------------------------------------------- helpers */
  function $(id) { return document.getElementById(id); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function pad3(n) { n = ((Math.round(n) % 360) + 360) % 360; return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function norm(d) { return ((d + 180) % 360 + 360) % 360 - 180; }
  function bearing(a, b) { return Math.atan2(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1]) * 180 / Math.PI; }
  function distance(a, b) { return Math.sqrt(Math.pow(b.pos[0] - a.pos[0], 2) + Math.pow(b.pos[1] - a.pos[1], 2)); }
  function setText(node, value) { if (node) node.textContent = value == null ? '' : String(value); }
  function fmtSize(bytes) {
    if (!bytes) return '0.0 MB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  /* ------------------------------------------------------------------ boot */
  function init() {
    cacheElements();
    if (!el.panorama) return;
    bindStaticUI();
    layoutMap();
    if (!window.pannellum) {
      failLoader('全景引擎加载失败', 'vendor/pannellum.js 未能载入。');
      return;
    }
    fetchManifest().then(boot).catch(function (err) {
      console.error('[tour] manifest error', err);
      failLoader('清单文件加载失败', '无法读取 manifest.json。请通过静态服务器访问本站点。');
    });
  }

  function cacheElements() {
    el.panorama = $('panorama');
    el.top = document.querySelector('.hud-top');
    el.cap = $('station-cap');
    el.mapCard = $('map-card');
    el.bottom = document.querySelector('.hud-bottom');
    el.btnRotate = $('btn-autorotate');
    el.btnInfo = $('btn-info');
    el.btnFs = $('btn-fullscreen');
    el.fsLabel = el.btnFs ? el.btnFs.querySelector('.chip-label') : null;
    el.capNum = $('cap-num');
    el.capTotal = $('cap-total');
    el.capName = $('cap-name');
    el.capEn = $('cap-en');
    el.capBlurb = $('cap-blurb');
    el.mapStage = $('map-stage');
    el.planImg = $('plan-img');
    el.mapSvg = $('map-svg');
    el.mapCone = $('map-cone');
    el.mapDots = $('map-dots');
    el.mapHdg = $('map-hdg');
    el.mapNote = $('map-note');
    el.nav = $('scene-nav');
    el.navCount = $('nav-count');
    el.intro = $('intro');
    el.introBg = $('intro-bg');
    el.introList = $('intro-list');
    el.introDesc = $('intro-desc');
    el.introSub = $('intro-sub');
    el.introMeta = $('intro-meta');
    el.introCount = $('intro-count');
    el.btnEnter = $('btn-enter');
    el.loader = $('loader');
    el.loaderFill = $('loader-fill');
    el.loaderPct = $('loader-pct');
    el.loaderBytes = $('loader-bytes');
    el.loaderLabel = $('loader-label');
    el.loaderRetry = $('loader-retry');
    el.modal = $('info-modal');
    el.modalCard = el.modal ? el.modal.querySelector('.modal-card') : null;
    el.modalClose = $('btn-close-info');
    el.infoAbout = $('info-about');
    el.infoFacts = $('info-facts');
    el.infoTour = $('info-tour');
    el.toast = $('toast');
    el.hint = document.querySelector('.hint');
    el.panoError = $('pano-error');
    el.pePath = $('pe-path');
    el.peTitle = el.panoError ? el.panoError.querySelector('h3') : null;
    el.spinner = $('pano-spinner');
    el.spinnerLabel = $('pano-spinner-label');
  }

  function fetchManifest() {
    var url = (typeof window !== 'undefined' && window.STN_MANIFEST_URL) || 'manifest.json';
    if (window.STN_MANIFEST_DATA) return Promise.resolve(window.STN_MANIFEST_DATA);
    return fetch(url, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      if (!data || !Array.isArray(data.stations) || !data.stations.length) {
        throw new Error('manifest.json 中没有 stations');
      }
      return data;
    });
  }

  function boot(manifest) {
    S.manifest = manifest;
    S.stations = normalizeStations(manifest);
    if (!S.stations.length) { failLoader('清单中没有可用机位', 'manifest.json 的 stations 为空。'); return; }
    S.stations.forEach(function (s) { S.byId[s.id] = s; });
    computePlanMapping(manifest);
    renderStatic(manifest);
    buildNav();
    buildMapDots();
    buildIntroIndex();

    var hashId = readHash();
    var startId = hashId && S.byId[hashId] ? hashId : S.stations[0].id;
    S.startId = startId;

    if (hashId) hideIntroStatic();
    else setTourInert(true);

    setIntroPoster(S.byId[startId]);
    setCaption(S.byId[startId]);
    setNavActive(startId);
    setMapActive(startId);

    updateLoaderStation(S.byId[startId]);
    bootViewer(startId);
  }

  function normalizeStations(manifest) {
    var seen = {};
    return manifest.stations.map(function (raw, i) {
      var id = String(raw.id || ('station-' + (i + 1)));
      if (seen[id]) id = id + '-' + (i + 1);
      seen[id] = true;
      var pos = Array.isArray(raw.pos) ? raw.pos : [0, 0];
      var s = {
        id: id,
        num: String(raw.num || pad2(i + 1)),
        zh: String(raw.zh || id),
        en: String(raw.en || ''),
        blurb: String(raw.blurb || ''),
        yaw: num(raw.yaw),
        pitch: num(raw.pitch),
        pos: [num(pos[0]), num(pos[1])],
        eye: num(pos[2]),
        index: i,
        mapX: 50,
        mapY: 50
      };
      return s;
    });
  }

  /* ------------------------------------------------------------- plan map */
  function computePlanMapping(manifest) {
    var pb = manifest.plan || {};
    var x0 = num(pb.x_min), x1 = num(pb.x_max), y0 = num(pb.y_min), y1 = num(pb.y_max);
    if (!(x1 > x0 && y1 > y0)) {
      // Fallback bounds around the stations if the plan block is absent.
      var xs = S.stations.map(function (s) { return s.pos[0]; });
      var ys = S.stations.map(function (s) { return s.pos[1]; });
      x0 = Math.min.apply(null, xs) - 12; x1 = Math.max.apply(null, xs) + 12;
      y0 = Math.min.apply(null, ys) - 12; y1 = Math.max.apply(null, ys) + 12;
    }
    S.bounds = { x0: x0, x1: x1, y0: y0, y1: y1 };
    S.boundsAspect = (x1 - x0) / (y1 - y0);
    S.stations.forEach(function (s) {
      s.mapX = clamp((s.pos[0] - x0) / (x1 - x0) * 100, 1.2, 98.8);
      s.mapY = clamp((y1 - s.pos[1]) / (y1 - y0) * 100, 1.2, 98.8);
    });
    if (S.boundsAspect > 0.1 && S.boundsAspect < 10) setPlanAspect(S.boundsAspect);
  }

  function setPlanAspect(aspect) {
    if (!el.mapStage || !(aspect > 0)) return;
    el.mapStage.style.setProperty('--plan-aspect', String(aspect));
    requestAnimationFrame(layoutMap);
  }

  function layoutMap() {
    if (!el.mapStage) return;
    var rect = el.mapStage.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;
    S.map.w = rect.width;
    S.map.h = rect.height;
    if (el.mapSvg) el.mapSvg.setAttribute('viewBox', '0 0 ' + rect.width.toFixed(2) + ' ' + rect.height.toFixed(2));
    drawCone();
  }

  function drawCone() {
    if (!el.mapCone) return;
    var s = S.current;
    if (!s || !S.map.w) { el.mapCone.setAttribute('d', ''); return; }
    var yaw = S.viewer ? S.viewer.getYaw() : s.yaw;
    var hfov = S.viewer ? S.viewer.getHfov() : HFOV;
    var cx = s.mapX / 100 * S.map.w;
    var cy = s.mapY / 100 * S.map.h;
    var radius = Math.max(15, Math.min(S.map.w, S.map.h) * 0.36);
    var half = clamp(hfov / 2, 18, 62) * Math.PI / 180;
    var a = yaw * Math.PI / 180;
    var a0 = a - half, a1 = a + half;
    var x0 = cx + radius * Math.sin(a0), y0 = cy - radius * Math.cos(a0);
    var x1 = cx + radius * Math.sin(a1), y1 = cy - radius * Math.cos(a1);
    el.mapCone.setAttribute('d',
      'M ' + cx.toFixed(2) + ' ' + cy.toFixed(2) +
      ' L ' + x0.toFixed(2) + ' ' + y0.toFixed(2) +
      ' A ' + radius.toFixed(2) + ' ' + radius.toFixed(2) + ' 0 0 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' Z');
    if (el.mapHdg) el.mapHdg.textContent = 'HDG ' + pad3(yaw) + '°';
  }

  function stepMapFrame() {
    S.raf = requestAnimationFrame(stepMapFrame);
    if (!S.viewer) return;
    var y = S.viewer.getYaw();
    var h = S.viewer.getHfov();
    if (S.lastYaw == null || Math.abs(y - S.lastYaw) > 0.12 || Math.abs(h - S.lastHfov) > 0.4) {
      S.lastYaw = y;
      S.lastHfov = h;
      drawCone();
    }
  }

  /* ------------------------------------------------------------- static UI */
  function renderStatic(manifest) {
    var n = S.stations.length;
    setText(el.introDesc, manifest.about || '');
    var sub = [manifest.subtitle_zh, manifest.subtitle_en].filter(Boolean).join(' · ');
    setText(el.introSub, sub || '现代高铁站 · 360° 全景');
    setText(el.introMeta, n + ' 个机位 · Cycles 渲染 · 手机 / 桌面可用');
    setText(el.introCount, pad2(n) + ' STATIONS');
    setText(el.navCount, pad2(n));
    setText(el.capTotal, pad2(n));
    setText(el.infoAbout, manifest.about || '');
    setText(el.mapNote, '点击圆点切换');

    buildFacts(el.infoFacts, manifest.facts || []);
    buildFacts(el.infoTour, [
      { k: '投影', v: '等距柱状 · 4096×2048' },
      { k: '平面图', v: '1000×2280 · +Y 朝北' },
      { k: '引擎', v: 'Pannellum 2.5.6 / WebGL' },
      { k: '站点', v: '纯静态 · 无后端' }
    ]);

    if (el.planImg) {
      var onPlan = function () { planReady(); };
      var onPlanFail = function () {
        var fallback = el.planImg.getAttribute('data-fallback');
        if (fallback && !S.planFallbackTried) {
          S.planFallbackTried = true;
          el.planImg.src = fallback;
          return;
        }
        if (el.mapStage) el.mapStage.classList.add('is-missing');
      };
      el.planImg.addEventListener('load', onPlan);
      el.planImg.addEventListener('error', onPlanFail);
      if (el.planImg.getAttribute('src')) {
        if (el.planImg.complete && el.planImg.naturalWidth) onPlan();
        else if (el.planImg.complete) onPlanFail();
      }
    }
  }

  function loadPlanImage() {
    if (!el.planImg || S.planRequested) return;
    S.planRequested = true;
    if (el.planImg.getAttribute('src')) return;
    var src = el.planImg.getAttribute('data-src') ||
      (S.manifest && S.manifest.plan && S.manifest.plan.image) || 'assets/plan.png';
    el.planImg.src = src;
  }

  function planReady() {
    if (!el.planImg || !el.planImg.naturalWidth) return;
    if (el.mapStage) el.mapStage.classList.remove('is-missing');
    var aspect = el.planImg.naturalWidth / el.planImg.naturalHeight;
    if (aspect > 0.1 && aspect < 10) {
      if (S.boundsAspect && Math.abs(aspect - S.boundsAspect) > 0.025) {
        console.warn('[tour] plan.png aspect ' + aspect.toFixed(3) + ' differs from manifest bounds ' + S.boundsAspect.toFixed(3) + '; dots are mapped from bounds.');
      }
      setPlanAspect(aspect);
    }
    layoutMap();
  }

  function buildFacts(host, facts) {
    if (!host) return;
    host.textContent = '';
    facts.forEach(function (f) {
      if (!f || !f.k) return;
      var row = document.createElement('div');
      var dt = document.createElement('dt');
      var dd = document.createElement('dd');
      dt.textContent = f.k;
      dd.textContent = f.v;
      row.appendChild(dt);
      row.appendChild(dd);
      host.appendChild(row);
    });
  }

  function buildNav() {
    if (!el.nav) return;
    el.nav.textContent = '';
    S.stations.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'scene-pill';
      b.id = 'tab-' + s.id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', 'false');
      b.setAttribute('data-scene', s.id);
      b.title = s.num + ' · ' + s.zh + (s.en ? ' / ' + s.en : '');
      var em = document.createElement('em');
      em.textContent = s.num;
      var label = document.createElement('span');
      label.textContent = s.zh;
      b.appendChild(em);
      b.appendChild(label);
      b.addEventListener('click', function () { onUserScene(s.id); });
      el.nav.appendChild(b);
    });
  }

  function buildMapDots() {
    if (!el.mapDots) return;
    el.mapDots.textContent = '';
    S.stations.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'map-dot';
      b.setAttribute('data-scene', s.id);
      b.setAttribute('aria-label', '切换到 ' + s.num + ' ' + s.zh);
      b.style.left = s.mapX.toFixed(2) + '%';
      b.style.top = s.mapY.toFixed(2) + '%';
      var tip = document.createElement('span');
      tip.className = 'dot-tip';
      var em = document.createElement('em');
      em.textContent = s.num;
      tip.appendChild(em);
      tip.appendChild(document.createTextNode(s.zh));
      b.appendChild(tip);
      b.addEventListener('click', function () { onUserScene(s.id); });
      el.mapDots.appendChild(b);
    });
  }

  function buildIntroIndex() {
    if (!el.introList) return;
    el.introList.textContent = '';
    S.stations.forEach(function (s) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-scene', s.id);
      var em = document.createElement('em');
      em.textContent = s.num;
      var zh = document.createElement('span');
      zh.textContent = s.zh;
      var en = document.createElement('small');
      en.textContent = s.en;
      b.appendChild(em);
      b.appendChild(zh);
      b.appendChild(en);
      li.appendChild(b);
      el.introList.appendChild(li);
    });
    el.introList.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('button[data-scene]') : null;
      if (btn) enterTour(btn.getAttribute('data-scene'));
    });
  }

  /* -------------------------------------------------------------- hotspots */
  function makeHotSpots(scene) {
    var near = S.stations.filter(function (o) { return o.id !== scene.id; })
      .map(function (o) { return { s: o, d: distance(scene, o) }; })
      .sort(function (a, b) { return a.d - b.d; })
      .slice(0, 3);

    var placed = [];
    var basePitch = -7;

    return near.map(function (o) {
      var rel = norm(bearing(scene, o.s));
      var pitch = basePitch;
      for (var guard = 0; guard < 6; guard++) {
        var clash = placed.some(function (p) {
          return Math.abs(norm(rel - p.rel)) < 14 && Math.abs(pitch - p.pitch) < 8;
        });
        if (!clash) break;
        pitch -= 10;
      }
      placed.push({ rel: rel, pitch: pitch });
      return {
        type: 'scene',
        sceneId: o.s.id,
        yaw: rel,
        pitch: pitch,
        cssClass: 'hs-nav',
        createTooltipFunc: makeHotSpotElement,
        createTooltipArgs: { num: o.s.num, zh: o.s.zh, en: o.s.en, sceneId: o.s.id }
      };
    });
  }

  function makeHotSpotElement(div, args) {
    div.tabIndex = 0;
    div.setAttribute('role', 'button');
    div.setAttribute('aria-label', '前往 ' + args.num + ' ' + args.zh);
    div.setAttribute('data-scene-id', args.sceneId || '');
    var chev = document.createElementNS(SVG_NS, 'svg');
    chev.setAttribute('viewBox', '0 0 12 12');
    chev.setAttribute('fill', 'none');
    chev.setAttribute('class', 'hs-chev');
    chev.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M4 2.2 8 6l-4 3.8');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.3');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    chev.appendChild(path);

    var label = document.createElement('span');
    label.className = 'hs-label';
    var em = document.createElement('em');
    em.textContent = args.num;
    var zh = document.createElement('span');
    zh.textContent = args.zh;
    label.appendChild(em);
    label.appendChild(zh);

    div.appendChild(chev);
    div.appendChild(label);

    // Take over Pannellum's own scene handler: our requestScene queues while
    // the viewer is busy and checks the panorama exists before switching.
    div.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      requestScene(args.sceneId);
    }, true);
    div.addEventListener('touchend', function (ev) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      requestScene(args.sceneId);
    }, true);

    div.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
        ev.preventDefault();
        ev.stopPropagation();
        div.click();
      }
    });
  }

  function buildConfig(startId) {
    var scenes = {};
    S.stations.forEach(function (s) {
      scenes[s.id] = {
        title: s.num + ' · ' + s.zh,
        type: 'equirectangular',
        panorama: (window.STN_ASSETS && window.STN_LOOKUP && window.STN_LOOKUP(PANO_DIR + s.id + '.jpg')) || PANO_DIR + s.id + '.jpg',
        yaw: s.yaw,
        pitch: s.pitch,
        hfov: HFOV,
        minHfov: MIN_HFOV,
        maxHfov: MAX_HFOV,
        autoLoad: true,
        hotSpots: makeHotSpots(s)
      };
    });
    return {
      default: {
        firstScene: startId,
        sceneFadeDuration: reduceMotion ? 0 : 700,
        autoLoad: true,
        showControls: false,
        showFullscreenCtrl: false,
        showZoomCtrl: false,
        compass: false,
        autoRotate: 0,
        backgroundColor: [10, 14, 19],
        hfov: HFOV,
        minHfov: MIN_HFOV,
        maxHfov: MAX_HFOV,
        minPitch: -88,
        maxPitch: 88,
        keyboardZoom: false,
        mouseZoom: true,
        hotSpotDebug: false,
        strings: { loadingLabel: '' }
      },
      scenes: scenes
    };
  }

  /* ---------------------------------------------------------- viewer boot */
  function updateLoaderStation(s) {
    if (s) setText(el.loaderLabel, '正在装载 ' + s.num + ' · ' + s.zh);
  }

  function bootViewer(startId) {
    var s = S.byId[startId];
    var path = PANO_DIR + startId + '.jpg';
    var progressSeen = false;

    loadImageWithProgress(path, function (frac, loaded, total) {
      progressSeen = true;
      setProgress(frac, loaded, total);
    }).then(function () {
      setProgress(1);
      createViewer(startId);
    }).catch(function (err) {
      console.warn('[tour] first pano unavailable:', path, err && err.message);
      S.panoFailed = true;
      writePanoError(s);
      hideLoader();
      if (!S.introOpen) showPanoError(s);
      toast('全景图尚未生成：' + path);
    });
  }

  function createViewer(startId) {
    var cfg;
    try {
      cfg = buildConfig(startId);
      S.config = cfg;
      S.viewer = window.pannellum.viewer('panorama', cfg);
    } catch (err) {
      console.error('[tour] viewer init failed', err);
      failLoader('无法初始化全景视图', '浏览器可能未启用 WebGL。');
      return;
    }
    S.switching = true;
    S.viewer.on('load', onViewerLoad);
    S.viewer.on('scenechange', onSceneChange);
    S.viewer.on('error', onViewerError);
    S.viewer.on('mousedown', onViewerGrab);
    S.viewer.on('touchstart', onViewerGrab);
    startFrameLoop();
    armWatchdog();
  }

  function armWatchdog() {
    clearTimeout(S.watchdog);
    S.watchdog = setTimeout(function () {
      if (S.loaderDone) return;
      console.warn('[tour] pano load watchdog fired');
      S.panoFailed = true;
      writePanoError(S.current || S.byId[S.startId]);
      hideLoader();
      showPanoError(S.current || S.byId[S.startId]);
      toast('全景装载超时');
    }, 30000);
  }

  function startFrameLoop() {
    if (S.raf) return;
    S.raf = requestAnimationFrame(stepMapFrame);
  }

  function onViewerLoad() {
    S.viewerLoaded = true;
    S.switching = false;
    clearTimeout(S.watchdog);
    hideLoader();
    hideSpinner();
    hidePanoError();
    var id = S.viewer.getScene();
    var s = S.byId[id];
    if (s) setCurrent(s);
    if (S.queued) {
      var q = S.queued;
      S.queued = null;
      if (!s || q !== s.id) setTimeout(function () { requestScene(q); }, 60);
    }
  }

  function onSceneChange(id) {
    var s = S.byId[id];
    if (!s) return;
    S.switching = true;
    S.loadingId = id;
    setCurrent(s);
    if (S.viewerLoaded) showSpinner(s);
  }

  function onViewerError(message) {
    console.error('[tour] pannellum:', message);
    S.switching = false;
    S.viewerLoaded = false;
    S.panoFailed = true;
    clearTimeout(S.watchdog);
    hideLoader();
    hideSpinner();
    var s = S.byId[S.loadingId] || S.current;
    if (s) writePanoError(s);
    if (!S.introOpen) showPanoError(s);
    toast('全景图加载失败');
  }

  /* ------------------------------------------------------------- scene I/O */
  function requestScene(id) {
    var s = S.byId[id];
    if (!s) return;
    if (S.panoFailed) { showPanoError(s); return; }
    if (!S.viewer) { S.queued = id; return; }
    if (S.current && S.current.id === id && !S.switching) {
      if (!S.introOpen) setHash(id);
      return;
    }
    if (S.switching || !S.viewerLoaded) {
      S.queued = id;
      return;
    }
    S.switching = true;
    S.loadingId = id;
    showSpinner(s);
    probePano(s.id).then(function () {
      if (S.loadingId !== id) return;
      try {
        S.viewer.loadScene(id);
      } catch (err) {
        console.warn('[tour] loadScene failed', err);
        S.switching = false;
        hideSpinner();
        toast('无法切换到该机位');
      }
    }).catch(function (err) {
      console.warn('[tour] pano missing:', id, err && err.message);
      S.switching = false;
      S.loadingId = null;
      hideSpinner();
      toast('该机位全景尚未生成 · ' + s.num + ' ' + s.zh);
      var q = S.queued;
      S.queued = null;
      if (q && q !== id) setTimeout(function () { requestScene(q); }, 30);
    });
  }

  function probePano(id) {
    if (S.probes[id]) return S.probes[id];
    var url = PANO_DIR + id + '.jpg';
    var promise = new Promise(function (resolve, reject) {
      var img = new Image();
      var timer = setTimeout(function () { cleanup(); reject(new Error('timeout')); }, 30000);
      function cleanup() {
        clearTimeout(timer);
        delete S.probes[id];
      }
      img.onload = function () { cleanup(); resolve(); };
      img.onerror = function () { cleanup(); reject(new Error('missing')); };
      img.src = url;
    });
    S.probes[id] = promise;
    return promise;
  }

  function onUserScene(id) {
    if (!S.byId[id]) return;
    if (S.introOpen) { enterTour(id); return; }
    requestScene(id);
  }

  function setCurrent(s) {
    if (!s) return;
    S.current = s;
    setCaption(s);
    setNavActive(s.id);
    setMapActive(s.id);
    drawCone();
    document.title = s.num + ' ' + s.zh + ' · 未来车站 — 360° 全景';
    if (!S.introOpen) setHash(s.id);
    warmNeighbours(s);
  }

  function setCaption(s) {
    if (!s) return;
    setText(el.capNum, s.num);
    setText(el.capName, s.zh);
    setText(el.capEn, s.en);
    setText(el.capBlurb, s.blurb);
  }

  function setNavActive(id) {
    if (!el.nav) return;
    var tabs = el.nav.querySelectorAll('.scene-pill');
    var active = null;
    Array.prototype.forEach.call(tabs, function (tab) {
      var on = tab.getAttribute('data-scene') === id;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) active = tab;
    });
    if (active && el.nav.scrollTo) {
      var left = active.offsetLeft - (el.nav.clientWidth - active.offsetWidth) / 2;
      try {
        el.nav.scrollTo({ left: Math.max(0, left), behavior: reduceMotion ? 'auto' : 'smooth' });
      } catch (e) {
        el.nav.scrollLeft = Math.max(0, left);
      }
    }
  }

  function setMapActive(id) {
    if (!el.mapDots) return;
    var dots = el.mapDots.querySelectorAll('.map-dot');
    Array.prototype.forEach.call(dots, function (dot) {
      var on = dot.getAttribute('data-scene') === id;
      dot.classList.toggle('is-active', on);
      if (on) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  }

  /* --------------------------------------------------------- spinner/loader */
  function showSpinner(s) {
    if (!el.spinner) return;
    clearTimeout(S.spinnerTimer);
    setText(el.spinnerLabel, s ? '正在载入 ' + s.num + ' · ' + s.zh : '正在载入全景');
    S.spinnerTimer = setTimeout(function () {
      el.spinner.classList.add('is-on');
    }, reduceMotion ? 0 : 160);
  }

  function hideSpinner() {
    clearTimeout(S.spinnerTimer);
    if (el.spinner) el.spinner.classList.remove('is-on');
  }

  function setProgress(frac, loaded, total) {
    var pct = clamp(Math.round((frac || 0) * 100), 0, 100);
    setText(el.loaderPct, String(pct));
    if (el.loaderFill) el.loaderFill.style.width = pct + '%';
    if (el.loader) el.loader.setAttribute('aria-valuenow', String(pct));
    if (el.loaderBytes) {
      if (total) setText(el.loaderBytes, fmtSize(loaded) + ' / ' + fmtSize(total));
      else if (loaded) setText(el.loaderBytes, fmtSize(loaded));
      else setText(el.loaderBytes, '0.0 MB');
    }
  }

  function hideLoader() {
    if (S.loaderDone) return;
    S.loaderDone = true;
    clearTimeout(S.watchdog);
    setTimeout(loadPlanImage, 500);
    setProgress(1);
    var wait = reduceMotion ? 0 : 300;
    setTimeout(function () {
      if (!el.loader) return;
      el.loader.classList.add('is-hidden');
      el.loader.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('is-booting');
    }, wait);
  }

  function failLoader(title, detail) {
    S.loaderError = true;
    if (!el.loader) return;
    el.loader.classList.add('is-error');
    setText(el.loaderLabel, title);
    setText(el.loaderPct, '—');
    setText(el.loaderBytes, detail || '');
    if (el.loaderFill) el.loaderFill.style.width = '0%';
    if (el.loaderRetry) el.loaderRetry.hidden = false;
    document.body.classList.remove('is-booting');
  }

  /* ---- first pano preload: real byte progress, then Pannellum loads it ---- */
  function loadImageWithProgress(src, onProgress) {
    // STN_INLINE_MODEL: single-file build - images come from window.STN_ASSETS
    if (window.STN_ASSETS) {
      var inline = window.STN_LOOKUP ? window.STN_LOOKUP(src) : null;
      if (inline) {
        onProgress(1, 1, 1);
        return new Promise(function (resolve, reject) {
          var im = new Image();
          im.onload = function () { resolve(im); };
          im.onerror = function () { reject(new Error("decode")); };
          im.src = inline;
        });
      }
    }
    return loadImageOverNetwork(src, onProgress);
}

function loadImageOverNetwork(src, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        try { xhr.abort(); } catch (e) { /* noop */ }
        reject(new Error('timeout'));
      }, 45000);

      xhr.open('GET', src, true);
      xhr.responseType = 'blob';
      xhr.onprogress = function (ev) {
        if (settled) return;
        if (ev.lengthComputable) onProgress(ev.loaded / ev.total, ev.loaded, ev.total);
        else onProgress(0.35, ev.loaded || 0, 0);
      };
      xhr.onerror = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('network'));
      };
      xhr.onload = function () {
        if (settled) return;
        if (xhr.status !== 200) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('HTTP ' + xhr.status));
          return;
        }
        var url = URL.createObjectURL(xhr.response);
        var img = new Image();
        img.onload = function () {
          settled = true;
          clearTimeout(timer);
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = function () {
          settled = true;
          clearTimeout(timer);
          URL.revokeObjectURL(url);
          reject(new Error('decode'));
        };
        img.src = url;
      };
      xhr.send();
    });
  }

  function warmStation(id) {
    if (!id || S.warmed[id]) return;
    try {
      if (navigator.connection && navigator.connection.saveData) return;
    } catch (e) { /* noop */ }
    var img = new Image();
    img.decoding = 'async';
    img.src = PANO_DIR + id + '.jpg';
    S.warmed[id] = true;
  }

  function warmNeighbours(s) {
    var n = S.stations.length;
    if (n < 2) return;
    warmStation(S.stations[(s.index + 1) % n].id);
    warmStation(S.stations[(s.index - 1 + n) % n].id);
  }

  /* -------------------------------------------------------------- intro/misc */
  function setIntroPoster(s) {
    if (!s || !el.introBg || !S.introOpen) return;
    var poster = POSTER_DIR + s.id + '.jpg';
    probeImage(poster).then(function () {
      el.introBg.style.backgroundImage = 'url("' + poster + '")';
      el.introBg.classList.add('is-ready');
    }).catch(function () {
      return probeImage(PANO_DIR + s.id + '.jpg').then(function () {
        el.introBg.style.backgroundImage = 'url("' + PANO_DIR + s.id + '.jpg")';
        el.introBg.classList.add('is-ready');
      });
    }).catch(function () {
      el.introBg.classList.add('is-flat');
    });
  }

  function probeImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(src); };
      img.onerror = function () { reject(new Error('missing')); };
      img.src = src;
    });
  }

  function hideIntroStatic() {
    S.introOpen = false;
    if (el.intro) {
      el.intro.classList.add('is-hidden');
      el.intro.setAttribute('aria-hidden', 'true');
    }
    setTourInert(false);
  }

  function enterTour(sceneId) {
    var fromIntro = S.introOpen;
    hideIntroStatic();
    document.body.classList.add('is-touring');
    if (el.intro) {
      setTimeout(function () {
        if (!S.introOpen && el.intro) el.intro.style.display = 'none';
      }, reduceMotion ? 0 : 950);
    }
    loadPlanImage();
    var target = sceneId || (S.current && S.current.id) || S.startId;
    if (target) {
      setHash(target);
      if (S.panoFailed) showPanoError(S.byId[target]);
      else if (!S.current || S.current.id !== target) requestScene(target);
    }
    clearTimeout(S.hintTimer);
    S.hintTimer = setTimeout(function () { if (el.hint) el.hint.classList.add('is-faded'); }, 9000);
    if (fromIntro) {
      // Give the intro index a moment before it disappears from the a11y tree.
      setTimeout(function () { if (el.intro) el.intro.setAttribute('aria-hidden', 'true'); }, 0);
    }
  }

  function setTourInert(on) {
    [el.panorama, el.top, el.cap, el.mapCard, el.bottom].forEach(function (node) {
      if (!node) return;
      if (on) {
        node.setAttribute('inert', '');
        node.setAttribute('aria-hidden', 'true');
      } else {
        node.removeAttribute('inert');
        node.removeAttribute('aria-hidden');
      }
    });
  }

  /* ------------------------------------------------------------------ hash */
  function readHash() {
    var raw = (location.hash || '').replace(/^#\/?/, '').trim();
    if (!raw) return null;
    raw = raw.split(/[?&]/)[0];
    return S.byId[raw] ? raw : null;
  }

  function setHash(id) {
    if (!id) return;
    var next = '#' + id;
    if (location.hash === next) return;
    try { history.replaceState(null, '', next); } catch (e) { location.hash = next; }
  }

  function onHashChange() {
    var id = readHash();
    if (!id) return;
    if (S.current && S.current.id === id) return;
    if (S.introOpen) { enterTour(id); return; }
    requestScene(id);
  }

  /* ------------------------------------------------------------------ toast */
  function toast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.add('is-on');
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(function () { el.toast.classList.remove('is-on'); }, 2600);
  }

  /* --------------------------------------------------------------- controls */
  function onViewerGrab() {
    if (!S.rotating) return;
    S.rotating = false;
    try { S.viewer.stopAutoRotate(); } catch (e) { /* noop */ }
    if (el.btnRotate) el.btnRotate.setAttribute('aria-pressed', 'false');
    toast('自动环顾已暂停');
  }

  function toggleRotate() {
    if (!S.viewer || !S.viewerLoaded) { toast('全景尚未就绪'); return; }
    S.rotating = !S.rotating;
    if (S.rotating) S.viewer.startAutoRotate(1.1);
    else S.viewer.stopAutoRotate();
    if (el.btnRotate) el.btnRotate.setAttribute('aria-pressed', S.rotating ? 'true' : 'false');
    toast(S.rotating ? '自动环顾已开启 · 拖动可暂停' : '自动环顾已关闭');
  }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  }

  function syncFullscreenButton() {
    var on = isFullscreen();
    if (el.btnFs) el.btnFs.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (el.fsLabel) el.fsLabel.textContent = on ? '退出全屏' : '全屏';
  }

  function toggleFullscreen() {
    var root = document.documentElement;
    if (isFullscreen()) {
      var exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
      if (!exit) { toast('当前浏览器不支持全屏'); return; }
      try {
        var p = exit.call(document);
        if (p && p.catch) p.catch(function () { toast('无法退出全屏'); });
      } catch (e) { toast('无法退出全屏'); }
      return;
    }
    var req = root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen;
    if (!req) { toast('当前浏览器不支持全屏（iOS Safari 请使用“添加到主屏幕”）'); return; }
    try {
      var q = req.call(root);
      if (q && q.catch) q.catch(function () { toast('无法进入全屏'); });
    } catch (e) { toast('无法进入全屏'); }
  }

  function openInfo(open) {
    if (!el.modal || open === S.modalOpen) return;
    S.modalOpen = open;
    el.modal.classList.toggle('is-open', open);
    el.modal.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      S.lastFocus = document.activeElement;
      setTimeout(function () { if (el.modalClose) el.modalClose.focus(); }, 40);
    } else if (S.lastFocus && S.lastFocus.focus) {
      S.lastFocus.focus();
      S.lastFocus = null;
    }
  }

  function trapModalFocus(ev) {
    if (!el.modalCard) return;
    var nodes = el.modalCard.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
    var list = Array.prototype.filter.call(nodes, function (n) { return !n.disabled && n.offsetParent !== null; });
    if (!list.length) return;
    var idx = list.indexOf(document.activeElement);
    if (ev.shiftKey) {
      if (idx <= 0) { ev.preventDefault(); list[list.length - 1].focus(); }
    } else if (idx === list.length - 1) {
      ev.preventDefault();
      list[0].focus();
    }
  }

  function stepStation(delta) {
    if (!S.current) return;
    var n = S.stations.length;
    if (n < 2) return;
    var next = (S.current.index + delta + n) % n;
    requestScene(S.stations[next].id);
  }

  function onKey(ev) {
    if (ev.defaultPrevented) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    var key = ev.key;

    if (S.modalOpen) {
      if (key === 'Escape') { ev.preventDefault(); openInfo(false); return; }
      if (key === 'Tab') { trapModalFocus(ev); return; }
      return;
    }

    if (key === 'Escape') {
      // Nothing to close outside the modal; keep the browser default.
      return;
    }

    if (key === 'ArrowRight') {
      ev.preventDefault();
      ev.stopPropagation();
      if (!S.introOpen) stepStation(1);
      return;
    }
    if (key === 'ArrowLeft') {
      ev.preventDefault();
      ev.stopPropagation();
      if (!S.introOpen) stepStation(-1);
      return;
    }
    if (key === 'r' || key === 'R') {
      ev.preventDefault();
      if (!S.introOpen) toggleRotate();
      return;
    }
    if (key === 'f' || key === 'F') {
      ev.preventDefault();
      toggleFullscreen();
      return;
    }
    if (/^[1-8]$/.test(key)) {
      var idx = Number(key) - 1;
      if (idx < S.stations.length) {
        ev.preventDefault();
        if (S.introOpen) enterTour(S.stations[idx].id);
        else requestScene(S.stations[idx].id);
      }
    }
  }

  /* ---------------------------------------------------------------- wiring */
  function bindStaticUI() {
    if (el.btnEnter) el.btnEnter.addEventListener('click', function () { enterTour(); });
    if (el.btnRotate) el.btnRotate.addEventListener('click', toggleRotate);
    if (el.btnInfo) el.btnInfo.addEventListener('click', function () { openInfo(true); });
    if (el.btnFs) el.btnFs.addEventListener('click', toggleFullscreen);
    if (el.modalClose) el.modalClose.addEventListener('click', function () { openInfo(false); });
    var close2 = $('btn-close-info-2');
    if (close2) close2.addEventListener('click', function () { openInfo(false); });
    if (el.modal) {
      el.modal.addEventListener('click', function (ev) {
        if (ev.target && ev.target.getAttribute && ev.target.getAttribute('data-close')) openInfo(false);
      });
    }
    var retryPano = $('btn-retry-pano');
    if (retryPano) retryPano.addEventListener('click', function () { location.reload(); });
    if (el.loaderRetry) el.loaderRetry.addEventListener('click', function () { location.reload(); });

    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', layoutMap);
    document.addEventListener('fullscreenchange', syncFullscreenButton);
    document.addEventListener('webkitfullscreenchange', syncFullscreenButton);
    document.addEventListener('msfullscreenchange', syncFullscreenButton);

    if (window.ResizeObserver && el.mapStage) {
      try { new ResizeObserver(layoutMap).observe(el.mapStage); } catch (e) { /* noop */ }
    }

    if (window.matchMedia) {
      try {
        var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        var handler = function (ev) { reduceMotion = ev.matches; };
        if (mq.addEventListener) mq.addEventListener('change', handler);
        else if (mq.addListener) mq.addListener(handler);
      } catch (e) { /* noop */ }
    }
  }

  /* -------------------------------------------------------------- error card */
  function writePanoError(s) {
    if (!s) return;
    if (el.pePath) el.pePath.textContent = PANO_DIR + s.id + '.jpg';
    if (el.peTitle) el.peTitle.textContent = s.num + ' · ' + s.zh + ' 全景图尚未就绪';
  }

  function showPanoError(s) {
    if (!s || S.introOpen) return;
    writePanoError(s);
    if (el.panoError) el.panoError.hidden = false;
    if (el.spinner) el.spinner.classList.remove('is-on');
  }

  function hidePanoError() {
    if (el.panoError) el.panoError.hidden = true;
  }

  /* ------------------------------------------------------------------- go */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

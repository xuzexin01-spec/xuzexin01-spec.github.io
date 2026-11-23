/* 页面主逻辑：导航、滚动进度、SVG 与 Canvas 交互模拟。 */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* BOOT */
  const boot = document.getElementById('boot');
  const bootFill = document.getElementById('bootFill');
  const bootPct = document.getElementById('bootPct');
  const root = document.documentElement;
  let fontsOk = false, bootDone = false;
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { fontsOk = true; });
  } else { fontsOk = true; }

  function renderBoot(p) {
    bootFill.style.width = p + '%';
    bootPct.textContent = String(p).padStart(3, '0');
  }
  function finishBoot() {
    if (bootDone) return;
    bootDone = true;
    renderBoot(100);
    if (!boot) { root.classList.add('is-ready'); root.classList.remove('is-booting'); return; }
    boot.classList.add('is-flash');
    setTimeout(function () {
      boot.classList.add('is-out');
      setTimeout(function () { root.classList.add('is-ready'); }, 420);
      setTimeout(function () {
        root.classList.remove('is-booting');
        if (boot.parentNode) boot.parentNode.removeChild(boot);
      }, 840);
    }, 115);
  }
  (function bootLoop() {
    const started = performance.now();
    const MIN = REDUCE ? 450 : 1650;
    function step(now) {
      if (bootDone) return;
      const t = Math.min(1, (now - started) / MIN);
      const eased = 1 - Math.pow(1 - t, 2.6);
      const cap = fontsOk ? 100 : 93;
      const p = Math.min(cap, Math.round(eased * 100));
      renderBoot(p);
      if (p >= 100) { finishBoot(); return; }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  })();
  setTimeout(function () { if (!bootDone) finishBoot(); }, 7000);

  /* NAV / PROGRESS */
  const railItems = $$('.rail__item');
  const mnavItems = $$('.mnav__item');
  const sections = $$('[data-section]');
  const railIdx = $('#railIdx');
  const railTrack = $('#railTrack');
  const railPct = $('#railPct');
  const progressBar = $('#progressBar');
  const topbar = $('.topbar');

  function setActive(i) {
    railItems.forEach(el => el.classList.toggle('is-active', +el.dataset.i === i));
    mnavItems.forEach(el => el.classList.toggle('is-active', +el.dataset.i === i));
    if (railIdx) railIdx.textContent = String(i).padStart(2, '0');
  }
  if ('IntersectionObserver' in window) {
    const secIO = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActive(+e.target.dataset.section); });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    sections.forEach(s => secIO.observe(s));
  }
  function onScroll() {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const p = h > 0 ? clamp(window.scrollY / h * 100, 0, 100) : 0;
    if (railTrack) railTrack.style.height = p + '%';
    if (railPct) railPct.textContent = String(Math.round(p)).padStart(2, '0');
    if (progressBar) progressBar.style.transform = 'scaleX(' + (p / 100) + ')';
    if (topbar) topbar.classList.toggle('is-scrolled', window.scrollY > 24);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* REVEAL */
  if ('IntersectionObserver' in window && !REDUCE) {
    const revIO = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); revIO.unobserve(e.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    $$('.reveal').forEach(el => revIO.observe(el));
  } else {
    $$('.reveal').forEach(el => el.classList.add('is-in'));
  }

  /* HERO PARTICLES */
  const field = $('#heroField');
  if (field) {
    const ctx = field.getContext('2d');
    let W = 0, H = 0, dots = [];
    function sizeField() {
      const box = field.parentElement.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = box.width; H = box.height;
      field.width = W * dpr; field.height = H * dpr;
      field.style.width = W + 'px'; field.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!dots.length) {
        dots = Array.from({ length: 40 }, () => ({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - .5) * .22, vy: (Math.random() - .5) * .22,
          r: Math.random() * 1.3 + .4,
          warm: Math.random() > .82
        }));
      }
    }
    function tick(loop) {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < dots.length; i++) {
        const p = dots[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.warm ? 'rgba(232,87,31,.5)' : 'rgba(44,93,124,.28)';
        ctx.fill();
        for (let j = i + 1; j < dots.length; j++) {
          const q = dots[j];
          const dx = p.x - q.x, dy = p.y - q.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 120) {
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = 'rgba(44,93,124,' + (1 - d / 120) * .07 + ')';
            ctx.lineWidth = .7; ctx.stroke();
          }
        }
      }
      if (loop) requestAnimationFrame(() => tick(true));
    }
    sizeField();
    window.addEventListener('resize', sizeField);
    window.addEventListener('load', sizeField);
    tick(!REDUCE);
  }

  /* AIRFRAME */
  const nodeData = [
    {
      code: '01 / PERCEPTION', title: '360° 激光雷达与双目 SLAM',
      desc: '每秒 20 万束激光，测出每一面墙的距离。',
      metric: '±1.5 cm', wave: '点云反射强度',
      slider: '扫描频率', unit: 'Hz', min: 20, max: 160, val: 80,
      specs: [['点频', '200K /s'], ['视场', '360°'], ['精度', '±1.5 cm']]
    },
    {
      code: '02 / COMPUTE', title: '275 TOPS 端侧推理',
      desc: '断网也能在 2 毫秒内认出树枝、电线与行人。',
      metric: '1.8 ms', wave: '张量吞吐率',
      slider: '算力分配', unit: 'TOPS', min: 50, max: 275, val: 180,
      specs: [['算力', '275 TOPS'], ['延迟', '1.8 ms'], ['功耗', '8 W']]
    },
    {
      code: '03 / ACTUATION', title: 'FOC 无刷动力系统',
      desc: '每秒 1000 次微调四个电机的扭矩与转速。',
      metric: '1000 Hz', wave: '三相电流谐波',
      slider: '动态增益', unit: 'kHz', min: 1, max: 4, val: 2,
      specs: [['响应', '1000 Hz'], ['推力', '4×1.6 kg'], ['电压', '6S']]
    },
    {
      code: '04 / DOCKING', title: 'UWB 厘米级自动归巢',
      desc: '开舱、盲降、补能，误差小于 2 厘米。',
      metric: '< 2 cm', wave: 'UWB 定位信噪比',
      slider: '广播速率', unit: 'Mbps', min: 1, max: 9, val: 4,
      specs: [['定位', '±2 cm'], ['协议', 'UWB'], ['充电', '90 W']]
    }
  ];
  let node = 0;
  const slider = $('#nodeSlider');

  function paintNode() {
    const d = nodeData[node];
    $('#nodeCode').textContent = d.code;
    $('#nodeTitle').textContent = d.title;
    $('#nodeDesc').textContent = d.desc;
    $('#nodeSpecs').innerHTML = d.specs.map(s => '<div><dt>' + s[0] + '</dt><dd>' + s[1] + '</dd></div>').join('');
    $('#waveLabel').textContent = d.wave;
    $('#waveMetric').textContent = d.metric;
    $('#sliderLabel').textContent = d.slider;
    $('#sliderUnit').textContent = d.unit;
    slider.min = d.min; slider.max = d.max; slider.value = d.val;
    $('#sliderVal').textContent = d.val;
    $$('.callout').forEach(el => el.classList.toggle('is-active', +el.dataset.node === node));
    $$('.node-pill').forEach(el => el.classList.toggle('is-on', +el.dataset.node === node));
    $$('.node-dot').forEach(el => el.classList.toggle('is-active', +el.dataset.node === node));
    $$('.leader').forEach(el => el.classList.toggle('is-active', +el.dataset.node === node));
  }
  $$('.callout, .node-pill').forEach(el => el.addEventListener('click', () => { node = +el.dataset.node; paintNode(); }));
  slider.addEventListener('input', () => { $('#sliderVal').textContent = slider.value; });
  paintNode();

  /* VIEW TOGGLE */
  const stageCard = $('#stageCard');
  $$('.seg__btn').forEach(btn => btn.addEventListener('click', () => {
    const out = btn.dataset.view === 'out';
    stageCard.classList.toggle('is-outline', out);
    $$('.seg__btn').forEach(b => {
      const on = b === btn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }));

  /* WAVE */
  const waveCanvas = $('#waveCanvas');
  const wctx = waveCanvas.getContext('2d');
  let phase = 0;
  function drawWave(loop) {
    const rect = waveCanvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, rect.width), H = Math.max(1, rect.height);
    if (waveCanvas.width !== Math.round(W * dpr) || waveCanvas.height !== Math.round(H * dpr)) {
      waveCanvas.width = W * dpr; waveCanvas.height = H * dpr;
    }
    wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wctx.clearRect(0, 0, W, H);
    const freq = (+slider.value) / ((+slider.max + +slider.min) / 2 || 1);
    phase += 0.028 * (0.6 + freq * 0.7);
    wctx.strokeStyle = 'rgba(13,27,34,.07)'; wctx.lineWidth = 1;
    wctx.beginPath(); wctx.moveTo(0, H / 2); wctx.lineTo(W, H / 2); wctx.stroke();
    for (let x = 0; x < W; x += W / 6) { wctx.beginPath(); wctx.moveTo(x, 0); wctx.lineTo(x, H); wctx.stroke(); }
    wctx.beginPath();
    wctx.strokeStyle = 'rgba(232,87,31,.85)'; wctx.lineWidth = 1.4;
    for (let x = 0; x <= W; x += 2) {
      const y = H / 2 + Math.sin(x * 0.045 * freq + phase) * (H * 0.26) * Math.sin(x * 0.011 + phase * 0.4) + Math.cos(x * 0.1 - phase * 1.3) * 4;
      if (x === 0) wctx.moveTo(x, y); else wctx.lineTo(x, y);
    }
    wctx.stroke();
    wctx.beginPath();
    wctx.strokeStyle = 'rgba(44,93,124,.35)'; wctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 2) {
      const y = H / 2 + Math.cos(x * 0.03 * freq - phase * 0.7) * (H * 0.18);
      if (x === 0) wctx.moveTo(x, y); else wctx.lineTo(x, y);
    }
    wctx.stroke();
    if (loop) requestAnimationFrame(() => drawWave(true));
  }
  drawWave(!REDUCE);

  /* TEARDOWN */
  const tdPanel = $('.td-stage');
  const explodeRange = $('#explodeRange');
  const tdLayers = $$('.td-layer');
  const tdBar = $$('.td-bar i');
  const tdStageRows = $$('.td-stages__row');
  let manualExplode = false, lastExplode = -1;
  const stageCopy = [
    { title: '整机', desc: '四层结构压在一起，像一枚完整的金属胶囊。', bus: 'CAN-FD / PCIe', thermal: '下洗气流' },
    { title: '分离', desc: '感知层抬起，点云经高速总线直送算力层。', bus: '16 GB/s 直连', thermal: '石墨烯均热' },
    { title: '全展', desc: '动力层执行，能源层供给，所有接口暴露在外。', bus: '双冗余环网', thermal: '全温域 BMS' }
  ];
  function applyExplode(pct) {
    const p = clamp(Math.round(pct), 0, 100);
    if (p === lastExplode) return;
    lastExplode = p;
    tdPanel.style.setProperty('--ex', (p / 100).toFixed(3));
    $('#explodePct').textContent = String(p).padStart(3, '0');
    explodeRange.value = p;
    const stage = p < 25 ? 0 : p < 60 ? 1 : 2;
    const litCount = p < 25 ? 1 : p < 60 ? 2 : p < 90 ? 3 : 4;
    $('#stageNum').textContent = String(stage + 1).padStart(2, '0');
    $('#stageTitle').textContent = stageCopy[stage].title;
    $('#stageDesc').textContent = stageCopy[stage].desc;
    $('#mBus').textContent = stageCopy[stage].bus;
    $('#mThermal').textContent = stageCopy[stage].thermal;
    tdBar.forEach((b, i) => b.classList.toggle('is-on', i <= stage));
    tdLayers.forEach((l, i) => l.classList.toggle('is-lit', i < litCount));
    tdStageRows.forEach((r, i) => r.classList.toggle('is-on', i === stage));
    $$('.td-preset').forEach(b => b.classList.toggle('is-on', +b.dataset.explode === p));
    if (window.AETHER3D) window.AETHER3D.setExplode(p);
  }
  explodeRange.addEventListener('input', () => { manualExplode = true; applyExplode(+explodeRange.value); });
  $$('.td-preset').forEach(b => b.addEventListener('click', () => { manualExplode = true; applyExplode(+b.dataset.explode); }));
  function explodeFromScroll() {
    const sec = document.getElementById('teardown');
    const r = sec.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.top < vh && r.bottom > 0 && !manualExplode) {
      applyExplode(((vh * 0.84 - r.top) / (vh * 0.92)) * 100);
    }
    if (r.bottom < -80 || r.top > vh + 80) manualExplode = false;
  }

  /* FLIGHT */
  const simCanvas = $('#simCanvas');
  const sctx = simCanvas.getContext('2d');
  const simMeta = [
    { badge: '01 / SEE', title: '激光雷达点云建图', btn: '移动障碍物' },
    { badge: '02 / PLAN', title: '实时避障轨迹重规划', btn: '换位重算' },
    { badge: '03 / CONTROL', title: 'PID 姿态自稳环', btn: '注入阵风' }
  ];
  let step = 0;
  let obstacle = { x: 0.64, y: 0.46 };
  let pidAngle = 0, pidVel = 0, simT = 0;
  function setStep(i, fromScroll) {
    if (step === i && !fromScroll) return;
    step = i;
    $('#simBadge').textContent = simMeta[i].badge;
    $('#simTitle').textContent = simMeta[i].title;
    $('#simAction').textContent = simMeta[i].btn;
    $$('.flight__tab').forEach(b => b.classList.toggle('is-on', +b.dataset.step === i));
    $$('.flight-step').forEach(b => b.classList.toggle('is-on', +b.dataset.stepIndex === i));
  }
  $$('.flight__tab').forEach(b => b.addEventListener('click', () => {
    setStep(+b.dataset.step);
    const target = $('.flight-step[data-step-index="' + b.dataset.step + '"]');
    if (target) target.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'center' });
  }));
  $('#simAction').addEventListener('click', () => {
    if (step === 2) pidVel += (Math.random() > .5 ? 1 : -1) * .5;
    else { obstacle.x = .38 + Math.random() * .36; obstacle.y = .26 + Math.random() * .46; }
  });
  simCanvas.addEventListener('mousemove', e => {
    const r = simCanvas.getBoundingClientRect();
    obstacle.x = clamp((e.clientX - r.left) / r.width, .24, .82);
    obstacle.y = clamp((e.clientY - r.top) / r.height, .22, .78);
  });
  simCanvas.addEventListener('click', () => { if (step === 2) pidVel += .45; });
  function drawSim(loop) {
    const r = simCanvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, r.width), H = Math.max(1, r.height);
    if (simCanvas.width !== Math.round(W * dpr) || simCanvas.height !== Math.round(H * dpr)) {
      simCanvas.width = W * dpr; simCanvas.height = H * dpr;
    }
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, W, H);
    simT += .02;
    sctx.strokeStyle = 'rgba(13,27,34,.05)'; sctx.lineWidth = 1;
    for (let x = 0; x < W; x += 38) { sctx.beginPath(); sctx.moveTo(x, 0); sctx.lineTo(x, H); sctx.stroke(); }
    for (let y = 0; y < H; y += 38) { sctx.beginPath(); sctx.moveTo(0, y); sctx.lineTo(W, y); sctx.stroke(); }
    const ox = obstacle.x * W, oy = obstacle.y * H;
    if (step === 0) {
      const sx = W * .17, sy = H * .5;
      for (let i = -15; i <= 15; i++) {
        const ang = i * .062 + Math.sin(simT * .6) * .1;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        let len = W * .82;
        const tx = ox - sx, ty = oy - sy;
        const proj = tx * dx + ty * dy;
        if (proj > 0) {
          const perp = tx * tx + ty * ty - proj * proj;
          if (perp < 34 * 34) len = Math.min(len, proj - Math.sqrt(34 * 34 - perp));
        }
        const ex = sx + dx * len, ey = sy + dy * len;
        const hit = len < W * .78;
        sctx.beginPath(); sctx.moveTo(sx, sy); sctx.lineTo(ex, ey);
        sctx.strokeStyle = hit ? 'rgba(232,87,31,.65)' : 'rgba(13,27,34,.14)';
        sctx.lineWidth = hit ? 1.4 : 1; sctx.stroke();
        if (hit) { sctx.beginPath(); sctx.arc(ex, ey, 2.6, 0, Math.PI * 2); sctx.fillStyle = '#E8571F'; sctx.fill(); }
      }
      sctx.beginPath(); sctx.arc(sx, sy, 10, 0, Math.PI * 2); sctx.fillStyle = '#E8571F'; sctx.fill();
      sctx.beginPath(); sctx.arc(sx, sy, 20, 0, Math.PI * 2); sctx.strokeStyle = 'rgba(232,87,31,.3)'; sctx.stroke();
      sctx.beginPath(); sctx.arc(ox, oy, 34, 0, Math.PI * 2);
      sctx.fillStyle = 'rgba(44,93,124,.08)'; sctx.strokeStyle = 'rgba(44,93,124,.55)';
      sctx.setLineDash([4, 4]); sctx.lineWidth = 1.2; sctx.fill(); sctx.stroke(); sctx.setLineDash([]);
      sctx.fillStyle = 'rgba(13,27,34,.55)'; sctx.font = '9px "JetBrains Mono", monospace';
      sctx.fillText('RANGE ' + (Math.hypot(ox - sx, oy - sy) / 100).toFixed(2) + ' M', ox + 44, oy - 30);
    } else if (step === 1) {
      const start = { x: W * .12, y: H * .5 }, goal = { x: W * .88, y: H * .5 };
      sctx.beginPath(); sctx.arc(ox, oy, 40, 0, Math.PI * 2);
      sctx.fillStyle = 'rgba(232,87,31,.06)'; sctx.strokeStyle = 'rgba(232,87,31,.4)';
      sctx.setLineDash([4, 5]); sctx.stroke(); sctx.setLineDash([]);
      const dir = oy > H * .5 ? -1 : 1;
      const cx = ox, cy = oy + dir * 112;
      sctx.beginPath(); sctx.moveTo(start.x, start.y);
      sctx.quadraticCurveTo(cx, cy, goal.x, goal.y);
      sctx.strokeStyle = 'rgba(232,87,31,.85)'; sctx.lineWidth = 1.8; sctx.stroke();
      const t = (simT * .22) % 1;
      const ax = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * cx + t * t * goal.x;
      const ay = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * cy + t * t * goal.y;
      sctx.beginPath(); sctx.arc(ax, ay, 5, 0, Math.PI * 2); sctx.fillStyle = '#E8571F'; sctx.fill();
      sctx.beginPath(); sctx.arc(ax, ay, 13, 0, Math.PI * 2); sctx.strokeStyle = 'rgba(232,87,31,.3)'; sctx.stroke();
      sctx.fillStyle = 'rgba(13,27,34,.4)'; sctx.font = '8px "JetBrains Mono", monospace';
      sctx.fillText('START', start.x - 10, start.y + 22);
      sctx.fillText('GOAL', goal.x - 8, goal.y + 22);
    } else {
      const kp = .07, kd = .13;
      pidVel += -kp * pidAngle - kd * pidVel;
      pidAngle += pidVel;
      const cx = W * .5, cy = H * .5;
      sctx.beginPath(); sctx.setLineDash([5, 6]);
      sctx.moveTo(W * .14, cy); sctx.lineTo(W * .86, cy);
      sctx.strokeStyle = 'rgba(44,93,124,.3)'; sctx.lineWidth = 1; sctx.stroke(); sctx.setLineDash([]);
      sctx.save(); sctx.translate(cx, cy); sctx.rotate(pidAngle);
      sctx.beginPath(); sctx.moveTo(-110, 0); sctx.lineTo(110, 0);
      sctx.strokeStyle = 'rgba(13,27,34,.55)'; sctx.lineWidth = 4; sctx.stroke();
      sctx.beginPath(); sctx.moveTo(-100, 0); sctx.lineTo(-100, -Math.max(10, 34 - pidAngle * 90));
      sctx.strokeStyle = 'rgba(13,27,34,.5)'; sctx.lineWidth = 3; sctx.stroke();
      sctx.beginPath(); sctx.moveTo(100, 0); sctx.lineTo(100, -Math.max(10, 34 + pidAngle * 90));
      sctx.strokeStyle = '#E8571F'; sctx.lineWidth = 3; sctx.stroke();
      sctx.beginPath(); sctx.arc(-100, 0, 4, 0, Math.PI * 2); sctx.fillStyle = 'rgba(13,27,34,.55)'; sctx.fill();
      sctx.beginPath(); sctx.arc(100, 0, 4, 0, Math.PI * 2); sctx.fillStyle = '#E8571F'; sctx.fill();
      sctx.restore();
      sctx.fillStyle = 'rgba(13,27,34,.55)'; sctx.font = '9px "JetBrains Mono", monospace';
      sctx.fillText('TILT ' + (pidAngle * 180 / Math.PI).toFixed(1) + '°   PID 1000 HZ', 16, 24);
    }
    if (loop) requestAnimationFrame(() => drawSim(true));
  }
  drawSim(!REDUCE);

  if ('IntersectionObserver' in window) {
    const stepIO = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && window.innerWidth > 1100) setStep(+e.target.dataset.stepIndex);
      });
    }, { rootMargin: '-42% 0px -42% 0px' });
    $$('.flight-step').forEach(el => stepIO.observe(el));
  }

  /* MOTORS */
  const maneuvers = {
    hover:   { label: '悬停 · 四桨同速', rpm: [5200, 5200, 5200, 5200], pct: [55, 55, 55, 55] },
    forward: { label: '前倾 · 后桨加速', rpm: [4400, 4400, 7400, 7400], pct: [42, 42, 82, 82] },
    yaw:     { label: '偏航 · 对角差速', rpm: [7200, 4100, 4100, 7200], pct: [80, 38, 38, 80] },
    climb:   { label: '跃升 · 全桨满推', rpm: [8800, 8800, 8800, 8800], pct: [96, 96, 96, 96] }
  };
  $$('[data-maneuver]').forEach(btn => btn.addEventListener('click', () => {
    const m = maneuvers[btn.dataset.maneuver];
    $('#maneuverLabel').textContent = m.label;
    for (let i = 0; i < 4; i++) {
      $('#fill' + i).style.width = m.pct[i] + '%';
      $('#val' + i).innerHTML = m.rpm[i].toLocaleString() + '<i>rpm</i>';
    }
    $$('[data-maneuver]').forEach(b => b.classList.toggle('is-on', b === btn));
  }));

  /* GIMBAL */
  const gRange = $('#gimbalRange');
  const gBody = $('#gimbalBody');
  const gTilt = $('#bodyTilt');
  const gComp = $('#camComp');
  function paintGimbal() {
    const v = +gRange.value;
    gBody.style.transform = 'rotate(' + v + 'deg)';
    gTilt.innerHTML = (v >= 0 ? '+' : '') + v.toFixed(1) + '<i>°</i>';
    gComp.innerHTML = (v >= 0 ? '-' : '+') + Math.abs(v).toFixed(1) + '<i>°</i>';
  }
  gRange.addEventListener('input', paintGimbal);
  paintGimbal();

  /* MISSIONS */
  const missions = {
    inspect: {
      title: '<b>MISSION A</b> · 沿线路自动巡航与缺陷识别',
      steps: [
        ['01 / 巡航', '沿杆塔航线飞行', '自动避障，按预设高度通过。'],
        ['02 / 识别', '热成像定位过热点', '过滤阳光反射等常见误报。'],
        ['03 / 归档', '生成缺陷报告', '位置、截图与温度一并归档。']
      ]
    },
    map: {
      title: '<b>MISSION B</b> · 倾斜摄影与三维重建',
      steps: [
        ['01 / 规划', '按比例尺生成航线', '自动计算重叠率与飞行高度。'],
        ['02 / 采集', '五向倾斜拍摄', '同步记录 RTK 定位数据。'],
        ['03 / 输出', '点云与正射影像', '输出模型、正射图与标高。']
      ]
    },
    guard: {
      title: '<b>MISSION C</b> · 夜间安防与自动归巢',
      steps: [
        ['01 / 起飞', '告警触发自动升空', '机巢开舱，无光环境静音巡航。'],
        ['02 / 识别', '热源与人员识别', '端侧模型过滤小动物误报。'],
        ['03 / 归巢', '厘米级降落补能', '舱盖合拢，无线充电。']
      ]
    }
  };
  function paintMission(key) {
    const m = missions[key];
    $('#missionTitle').innerHTML = m.title;
    $('#missionChain').innerHTML = m.steps.map(s =>
      '<div class="chain-step"><div class="chain-step__num">' + s[0] + '</div><h4>' + s[1] + '</h4><p>' + s[2] + '</p></div>'
    ).join('');
  }
  $$('[data-mission]').forEach(btn => btn.addEventListener('click', () => {
    paintMission(btn.dataset.mission);
    $$('[data-mission]').forEach(b => b.classList.toggle('is-on', b === btn));
  }));
  paintMission('inspect');
  applyExplode(0);

  /* SCROLL TICK */
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { explodeFromScroll(); ticking = false; });
  }, { passive: true });
  explodeFromScroll();

  document.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (e.target.matches('input, textarea')) return;
    const idx = sections.findIndex(s => {
      const r = s.getBoundingClientRect();
      return r.top <= window.innerHeight * .5 && r.bottom > window.innerHeight * .5;
    });
    if (idx < 0) return;
    const next = clamp(idx + (e.key === 'ArrowDown' ? 1 : -1), 0, sections.length - 1);
    if (next !== idx) {
      e.preventDefault();
      sections[next].scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
    }
  });
})();

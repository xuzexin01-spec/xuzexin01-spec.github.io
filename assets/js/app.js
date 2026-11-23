const state = {
  data: null,
  health: new Map(),
};

const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function initScrollProgress() {
  const bar = $('#progressBar');
  if (!bar) return;
  const update = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0;
    bar.style.width = `${pct}%`;
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

function initActiveSectionObserver() {
  const sections = document.querySelectorAll('[data-section]');
  if (!sections.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.getAttribute('data-section');
        document.querySelectorAll('.rail__dot').forEach((d) => {
          d.classList.toggle('is-active', d.getAttribute('data-target') === id);
        });
        document.querySelectorAll('.topnav a').forEach((a) => {
          a.classList.toggle('is-active', a.getAttribute('data-target') === id);
        });
      });
    },
    { threshold: 0.45 }
  );
  sections.forEach((s) => io.observe(s));
}

async function probeHealth(project) {
  if (!project.healthUrl) return;
  try {
    const res = await fetch(project.healthUrl, { cache: 'no-store' });
    state.health.set(project.id, res.ok ? { ok: true, label: 'API 在线' } : { ok: false, label: '服务异常' });
  } catch {
    state.health.set(project.id, { ok: false, label: '服务离线' });
  }
  const el = document.querySelector(`[data-health="${project.id}"]`);
  if (el) {
    const info = state.health.get(project.id);
    el.className = info.ok ? 'badge badge--ok' : 'badge';
    el.innerHTML = `<span class="dot"></span><span>${escapeHtml(info.label)}</span>`;
  }
}

function renderBadges(p) {
  const out = [];
  if (p.requiresLogin) out.push(`<span class="badge badge--lock">需演示账号</span>`);
  if (p.showcaseOnly) out.push(`<span class="badge badge--case">实机展示</span>`);
  if (p.healthUrl) {
    const info = state.health.get(p.id);
    out.push(
      `<span class="badge ${info?.ok ? 'badge--ok' : ''}" data-health="${escapeHtml(p.id)}"><span class="dot"></span><span>${escapeHtml(info?.label || '在线服务')}</span></span>`
    );
  }
  return out.join('');
}

function renderMedia(p) {
  const target = p.showcaseOnly ? '' : 'target="_blank" rel="noopener"';

  if (p.isPortrait) {
    return `
      <div class="page-media">
        <div class="portrait-wrap">
          <a class="portrait-frame" href="${escapeHtml(p.url)}" ${target} title="点击进入 ${escapeHtml(p.title)}">
            <span class="portrait-badge" id="deliaBadge">1080×1920 · 主播通话中</span>
            <img id="deliaStageImg" src="${escapeHtml(p.cover)}" alt="${escapeHtml(p.title)} 主播舞台" />
          </a>
          <div class="mode-bar" id="deliaModes">
            <button class="mode-btn is-active" data-src="${escapeHtml(p.cover)}" data-badge="1080×1920 · 主播通话中" type="button">主播说话中</button>
            <button class="mode-btn" data-src="${escapeHtml(p.coverIdle)}" data-badge="1080×1920 · 主播待机" type="button">主播待机</button>
            <button class="mode-btn" data-src="${escapeHtml(p.coverGif)}" data-badge="LiveTalking · 3s 口型动图" data-is-gif="1" type="button">播放 3 秒口型动图</button>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="page-media">
      <a class="media-frame" href="${escapeHtml(p.url)}" ${target} title="点击打开 ${escapeHtml(p.title)}">
        <img src="${escapeHtml(p.cover)}" alt="${escapeHtml(p.title)}" loading="lazy" />
      </a>
    </div>
  `;
}

function renderProjectPage(p, idx) {
  // idx 0 (01): image left, text right
  // idx 1 (02): text left, image right (is-reverse + is-alt)
  // idx 2 (03): image left, text right
  // idx 3 (04): text left, image right (is-reverse + is-alt)
  const isReverse = idx % 2 === 1;
  const cls = isReverse ? 'project-page is-reverse is-alt' : 'project-page';
  const target = p.showcaseOnly ? '' : 'target="_blank" rel="noopener"';

  return `
    <section class="${cls}" id="project-${escapeHtml(p.id)}" data-section="project-${escapeHtml(p.id)}">
      <div class="wrap page-grid">
        ${renderMedia(p)}
        <div class="page-content">
          <div class="p-meta">
            <span class="p-num">${escapeHtml(p.index)} / 06 · ${escapeHtml(p.categoryLabel)}</span>
            ${renderBadges(p)}
          </div>
          <h2 class="p-title">${escapeHtml(p.title)}</h2>
          <p class="p-sub">${escapeHtml(p.subtitle)}</p>
          <p class="p-desc">${escapeHtml(p.summary)}</p>
          <dl class="specs">
            ${p.metrics
              .map(
                (m) => `
              <div class="spec-row">
                <dt>${escapeHtml(m.k)}</dt>
                <dd>${escapeHtml(m.v)}</dd>
              </div>
            `
              )
              .join('')}
          </dl>
          <div class="tags">
            ${p.stack.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
          </div>
          ${p.demoNote ? `<p class="p-note">${escapeHtml(p.demoNote)}</p>` : ''}
          <div class="actions">
            <a class="btn" href="${escapeHtml(p.url)}" ${target}>${escapeHtml(p.actionLabel)} ↗</a>
          </div>
        </div>
      </div>
    </section>
  `;
}

function bindDeliaSwitcher() {
  const bar = $('#deliaModes');
  const img = $('#deliaStageImg');
  const badge = $('#deliaBadge');
  if (!bar || !img || !badge) return;

  bar.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      bar.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const src = btn.getAttribute('data-src');
      const label = btn.getAttribute('data-badge');
      const isGif = btn.getAttribute('data-is-gif') === '1';
      badge.textContent = isGif ? '加载动图中 (3.2 MB)…' : label;
      img.onload = () => { badge.textContent = label; };
      img.src = src;
    });
  });
}

async function boot() {
  initScrollProgress();
  const res = await fetch('./data/site.json', { cache: 'no-cache' });
  const data = await res.json();
  state.data = data;

  const p = data.profile;
  document.title = `${p.name} · 作品集`;
  $('#brandName').textContent = p.name;
  $('#brandSub').textContent = p.subtitle;
  $('#coverName').textContent = p.name;
  $('#coverSub').textContent = p.headline;
  $('#coverBio').textContent = p.bio || '';
  $('#footerName').textContent = `© 2026 ${p.name}`;

  const contactBtn = $('#contactCopy');
  if (p.contactValue) {
    contactBtn.classList.remove('is-hidden');
    const label = p.contactLabel ? `${p.contactLabel}: ${p.contactValue}` : p.contactValue;
    contactBtn.textContent = label;
    contactBtn.onclick = () => {
      navigator.clipboard?.writeText(p.contactValue);
      contactBtn.textContent = '已复制 ✓';
      setTimeout(() => { contactBtn.textContent = label; }, 1600);
    };
  }

  // Top nav 01-06
  $('#topNav').innerHTML = data.projects
    .map(
      (item) =>
        `<a href="#project-${escapeHtml(item.id)}" data-target="project-${escapeHtml(item.id)}" title="${escapeHtml(item.title)}">${escapeHtml(item.index)}</a>`
    )
    .join('');

  // Cover bottom TOC
  $('#coverToc').innerHTML = data.projects
    .map(
      (item) =>
        `<a href="#project-${escapeHtml(item.id)}"><span>${escapeHtml(item.index)}</span>${escapeHtml(item.title)}</a>`
    )
    .join('');

  // Right floating rail (cover + 01-06)
  $('#pageRail').innerHTML = [
    `<a class="rail__dot is-active" href="#top" data-target="top" title="封面" aria-label="封面"></a>`,
    ...data.projects.map(
      (item) =>
        `<a class="rail__dot" href="#project-${escapeHtml(item.id)}" data-target="project-${escapeHtml(item.id)}" title="${escapeHtml(item.index)} ${escapeHtml(item.title)}" aria-label="${escapeHtml(item.title)}"></a>`
    ),
  ].join('');

  // Render all 6 dedicated full-screen alternating pages
  $('#pagesHost').innerHTML = data.projects.map((proj, idx) => renderProjectPage(proj, idx)).join('');

  bindDeliaSwitcher();
  initActiveSectionObserver();
  data.projects.forEach((proj) => probeHealth(proj));
}

boot().catch((err) => {
  console.error(err);
  const host = $('#pagesHost');
  if (host) {
    host.innerHTML = `<div class="wrap" style="padding:80px 0;color:#b91c1c">页面配置加载失败：${escapeHtml(err.message)}</div>`;
  }
});

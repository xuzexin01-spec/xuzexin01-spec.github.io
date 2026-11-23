/* AI 问答面板：调用 /api/ask，服务端未配置或关闭时自动降级。 */
(function () {
  var form = document.getElementById('askForm');
  if (!form) return;
  var input = document.getElementById('askInput');
  var submit = document.getElementById('askSubmit');
  var log = document.getElementById('askLog');
  var chips = document.getElementById('askChips');
  var status = document.getElementById('askStatus');
  var statusWrap = document.getElementById('askStatusWrap');
  var layer = null;
  var busy = false;
  var liveMode = false;

  window.addEventListener('aether:layer', function (e) { layer = e.detail.layer; });

  fetch('./api/health').then(function (r) { return r.json(); }).then(function (d) {
    if (d.mode === 'disabled') {
      var card = document.getElementById('askCard');
      if (card && card.parentNode) card.parentNode.removeChild(card);
      return;
    }
    if (d.mode === 'unconfigured') {
      status.textContent = '未配置';
      statusWrap.classList.add('is-off');
    } else if (d.mode === 'mock') {
      status.textContent = '离线演示';
    } else {
      liveMode = true;
      status.textContent = '在线 · 剩 ' + d.remaining;
    }
  }).catch(function () {
    status.textContent = '离线';
    statusWrap.classList.add('is-off');
  });

  function addItem(q) {
    var wrap = document.createElement('div');
    wrap.className = 'ask__item';
    var qEl = document.createElement('div');
    qEl.className = 'ask__q';
    qEl.textContent = q;
    var aEl = document.createElement('div');
    aEl.className = 'ask__a is-pending';
    aEl.textContent = '正在查找手册…';
    wrap.appendChild(qEl);
    wrap.appendChild(aEl);
    log.insertBefore(wrap, log.firstChild);
    while (log.children.length > 3) log.removeChild(log.lastChild);
    return aEl;
  }

  function ask(q) {
    if (busy || !q) return;
    busy = true;
    submit.disabled = true;
    var aEl = addItem(q);
    var started = Date.now();
    var frames = 0;
    var pending = setInterval(function () {
      frames += 1;
      var secs = Math.round((Date.now() - started) / 1000);
      aEl.textContent = '正在查找手册' + '···'.slice(0, frames % 3 + 1) + ' ' + secs + 's';
    }, 700);

    function finish(text, isError) {
      clearInterval(pending);
      aEl.classList.remove('is-pending');
      if (isError) aEl.classList.add('is-error');
      aEl.textContent = text;
    }

    fetch('./api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, layer: layer })
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (r) {
        if (!r.ok) {
          finish((r.data && r.data.detail) || '提问失败，稍后再试', true);
          return;
        }
        finish(r.data.answer, false);
        if (liveMode && typeof r.data.remaining === 'number') {
          status.textContent = '在线 · 剩 ' + r.data.remaining;
        }
      })
      .catch(function () {
        finish('连不上问答服务，请确认后端已启动', true);
      })
      .then(function () {
        busy = false;
        submit.disabled = false;
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q) return;
    input.value = '';
    ask(q);
  });

  chips.addEventListener('click', function (e) {
    var btn = e.target.closest('.ask__chip');
    if (!btn) return;
    ask(btn.getAttribute('data-q'));
  });
})();

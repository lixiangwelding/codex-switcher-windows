const listEl = document.getElementById('list');

function meterBar(m) {
  if (m.balance !== undefined) {
    return `<div class="meter"><div class="label"><span>${m.title}</span><span>${Number(m.balance).toFixed(0)}</span></div></div>`;
  }
  const used = Math.max(0, Math.min(100, m.usedPercent));
  const cls = used >= 90 ? 'hot' : used >= 70 ? 'warn' : '';
  const reset = m.resetsAt ? ` · ${new Date(m.resetsAt).toLocaleString()} 重置` : '';
  return `<div class="meter"><div class="label"><span>${m.title}</span><span>已用 ${used.toFixed(0)}%${reset}</span></div>`
    + `<div class="bar"><div class="${cls}" style="width:${used}%"></div></div></div>`;
}

function render(state) {
  if (!state.accounts.length) {
    listEl.innerHTML = '<div id="empty">还没有账号<br>先 codex login，再点下方导入</div>';
    return;
  }
  listEl.innerHTML = state.accounts.map((a) => {
    const active = a.id === state.activeId;
    return `<div class="card${active ? ' active' : ''}" data-id="${a.id}">`
      + `<div class="row"><span class="email">${a.email || a.id}`
      + `${a.plan ? `<span class="plan">${a.plan}</span>` : ''}</span>`
      + `${active ? '<span class="badge">当前</span>' : ''}</div>`
      + `<div class="meters"></div>`
      + `<div class="actions">${active ? '' : '<button class="act switch">切换</button>'}`
      + '<button class="act refresh">刷新用量</button>'
      + '<button class="act danger remove">删除</button></div></div>';
  }).join('');

  for (const card of listEl.querySelectorAll('.card')) {
    const id = card.dataset.id;
    const switchBtn = card.querySelector('.switch');
    if (switchBtn) switchBtn.onclick = () => window.switcher.activate(id).catch(showError(card));
    card.querySelector('.remove').onclick = () => window.switcher.remove(id).catch(showError(card));
    card.querySelector('.refresh').onclick = () => loadUsage(card, id);
  }
}

function showError(card) {
  return (err) => {
    let el = card.querySelector('.err');
    if (!el) {
      el = document.createElement('div');
      el.className = 'err';
      card.appendChild(el);
    }
    el.textContent = String(err.message || err);
  };
}

async function loadUsage(card, id) {
  const box = card.querySelector('.meters');
  box.textContent = '读取中…';
  try {
    const usage = await window.switcher.usage(id);
    box.innerHTML = usage.meters.length
      ? usage.meters.map(meterBar).join('')
      : '<div class="meter">未返回用量数据</div>';
  } catch (err) {
    box.innerHTML = '';
    showError(card)(err);
  }
}

document.getElementById('add').onclick = () => {
  window.switcher.importCurrent().catch((err) => alert(String(err.message || err)));
};
document.getElementById('quit').onclick = () => window.switcher.quit();

window.switcher.onState(render);
window.switcher.list().then(render);

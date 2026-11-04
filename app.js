/* ==========================================================================
   Планировщик финансов — app.js
   Вся логика приложения. Порядок секций:
   1. Константы
   2. State и хранилище
   3. Утилиты форматирования
   4. Приватность
   5. Агрегаты и helpers
   6. Рендеры: доходы и расходы
   7. Рендер карточек целей
   8. Свайпы
   9. Модалка
   10. Итоговая панель
   11. Календарь
   12. Статистика
   13. CRUD доходов/расходов
   14. Экспорт / импорт
   15. Toast
   16. Табы
   17. Сворачиваемые секции
   18. Инициализация
   19. PWA
   ========================================================================== */

/* ==========================================================================
   1. КОНСТАНТЫ
   ========================================================================== */

const STORAGE_KEY = 'year_planner_v1';
const UI_STORAGE_KEY = 'year_planner_ui_v1';
const PRIVACY_KEY = 'year_planner_privacy_v1';

const PALETTE = [
  '#7c5cff', '#3ddc97', '#5cc8ff', '#ffc857',
  '#ff5c7c', '#ff9cc8', '#4dd0c1', '#a89cff',
  '#ffb085', '#88e0ef', '#c39bff', '#6ee7b7'
];

const MONTHS_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

/* ==========================================================================
   2. STATE И ХРАНИЛИЩЕ
   ========================================================================== */

let state = {
  monthlyIncomes: [],
  oneTimeIncomes: [],
  expenses: [],
  goals: [],
  shortGoals: [],
};

let goalModalMode = 'add';
let goalModalEditId = null;
let goalModalType = 'long'; // 'long' | 'short'

const uid = () => Math.random().toString(36).slice(2, 9);

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeGoal(g) {
  let contributions = Array.isArray(g.contributions) ? g.contributions : null;
  if (!contributions) {
    contributions = [];
    const savedNum = Number(g.saved) || 0;
    if (savedNum > 0) contributions.push({ id: uid(), date: todayStr(), amount: savedNum });
  }
  const { saved, ...rest } = g;
  return {
    ...rest,
    contributions,
    rate: Number(g.rate) || 0,
    indexRate: Number(g.indexRate) || 0,
  };
}

function load() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...state, ...JSON.parse(raw) };
  } catch (e) { console.warn(e); }

  if ((typeof state.salary === 'number') && state.salary > 0 && !state.monthlyIncomes?.length) {
    state.monthlyIncomes = [{ id: uid(), name: 'Зарплата', amount: state.salary }];
  }
  delete state.salary;

  if (!Array.isArray(state.monthlyIncomes)) state.monthlyIncomes = [];
  if (!Array.isArray(state.oneTimeIncomes)) state.oneTimeIncomes = [];
  if (!Array.isArray(state.expenses)) state.expenses = [];
  if (!Array.isArray(state.goals)) state.goals = [];
  if (!Array.isArray(state.shortGoals)) state.shortGoals = [];

  state.goals = state.goals.map(normalizeGoal);
  state.shortGoals = state.shortGoals.map(normalizeGoal);
}

/* ==========================================================================
   3. УТИЛИТЫ ФОРМАТИРОВАНИЯ
   ========================================================================== */

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

const fmt = n => new Intl.NumberFormat('ru-RU', {
  style: 'currency', currency: 'RUB', maximumFractionDigits: 0
}).format(Math.round(n));

const fmtNum = n => new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0
}).format(Math.round(n));

const fmtShort = n => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'М';
  if (abs >= 1000) return (n / 1000).toFixed(0) + 'К';
  return String(Math.round(n));
};

/* Обёртка для сумм, которые нужно скрывать в privacy-режиме */
const money = html => `<span class="money">${html}</span>`;

function formatDeadline(deadline) {
  if (!deadline) return '';
  const [y, m] = deadline.split('-').map(Number);
  return `${MONTHS_SHORT[m-1]} ${y}`;
}

function formatDateRu(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

function monthsUntil(deadline) {
  if (!deadline) return 0;
  const [y, m] = deadline.split('-').map(Number);
  const now = new Date();
  return (y * 12 + (m - 1)) - (now.getFullYear() * 12 + now.getMonth());
}

function humanDuration(months) {
  if (months < 0) return 'срок истёк';
  if (months < 12) {
    const w = months === 1 ? 'месяц' : (months < 5 ? 'месяца' : 'месяцев');
    return `через ${months} ${w}`;
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yw = years === 1 ? 'год' : (years < 5 ? 'года' : 'лет');
  if (rest === 0) return `через ${years} ${yw}`;
  return `через ${years} ${yw} ${rest} мес`;
}

function monthLabel(monthIndex) {
  const y = Math.floor(monthIndex / 12);
  const m = monthIndex % 12;
  return `${MONTHS_SHORT[m]} ${y}`;
}

/* ==========================================================================
   4. ПРИВАТНОСТЬ
   ========================================================================== */

function isPrivacyOn() {
  return document.documentElement.classList.contains('privacy-mode');
}

function setPrivacy(on) {
  document.documentElement.classList.toggle('privacy-mode', on);
  try { localStorage.setItem(PRIVACY_KEY, on ? '1' : '0'); } catch (e) {}
  const btn = document.getElementById('privacyToggle');
  if (btn) {
    const label = btn.querySelector('.privacy-label');
    if (label) label.textContent = on ? 'Показать суммы' : 'Скрыть суммы';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Показать суммы' : 'Скрыть суммы');
    btn.setAttribute('title', on ? 'Показать суммы' : 'Скрыть суммы');
  }
}

function togglePrivacy() {
  setPrivacy(!isPrivacyOn());
}

/* ==========================================================================
   5. РАСЧЁТЫ И АГРЕГАТЫ
   ========================================================================== */

function goalSaved(g) {
  return (g.contributions || []).reduce((s, c) => s + Number(c.amount || 0), 0);
}

function goalMonthly(g, saved, months, target) {
  const remaining = Math.max(0, target - saved);
  if (remaining <= 0 || months <= 0) return 0;

  const rateAnnual = Number(g.rate) || 0;
  const indexAnnual = Number(g.indexRate) || 0;

  if (rateAnnual <= 0 && indexAnnual <= 0) {
    return remaining / months;
  }

  const r = rateAnnual / 100 / 12;
  const i = indexAnnual / 100;

  const fvSaved = saved * Math.pow(1 + r, months);
  const need = target - fvSaved;
  if (need <= 0) return 0;

  let fvUnit = 0;
  for (let m = 0; m < months; m++) {
    const yearIdx = Math.floor(m / 12);
    const factor = Math.pow(1 + i, yearIdx);
    const monthsToGrow = months - 1 - m;
    fvUnit += factor * Math.pow(1 + r, monthsToGrow);
  }

  if (fvUnit <= 0) return need / months;
  return need / fvUnit;
}

function calcGoal(g) {
  const saved = goalSaved(g);
  const remaining = Math.max(0, g.target - saved);
  const diff = monthsUntil(g.deadline);
  const months = Math.max(1, diff + 1);
  const perMonth = goalMonthly(g, saved, months, g.target);
  const overdue = diff < 0 && remaining > 0;
  const done = remaining === 0;
  const percent = g.target > 0 ? Math.min(100, (saved / g.target) * 100) : 0;
  const rateAnnual = Number(g.rate) || 0;
  const indexAnnual = Number(g.indexRate) || 0;

  const yearsCount = Math.max(1, Math.ceil(months / 12));
  const yearBreakdown = [];
  if (indexAnnual > 0 && perMonth > 0) {
    for (let y = 0; y < yearsCount; y++) {
      const monthsInYear = Math.min(12, months - y * 12);
      yearBreakdown.push({
        year: y + 1,
        months: monthsInYear,
        monthly: perMonth * Math.pow(1 + indexAnnual / 100, y),
      });
    }
  }

  let interestEarned = 0;
  let growthCovers = false;
  if (rateAnnual > 0 && !done && remaining > 0) {
    if (perMonth === 0) {
      growthCovers = true;
      const r = rateAnnual / 100 / 12;
      const fv = saved * Math.pow(1 + r, months);
      interestEarned = Math.max(0, fv - saved);
    } else {
      let nominalContrib = 0;
      for (let m = 0; m < months; m++) {
        nominalContrib += perMonth * Math.pow(1 + indexAnnual / 100, Math.floor(m / 12));
      }
      interestEarned = Math.max(0, g.target - saved - nominalContrib);
    }
  }

  return {
    saved, remaining, diff, months, perMonth, overdue, done, percent,
    rateAnnual, indexAnnual, interestEarned, growthCovers,
    yearBreakdown, yearsCount,
  };
}

function allGoals() {
  return [...state.goals, ...state.shortGoals];
}

function findGoalById(id) {
  return state.goals.find(g => g.id === id) || state.shortGoals.find(g => g.id === id) || null;
}

function totalMonthlyIncome() {
  return state.monthlyIncomes.reduce((s, i) => s + Number(i.amount || 0), 0);
}

function totalBaseExpenses() {
  return state.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
}

function totalLongGoalsPerMonth() {
  return state.goals.reduce((s, g) => s + calcGoal(g).perMonth, 0);
}

function totalShortGoalsPerMonth() {
  return state.shortGoals.reduce((s, g) => s + calcGoal(g).perMonth, 0);
}

function totalGoalsPerMonth() {
  return totalLongGoalsPerMonth() + totalShortGoalsPerMonth();
}

function totalOneTimeThisMonth() {
  const ym = currentMonthKey();
  return state.oneTimeIncomes
    .filter(i => (i.date || '').slice(0, 7) === ym)
    .reduce((s, i) => s + Number(i.amount || 0), 0);
}

/* ==========================================================================
   6. РЕНДЕРЫ: ДОХОДЫ И РАСХОДЫ
   ========================================================================== */

function renderMonthlyIncomes() {
  const el = document.getElementById('monthlyIncomeList');
  if (!state.monthlyIncomes.length) {
    el.innerHTML = '<span class="empty-hint">Пока пусто — добавь зарплату, проценты с вклада и т.д.</span>';
    return;
  }
  el.innerHTML = state.monthlyIncomes.map(i => `
    <div class="item-row">
      <div class="info">
        <div class="name">${escapeHtml(i.name)}</div>
      </div>
      <div class="right">
        <span class="amt income">+${fmt(i.amount)}</span>
        <button class="del" data-id="${i.id}" title="Удалить">×</button>
      </div>
    </div>
  `).join('') + `
    <div class="list-total">
      <span class="label">Итого в месяц</span>
      <span class="val income">${fmt(totalMonthlyIncome())}</span>
    </div>
  `;
  el.querySelectorAll('.del').forEach(btn => {
    btn.onclick = () => {
      state.monthlyIncomes = state.monthlyIncomes.filter(x => x.id !== btn.dataset.id);
      save(); renderMonthlyIncomes(); renderTotal(); renderCalendar(); renderStats();
    };
  });
}

function renderOneTimeIncomes() {
  const el = document.getElementById('oneTimeIncomeList');
  if (!state.oneTimeIncomes.length) {
    el.innerHTML = '<span class="empty-hint">Премии, продажи, подарки — всё сюда</span>';
    return;
  }
  const sorted = [...state.oneTimeIncomes].sort((a, b) =>
    (b.date || '').localeCompare(a.date || '')
  );
  const ym = currentMonthKey();

  el.innerHTML = sorted.map(i => {
    const isCurrent = (i.date || '').slice(0, 7) === ym;
    return `
      <div class="item-row">
        <div class="info">
          <div class="name">${escapeHtml(i.name)}</div>
          <div class="sub ${isCurrent ? 'current' : ''}">
            ${formatDateRu(i.date)}${isCurrent ? ' · этот месяц' : ''}
          </div>
        </div>
        <div class="right">
          <span class="amt income">+${fmt(i.amount)}</span>
          <button class="del" data-id="${i.id}" title="Удалить">×</button>
        </div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.del').forEach(btn => {
    btn.onclick = () => {
      state.oneTimeIncomes = state.oneTimeIncomes.filter(x => x.id !== btn.dataset.id);
      save(); renderOneTimeIncomes(); renderTotal(); renderStats();
    };
  });
}

function autoRowHtml(name, sub, amount, kind) {
  return `
    <div class="item-row auto ${kind}" style="margin-top:12px">
      <div class="info">
        <div class="name">${name}<span class="auto-badge">авто</span></div>
        <div class="sub">${sub}</div>
      </div>
      <div class="right">
        <span class="amt">−${fmt(amount)}</span>
      </div>
    </div>
  `;
}

function renderExpenses() {
  const el = document.getElementById('expenseList');
  const longPerMonth = totalLongGoalsPerMonth();
  const shortPerMonth = totalShortGoalsPerMonth();
  const goalsPerMonth = longPerMonth + shortPerMonth;
  const baseTotal = totalBaseExpenses();
  const grandTotal = baseTotal + goalsPerMonth;

  let html = '';
  if (!state.expenses.length) {
    html += '<span class="empty-hint">Пока пусто — добавь аренду, подписки, продукты</span>';
  } else {
    html += state.expenses.map(e => `
      <div class="item-row">
        <div class="info">
          <div class="name">${escapeHtml(e.name)}</div>
        </div>
        <div class="right">
          <span class="amt">−${fmt(e.amount)}</span>
          <button class="del" data-id="${e.id}" title="Удалить">×</button>
        </div>
      </div>
    `).join('');
  }

  if (longPerMonth > 0) {
    html += autoRowHtml(
      '🎯 Накопления на долгосрочные цели',
      'Из секции «Долгосрочные цели»',
      longPerMonth,
      ''
    );
  }
  if (shortPerMonth > 0) {
    html += autoRowHtml(
      '🎯 Накопления на краткосрочные цели',
      'Из секции «Краткосрочные цели»',
      shortPerMonth,
      'short'
    );
  }

  if (state.expenses.length || goalsPerMonth > 0) {
    html += `
      <div class="list-total">
        <span class="label">Итого в месяц</span>
        <span class="val">−${fmt(grandTotal)}</span>
      </div>
    `;
  }

  el.innerHTML = html;

  el.querySelectorAll('.del').forEach(btn => {
    btn.onclick = () => {
      state.expenses = state.expenses.filter(x => x.id !== btn.dataset.id);
      save(); renderExpenses(); renderTotal(); renderCalendar(); renderStats();
    };
  });
}

/* ==========================================================================
   7. РЕНДЕР КАРТОЧЕК ЦЕЛЕЙ (общий для long/short)
   ========================================================================== */

function renderContribChart(g) {
  const contribs = (g.contributions || []).slice();
  if (!contribs.length) return '';

  const byMonth = {};
  contribs.forEach(c => {
    const m = c.date.slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + Number(c.amount || 0);
  });
  const months = Object.keys(byMonth).sort();
  const max = Math.max(...months.map(m => byMonth[m]), 1);

  const W = 200, H = 40, PAD = 3;
  const barW = (W - PAD * 2) / months.length;

  const bars = months.map((m, i) => {
    const h = (byMonth[m] / max) * (H - PAD * 2);
    const x = PAD + i * barW;
    const y = H - PAD - h;
    return `<rect x="${(x + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${(barW - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="#7c5cff"/>`;
  }).join('');

  return `<svg class="contrib-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${bars}</svg>`;
}

function renderGoalListInto(el, hint, goals) {
  if (!goals.length) {
    el.innerHTML = '<span class="empty-hint">Целей пока нет. Нажми «+ Добавить цель»</span>';
    if (hint) hint.style.display = 'none';
    return;
  }
  if (hint) hint.style.display = '';

  const sorted = [...goals].sort((a, b) =>
    (a.deadline || '').localeCompare(b.deadline || '')
  );

  el.innerHTML = sorted.map(g => {
    const c = calcGoal(g);
    const hasRate = c.rateAnnual > 0;
    const hasIndex = c.indexAnnual > 0;
    let fillClass = '';
    if (c.done) fillClass = 'done';
    else if (c.overdue) fillClass = 'overdue';
    else if (c.growthCovers) fillClass = 'growth';

    let monthlyHtml;
    if (c.done) {
      monthlyHtml = `<span class="goal-monthly done">✓ Готово</span>`;
    } else if (c.overdue) {
      monthlyHtml = `<span class="goal-monthly overdue">⚠️ Просрочено на ${money(fmt(c.remaining))}</span>`;
    } else if (c.growthCovers) {
      monthlyHtml = `<span class="goal-monthly done">✓ Рост покрывает</span>`;
    } else if (hasIndex) {
      const lastYear = c.yearBreakdown[c.yearBreakdown.length - 1]?.monthly || c.perMonth;
      monthlyHtml = `<span class="goal-monthly">${money(fmt(c.perMonth))} → ${money(fmt(lastYear))}/мес</span>`;
    } else {
      monthlyHtml = `<span class="goal-monthly">${money(fmt(c.perMonth))}/мес</span>`;
    }

    const rateBadge = hasRate
      ? `<span class="goal-rate-badge">💹 ${c.rateAnnual}%</span>`
      : '';
    const indexBadge = hasIndex
      ? `<span class="goal-index-badge">📈 ${c.indexAnnual}%</span>`
      : '';

    const rateInfo = (hasRate && !c.done && c.interestEarned > 0)
      ? `<div class="goal-rate-info">
          <span class="label">Доход от процентов к сроку ≈</span>
          <strong class="money">${fmt(c.interestEarned)}</strong>
        </div>`
      : '';

    const indexInfo = (hasIndex && !c.done && c.perMonth > 0)
      ? `<div class="goal-index-info">
          <span class="label">Взнос растёт на ${c.indexAnnual}%/год:</span>
          <strong>${money(fmt(c.perMonth))} → ${money(fmt(c.yearBreakdown[c.yearBreakdown.length-1].monthly))}/мес</strong>
        </div>`
      : '';

    const indexBreakdown = (hasIndex && c.yearBreakdown.length > 0)
      ? `<details class="index-breakdown">
          <summary>Взнос по годам (${c.yearsCount})</summary>
          <div class="year-rows">
            ${c.yearBreakdown.map(y => `
              <div class="year-row">
                <span>Год ${y.year} · ${y.months} мес</span>
                <span class="val">${money(fmt(y.monthly))}/мес</span>
              </div>
            `).join('')}
          </div>
        </details>`
      : '';

    const contribs = (g.contributions || []).slice().sort((a, b) =>
      b.date.localeCompare(a.date)
    );

    const contribList = contribs.length
      ? contribs.map(cn => `
          <div class="contrib-item">
            <span class="date">${formatDateRu(cn.date)}</span>
            <span style="display:flex;align-items:center">
              <span class="amt">+${money(fmt(cn.amount))}</span>
              <button class="del" data-contrib-id="${cn.id}" data-goal-id="${g.id}" title="Удалить">×</button>
            </span>
          </div>
        `).join('')
      : '<div class="empty-hint" style="font-size:12px">Взносов ещё не было</div>';

    const chart = renderContribChart(g);

    return `
      <div class="goal-swipe" data-goal-id="${g.id}">
        <div class="goal-delete-action" data-delete-goal="${g.id}">
          <span class="trash">🗑</span>
          <span>Удалить</span>
        </div>
        <div class="goal-card ${hasRate ? 'with-rate' : ''}" data-goal-card="${g.id}">
          <div class="goal-head">
            <div style="min-width:0">
              <div class="goal-name">${escapeHtml(g.name)}${rateBadge}${indexBadge}</div>
              <div class="goal-meta">К ${formatDeadline(g.deadline)} · ${humanDuration(c.diff)}</div>
            </div>
          </div>

          <div class="progress-bar">
            <div class="progress-fill ${fillClass}" style="width:${c.percent}%"></div>
          </div>

          <div class="goal-stats">
            <span class="goal-saved">${money(fmt(c.saved))} из ${money(fmt(g.target))} · ${Math.round(c.percent)}%</span>
            ${monthlyHtml}
          </div>

          ${rateInfo}
          ${indexInfo}
          ${indexBreakdown}

          <div class="contrib-form" data-goal-id="${g.id}">
            <input type="number" placeholder="Взнос ₽" min="0" step="100" data-contrib-input>
            <input type="date" value="${todayStr()}" data-contrib-date>
            <button type="button" data-add-contrib>+</button>
          </div>

          <details class="contrib-history">
            <summary>История взносов (${contribs.length})</summary>
            ${chart}
            <div class="contrib-list">${contribList}</div>
          </details>
        </div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('[data-goal-card]').forEach(card => {
    const gid = card.dataset.goalCard;
    card.addEventListener('click', e => {
      if (card.dataset.justSwiped) return;
      if (e.target.closest('input, button, textarea, select, summary, details')) return;
      if (card.dataset.swiped === 'true') {
        resetSwipe(card);
        return;
      }
      openGoalModal('edit', gid);
    });
    attachSwipe(card);
  });

  el.querySelectorAll('[data-delete-goal]').forEach(action => {
    action.addEventListener('click', () => {
      deleteGoal(action.dataset.deleteGoal);
    });
  });

  el.querySelectorAll('[data-contrib-id]').forEach(btn => {
    btn.onclick = () => {
      const g = findGoalById(btn.dataset.goalId);
      if (!g) return;
      g.contributions = g.contributions.filter(c => c.id !== btn.dataset.contribId);
      save(); renderGoalsAndTotals();
    };
  });

  el.querySelectorAll('[data-add-contrib]').forEach(btn => {
    btn.onclick = () => {
      const form = btn.closest('.contrib-form');
      const goalId = form.dataset.goalId;
      const amountInput = form.querySelector('[data-contrib-input]');
      const dateInput = form.querySelector('[data-contrib-date]');
      const amount = parseFloat(amountInput.value);
      const date = dateInput.value || todayStr();

      if (isNaN(amount) || amount <= 0) { amountInput.focus(); return; }

      const g = findGoalById(goalId);
      if (!g) return;
      g.contributions.push({ id: uid(), date, amount });
      save(); renderGoalsAndTotals();
    };
  });

  el.querySelectorAll('[data-contrib-input]').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        inp.closest('.contrib-form').querySelector('[data-add-contrib]').click();
      }
    });
  });
}

function renderGoals() {
  renderGoalListInto(
    document.getElementById('goalList'),
    document.getElementById('goalHint'),
    state.goals
  );
}

function renderShortGoals() {
  renderGoalListInto(
    document.getElementById('shortGoalList'),
    document.getElementById('shortGoalHint'),
    state.shortGoals
  );
}

function renderGoalsAndTotals() {
  renderGoals();
  renderShortGoals();
  renderExpenses();
  renderTotal();
  renderCalendar();
  renderStats();
}

/* ==========================================================================
   8. СВАЙПЫ
   ========================================================================== */

let swipeState = null;

function attachSwipe(card) {
  card.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('input, button, textarea, select, summary, details, .contrib-form')) return;

    swipeState = {
      card,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      curX: 0,
      dragging: false,
      moved: false,
    };
    card.style.transition = 'none';
  });

  card.addEventListener('pointermove', e => {
    if (!swipeState || swipeState.pointerId !== e.pointerId || swipeState.card !== card) return;

    const dx = e.clientX - swipeState.startX;
    const dy = e.clientY - swipeState.startY;

    if (!swipeState.dragging) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        swipeState.dragging = true;
      } else if (Math.abs(dy) > 10) {
        card.style.transition = 'transform 0.2s ease';
        card.style.transform = 'translateX(0)';
        swipeState = null;
        return;
      } else {
        return;
      }
    }

    swipeState.moved = true;
    swipeState.curX = Math.max(-110, Math.min(0, dx));
    card.style.transform = `translateX(${swipeState.curX}px)`;
  });

  const endSwipe = e => {
    if (!swipeState || swipeState.pointerId !== e.pointerId || swipeState.card !== card) return;
    const s = swipeState;
    swipeState = null;

    card.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';

    if (s.curX <= -55) {
      card.style.transform = 'translateX(-100px)';
      card.dataset.swiped = 'true';
    } else {
      card.style.transform = 'translateX(0)';
      card.dataset.swiped = '';
    }

    if (s.moved) {
      card.dataset.justSwiped = 'true';
      setTimeout(() => { delete card.dataset.justSwiped; }, 350);
    }
  };

  card.addEventListener('pointerup', endSwipe);
  card.addEventListener('pointercancel', endSwipe);
  card.addEventListener('pointerleave', e => {
    if (e.pointerType === 'mouse' && swipeState && swipeState.card === card && !swipeState.moved) {
      swipeState = null;
    }
  });
}

function resetSwipe(card) {
  card.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
  card.style.transform = 'translateX(0)';
  card.dataset.swiped = '';
}

function closeAllSwipes() {
  document.querySelectorAll('.goal-card[data-swiped="true"]').forEach(card => {
    resetSwipe(card);
  });
}

document.addEventListener('pointerdown', e => {
  if (e.target.closest('.goal-swipe')) return;
  closeAllSwipes();
}, true);

function deleteGoal(goalId) {
  let arr = null;
  let idx = state.goals.findIndex(x => x.id === goalId);
  if (idx !== -1) {
    arr = state.goals;
  } else {
    idx = state.shortGoals.findIndex(x => x.id === goalId);
    if (idx === -1) return;
    arr = state.shortGoals;
  }

  const [deleted] = arr.splice(idx, 1);
  save();
  renderGoalsAndTotals();

  showToast(`Цель «${deleted.name}» удалена`, false, {
    label: 'Отменить',
    onClick: () => {
      const insertAt = Math.min(idx, arr.length);
      arr.splice(insertAt, 0, deleted);
      save();
      renderGoalsAndTotals();
      showToast('Восстановлено');
    },
  });
}

/* ==========================================================================
   9. МОДАЛКА ЦЕЛИ
   ========================================================================== */

function openGoalModal(mode, goalId, type) {
  goalModalMode = mode;
  goalModalEditId = goalId || null;
  if (mode === 'add') {
    goalModalType = type || 'long';
  } else {
    goalModalType = state.goals.some(g => g.id === goalId) ? 'long' : 'short';
  }

  const titleEl = document.getElementById('goalModalTitle');
  const savedGroup = document.getElementById('mGoalSavedGroup');
  const nameEl = document.getElementById('mGoalName');
  const targetEl = document.getElementById('mGoalTarget');
  const savedEl = document.getElementById('mGoalSaved');
  const deadlineEl = document.getElementById('mGoalDeadline');
  const useRateEl = document.getElementById('mGoalUseRate');
  const rateEl = document.getElementById('mGoalRate');
  const rateGroup = document.getElementById('mGoalRateGroup');
  const useIndexEl = document.getElementById('mGoalUseIndex');
  const indexEl = document.getElementById('mGoalIndex');
  const indexGroup = document.getElementById('mGoalIndexGroup');

  if (mode === 'add') {
    titleEl.textContent = goalModalType === 'short' ? 'Новая краткосрочная цель' : 'Новая цель';
    nameEl.value = '';
    targetEl.value = '';
    savedEl.value = '0';
    savedGroup.style.display = '';
    const now = new Date();
    const d = new Date(now.getFullYear() + 1, now.getMonth(), 1);
    deadlineEl.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    useRateEl.checked = false;
    rateGroup.style.display = 'none';
    rateEl.value = '8';
    useIndexEl.checked = false;
    indexGroup.style.display = 'none';
    indexEl.value = '5';
  } else {
    const g = findGoalById(goalId);
    if (!g) return;
    titleEl.textContent = 'Редактировать цель';
    nameEl.value = g.name;
    targetEl.value = g.target;
    savedEl.value = '0';
    savedGroup.style.display = 'none';
    deadlineEl.value = g.deadline || '';
    const hasRate = (Number(g.rate) || 0) > 0;
    useRateEl.checked = hasRate;
    rateGroup.style.display = hasRate ? 'block' : 'none';
    rateEl.value = hasRate ? String(g.rate) : '8';
    const hasIndex = (Number(g.indexRate) || 0) > 0;
    useIndexEl.checked = hasIndex;
    indexGroup.style.display = hasIndex ? 'block' : 'none';
    indexEl.value = hasIndex ? String(g.indexRate) : '5';
  }

  document.getElementById('goalModal').style.display = 'flex';
  setTimeout(() => nameEl.focus(), 60);
}

function closeGoalModal() {
  document.getElementById('goalModal').style.display = 'none';
  goalModalMode = 'add';
  goalModalEditId = null;
}

function saveGoalFromModal() {
  const name = document.getElementById('mGoalName').value.trim();
  const target = parseFloat(document.getElementById('mGoalTarget').value);
  const deadline = document.getElementById('mGoalDeadline').value;
  const useRate = document.getElementById('mGoalUseRate').checked;
  const rate = useRate ? (parseFloat(document.getElementById('mGoalRate').value) || 0) : 0;
  const useIndex = document.getElementById('mGoalUseIndex').checked;
  const indexRate = useIndex ? (parseFloat(document.getElementById('mGoalIndex').value) || 0) : 0;

  if (!name) { document.getElementById('mGoalName').focus(); return; }
  if (isNaN(target) || target <= 0) { document.getElementById('mGoalTarget').focus(); return; }
  if (!deadline) { document.getElementById('mGoalDeadline').focus(); return; }

  const wasAdd = goalModalMode === 'add';
  const wasShort = goalModalType === 'short';
  const targetArr = wasShort ? state.shortGoals : state.goals;

  if (wasAdd) {
    const saved = parseFloat(document.getElementById('mGoalSaved').value) || 0;
    const contributions = [];
    if (saved > 0) contributions.push({ id: uid(), date: todayStr(), amount: saved });
    targetArr.push({ id: uid(), name, target, deadline, contributions, rate, indexRate });
  } else {
    const g = findGoalById(goalModalEditId);
    if (!g) return;
    g.name = name;
    g.target = target;
    g.deadline = deadline;
    g.rate = rate;
    g.indexRate = indexRate;
  }

  save();
  closeGoalModal();
  renderGoalsAndTotals();
  const msg = wasAdd
    ? (wasShort ? 'Краткосрочная цель добавлена' : 'Цель добавлена')
    : 'Изменения сохранены';
  showToast(msg);
}

function setModalDeadlineOffset(months) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + months, 1);
  document.getElementById('mGoalDeadline').value =
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ==========================================================================
   10. ИТОГОВАЯ ПАНЕЛЬ
   ========================================================================== */

function renderTotal() {
  const income = totalMonthlyIncome();
  const baseExp = totalBaseExpenses();
  const goalsPerMonth = totalGoalsPerMonth();
  const totalExp = baseExp + goalsPerMonth;
  const oneTime = totalOneTimeThisMonth();
  const free = income - totalExp + oneTime;

  document.getElementById('tIncome').textContent = fmt(income);
  document.getElementById('tExpenses').textContent = '−' + fmt(totalExp);
  document.getElementById('tGoals').textContent = '−' + fmt(goalsPerMonth);

  const oneTimeRow = document.getElementById('tOneTimeRow');
  if (oneTime > 0) {
    oneTimeRow.style.display = 'flex';
    document.getElementById('tOneTime').textContent = '+' + fmt(oneTime);
  } else {
    oneTimeRow.style.display = 'none';
  }

  const freeEl = document.getElementById('tFree');
  freeEl.textContent = fmt(free);
  freeEl.classList.toggle('negative', free < 0);
}

/* ==========================================================================
   11. КАЛЕНДАРЬ
   ========================================================================== */

function renderCalendar() {
  const el = document.getElementById('calendarContent');

  const income = totalMonthlyIncome();
  const baseExp = totalBaseExpenses();
  const free = income - baseExp;

  const activeGoals = allGoals().filter(g => !calcGoal(g).done);

  if (!activeGoals.length) {
    el.innerHTML = '<div class="empty-hint">Активных целей нет — либо добавь цель, либо все уже достигнуты 🎉</div>';
    return;
  }

  const now = new Date();
  const startMonth = now.getFullYear() * 12 + now.getMonth();

  const goalData = activeGoals.map(g => {
    const c = calcGoal(g);
    const [y, m] = g.deadline.split('-').map(Number);
    return { goal: g, calc: c, endMonth: y * 12 + (m - 1), startMonthIdx: startMonth };
  });

  const furthest = Math.max(...goalData.map(g => g.endMonth));

  const rows = [];
  let peak = { month: startMonth, total: 0 };

  const contribAtMonth = (gd, monthIdx) => {
    const c = gd.calc;
    if (!c.perMonth) return 0;
    if (monthIdx > gd.endMonth) return 0;
    const yearIdx = Math.floor((monthIdx - startMonth) / 12);
    const indexRate = Number(gd.goal.indexRate) || 0;
    return c.perMonth * Math.pow(1 + indexRate / 100, yearIdx);
  };

  for (let m = startMonth; m <= furthest; m++) {
    const active = goalData.filter(g => m <= g.endMonth);
    if (!active.length) continue;

    const total = active.reduce((s, gd) => s + contribAtMonth(gd, m), 0);
    if (total > peak.total) peak = { month: m, total };

    const overload = income > 0 && total > free;
    rows.push({
      label: monthLabel(m),
      total,
      overload,
      breakdown: active.map(gd =>
        `${escapeHtml(gd.goal.name)} ${money(fmt(contribAtMonth(gd, m)))}`
      ).join(' · '),
    });
  }

  const peakWarn = peak.total > free && income > 0;
  const warningBanner = peakWarn
    ? `<div class="warning-banner">
        ⚠️ В пиковый месяц (<strong>${monthLabel(peak.month)}</strong>) нужно отложить
        <strong class="money">${fmt(peak.total)}</strong>, а свободно только <strong class="money">${fmt(free)}</strong>.
        Дефицит: <strong class="money">${fmt(peak.total - free)}</strong>. Растяни сроки или урежь цели.
      </div>`
    : '';

  const summary = `
    <div class="cal-summary">
      <div class="cal-sum-row">
        <span>Свободно в месяц (доход − расходы)</span>
        <span class="v">${fmt(free)}</span>
      </div>
      <div class="cal-sum-row">
        <span>Пик нагрузки</span>
        <span class="v ${peakWarn ? 'warn' : ''}">${fmt(peak.total)} · ${monthLabel(peak.month)}</span>
      </div>
      <div class="cal-sum-row">
        <span>Месяцев в плане</span>
        <span class="v">${rows.length}</span>
      </div>
    </div>
  `;

  const rowsHtml = rows.map(r => `
    <div class="cal-row ${r.overload ? 'overload' : ''}">
      <div class="cal-month">${r.label}</div>
      <div class="cal-breakdown">${r.breakdown}</div>
      <div class="cal-total">${fmt(r.total)}</div>
    </div>
  `).join('');

  el.innerHTML = warningBanner + summary + rowsHtml;
}

/* ==========================================================================
   12. СТАТИСТИКА
   ========================================================================== */

function getPeriodRange() {
  const mode = document.getElementById('periodSelect').value;
  const now = new Date();
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  if (mode === 'all') return { from: null, to: null, label: 'всё время' };
  if (mode === 'year') {
    return { from: `${now.getFullYear()}-01`, to: nowKey, label: `этот год` };
  }
  if (mode === 'custom') {
    const from = document.getElementById('periodFrom').value || null;
    const to = document.getElementById('periodTo').value || null;
    const fromLabel = from ? formatDeadline(from) : 'начало';
    const toLabel = to ? formatDeadline(to) : 'сейчас';
    return { from, to, label: `${fromLabel} — ${toLabel}` };
  }
  const n = parseInt(mode);
  const d = new Date(now.getFullYear(), now.getMonth() - n + 1, 1);
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return { from, to: nowKey, label: `последние ${n} мес` };
}

function filterContribsByRange(range) {
  const result = {};
  allGoals().forEach(g => {
    (g.contributions || []).forEach(c => {
      const m = (c.date || '').slice(0, 7);
      if (!m) return;
      if (range.from && m < range.from) return;
      if (range.to && m > range.to) return;
      result[m] = (result[m] || 0) + Number(c.amount || 0);
    });
  });
  return result;
}

function svgDonut(data, size = 180, thickness = 22) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return '';

  const r = (size - thickness) / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;

  let acc = 0;
  const segments = data.map(d => {
    const len = (d.value / total) * circ;
    const offset = -acc;
    acc += len;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="${d.color}" stroke-width="${thickness}"
      stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}"
      stroke-dashoffset="${offset.toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})"/>`;
  }).join('');

  const centerText = `
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="donut-center-label">Всего</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="donut-center-value money">${fmtShort(total)} ₽</text>
  `;

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${segments}${centerText}</svg>`;
}

function legendHtml(data) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return '';
  return data.map(d => {
    const pct = Math.round((d.value / total) * 100);
    return `
      <div class="legend-item">
        <span class="legend-dot" style="background:${d.color}"></span>
        <span class="legend-name">${escapeHtml(d.label)}</span>
        <span class="legend-pct">${pct}%</span>
        <span class="legend-value">${fmt(d.value)}</span>
      </div>
    `;
  }).join('');
}

function donutCard(title, data) {
  const filtered = data.filter(d => d.value > 0);
  if (!filtered.length) return '';
  return `
    <section class="card">
      <div class="card-title">${title}</div>
      <div class="stat-grid">
        <div style="display:flex;justify-content:center">${svgDonut(filtered)}</div>
        <div class="legend">${legendHtml(filtered)}</div>
      </div>
    </section>
  `;
}

function goalsProgressCard(goals, title) {
  if (!goals.length) return '';

  const sorted = [...goals].sort((a, b) => {
    const ca = calcGoal(a), cb = calcGoal(b);
    return cb.percent - ca.percent;
  });

  const rows = sorted.map((g, i) => {
    const c = calcGoal(g);
    let color = PALETTE[i % PALETTE.length];
    if (c.done) color = '#3ddc97';
    else if (c.overdue) color = '#ff5c7c';

    const badges = [];
    if (c.rateAnnual > 0) badges.push(`<span style="color:var(--green);font-size:11px">💹 ${c.rateAnnual}%</span>`);
    if (c.indexAnnual > 0) badges.push(`<span style="color:var(--yellow);font-size:11px">📈 ${c.indexAnnual}%</span>`);
    const badgeStr = badges.length ? ' ' + badges.join(' ') : '';

    return `
      <div class="stat-hbar-row">
        <div class="stat-hbar-head">
          <span class="stat-hbar-name">${escapeHtml(g.name)}${badgeStr}</span>
          <span class="stat-hbar-val">${money(fmt(c.saved))} / ${money(fmt(g.target))} · ${Math.round(c.percent)}%</span>
        </div>
        <div class="hbar-track">
          <div class="hbar-fill" style="width:${c.percent}%;background:${color}"></div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <section class="card">
      <div class="card-title">${title}</div>
      <div class="stat-hbars">${rows}</div>
    </section>
  `;
}

function incomeStackedBar() {
  const income = totalMonthlyIncome();
  if (income <= 0) return '';

  const baseExp = totalBaseExpenses();
  const goals = totalGoalsPerMonth();
  const free = Math.max(0, income - baseExp - goals);
  const deficit = income - baseExp - goals;

  const segments = [
    { label: 'Расходы', value: baseExp, color: '#5cc8ff' },
    { label: 'Накопления', value: goals, color: '#7c5cff' },
    { label: 'Свободно', value: free, color: '#3ddc97' },
  ].filter(s => s.value > 0);

  if (deficit < 0) {
    segments.push({ label: 'Дефицит', value: -deficit, color: '#ff5c7c' });
  }

  const total = segments.reduce((s, x) => s + x.value, 0);
  const bars = segments.map(s => {
    const pct = (s.value / total) * 100;
    const showLabel = pct > 8;
    return `<div class="stacked-seg" style="width:${pct}%;background:${s.color}">
      ${showLabel ? `<span>${Math.round(pct)}%</span>` : ''}
    </div>`;
  }).join('');

  const legend = segments.map(s => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${s.color}"></span>
      <span class="legend-name">${s.label}</span>
      <span class="legend-value">${fmt(s.value)}</span>
    </div>
  `).join('');

  return `
    <section class="card">
      <div class="card-title">Куда уходит месячный доход</div>
      <div class="stacked-bar">${bars}</div>
      <div class="legend">${legend}</div>
    </section>
  `;
}

function keyStatsCard() {
  const income = totalMonthlyIncome();
  const baseExp = totalBaseExpenses();
  const goals = totalGoalsPerMonth();
  const free = income - baseExp - goals;
  const all = allGoals();
  const totalSaved = all.reduce((s, g) => s + goalSaved(g), 0);
  const totalTargets = all.reduce((s, g) => s + Number(g.target || 0), 0);
  const savingRate = income > 0 ? ((goals / income) * 100) : 0;

  return `
    <section class="card">
      <div class="card-title">Ключевые метрики</div>
      <div class="stat-deltas">
        <div class="stat-tile">
          <div class="label">Норма сбережений</div>
          <div class="value ${savingRate > 20 ? 'income' : ''}">${savingRate.toFixed(0)}%</div>
        </div>
        <div class="stat-tile">
          <div class="label">Свободно в месяц</div>
          <div class="value ${free < 0 ? 'expense' : ''}">${money(fmt(free))}</div>
        </div>
        <div class="stat-tile">
          <div class="label">Накоплено на цели</div>
          <div class="value income">${money(fmt(totalSaved))}</div>
        </div>
        <div class="stat-tile">
          <div class="label">Осталось набрать</div>
          <div class="value">${money(fmt(Math.max(0, totalTargets - totalSaved)))}</div>
        </div>
      </div>
    </section>
  `;
}

function periodSummaryCard(contribByMonth, range) {
  const months = Object.keys(contribByMonth).sort();
  if (!months.length) {
    return `
      <section class="card">
        <div class="card-title">Сводка за период · ${range.label}</div>
        <div class="chart-empty">Нет взносов в выбранном периоде</div>
      </section>
    `;
  }

  const total = months.reduce((s, m) => s + contribByMonth[m], 0);
  const avg = total / months.length;
  const best = months.reduce((b, m) => contribByMonth[m] > contribByMonth[b] ? m : b, months[0]);

  const bestLabel = (() => {
    const [y, mo] = best.split('-').map(Number);
    return `${MONTHS_SHORT[mo-1]} ${y}`;
  })();

  return `
    <section class="card">
      <div class="card-title">Сводка за период · ${range.label}</div>
      <div class="stat-deltas">
        <div class="stat-tile">
          <div class="label">Всего внесено</div>
          <div class="value income">${money(fmt(total))}</div>
        </div>
        <div class="stat-tile">
          <div class="label">Средний в месяц</div>
          <div class="value">${money(fmt(avg))}</div>
        </div>
        <div class="stat-tile">
          <div class="label">Месяцев со взносами</div>
          <div class="value">${months.length}</div>
        </div>
        <div class="stat-tile">
          <div class="label">Лучший месяц</div>
          <div class="value" style="font-size:14px">${bestLabel} · ${money(fmtShort(contribByMonth[best]))}</div>
        </div>
      </div>
    </section>
  `;
}

function monthlyContribsCard(contribByMonth) {
  const months = Object.keys(contribByMonth).sort();
  if (!months.length) return '';

  const values = months.map(m => contribByMonth[m]);
  const max = Math.max(...values, 1);
  const total = values.reduce((s, v) => s + v, 0);

  const W = 640, H = 200;
  const pad = { t: 20, r: 12, b: 34, l: 46 };
  const w = W - pad.l - pad.r;
  const h = H - pad.t - pad.b;

  const barW = Math.min(60, w / months.length * 0.7);
  const step = months.length > 1 ? w / months.length : w;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(p => {
    const y = pad.t + h - p * h;
    return `<line class="grid-line" x1="${pad.l}" y1="${y}" x2="${pad.l + w}" y2="${y}"/>`;
  }).join('');

  const yLabels = [0, 0.25, 0.5, 0.75, 1].map(p => {
    const y = pad.t + h - p * h;
    return `<text x="${pad.l - 6}" y="${y + 4}" text-anchor="end" class="axis-label money">${fmtShort(max * p)}</text>`;
  }).join('');

  const bars = months.map((m, i) => {
    const v = values[i];
    const bh = (v / max) * h;
    const x = pad.l + i * step + (step - barW) / 2;
    const y = pad.t + h - bh;
    return `<rect class="bar-rect" x="${x.toFixed(1)}" y="${y.toFixed(1)}"
      width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="#7c5cff"/>`;
  }).join('');

  const xLabels = months.map((m, i) => {
    const [y, mo] = m.split('-').map(Number);
    const label = `${MONTHS_SHORT[mo-1]} ${String(y).slice(2)}`;
    const x = pad.l + i * step + step / 2;
    return `<text x="${x.toFixed(1)}" y="${pad.t + h + 18}" text-anchor="middle" class="axis-label">${label}</text>`;
  }).join('');

  const svg = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    ${gridLines}${yLabels}${bars}${xLabels}
    <line class="axis-line" x1="${pad.l}" y1="${pad.t + h}" x2="${pad.l + w}" y2="${pad.t + h}"/>
  </svg>`;

  return `
    <section class="card">
      <div class="card-title">Взносы по месяцам · ${money(fmt(total))}</div>
      ${svg}
    </section>
  `;
}

function cumulativeChart(contribByMonth, range) {
  const months = Object.keys(contribByMonth).sort();
  if (months.length < 2) return '';

  const cum = [];
  let acc = 0;
  months.forEach(m => {
    acc += contribByMonth[m];
    cum.push({ month: m, value: acc });
  });

  const max = cum[cum.length - 1].value || 1;
  const W = 640, H = 200;
  const pad = { t: 20, r: 12, b: 34, l: 46 };
  const w = W - pad.l - pad.r;
  const h = H - pad.t - pad.b;

  const step = cum.length > 1 ? w / (cum.length - 1) : 0;
  const coords = cum.map((p, i) => ({
    x: pad.l + i * step,
    y: pad.t + h - (p.value / max) * h,
    ...p,
  }));

  const pathD = coords.map((c, i) =>
    (i === 0 ? 'M' : 'L') + c.x.toFixed(1) + ' ' + c.y.toFixed(1)
  ).join(' ');

  const areaD = pathD +
    ` L ${coords[coords.length - 1].x.toFixed(1)} ${(pad.t + h).toFixed(1)}` +
    ` L ${coords[0].x.toFixed(1)} ${(pad.t + h).toFixed(1)} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(p => {
    const y = pad.t + h - p * h;
    return `<line class="grid-line" x1="${pad.l}" y1="${y}" x2="${pad.l + w}" y2="${y}"/>`;
  }).join('');

  const yLabels = [0, 0.25, 0.5, 0.75, 1].map(p => {
    const y = pad.t + h - p * h;
    return `<text x="${pad.l - 6}" y="${y + 4}" text-anchor="end" class="axis-label money">${fmtShort(max * p)}</text>`;
  }).join('');

  const dots = coords.map(c =>
    `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="#3ddc97" stroke="#1a1d27" stroke-width="2"/>`
  ).join('');

  const xLabels = cum.map((c, i) => {
    if (cum.length > 8 && i % 2 !== 0 && i !== cum.length - 1) return '';
    const [y, mo] = c.month.split('-').map(Number);
    const label = `${MONTHS_SHORT[mo-1]} ${String(y).slice(2)}`;
    return `<text x="${coords[i].x.toFixed(1)}" y="${pad.t + h + 18}" text-anchor="middle" class="axis-label">${label}</text>`;
  }).join('');

  const svg = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3ddc97" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#3ddc97" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${gridLines}${yLabels}
    <path d="${areaD}" fill="url(#areaGrad)"/>
    <path d="${pathD}" fill="none" stroke="#3ddc97" stroke-width="2" stroke-linejoin="round"/>
    ${dots}${xLabels}
    <line class="axis-line" x1="${pad.l}" y1="${pad.t + h}" x2="${pad.l + w}" y2="${pad.t + h}"/>
  </svg>`;

  return `
    <section class="card">
      <div class="card-title">Накопления нарастающим итогом · ${range.label} · ${money(fmt(max))}</div>
      ${svg}
    </section>
  `;
}

function renderStats() {
  const el = document.getElementById('statsContent');

  const hasIncome = state.monthlyIncomes.length > 0;
  const hasExpenses = state.expenses.length > 0;
  const hasGoals = state.goals.length > 0 || state.shortGoals.length > 0;
  const hasContribs = allGoals().some(g => (g.contributions || []).length > 0);

  if (!hasIncome && !hasExpenses && !hasGoals) {
    el.innerHTML = '<section class="card"><div class="chart-empty">Пока нечего показывать — заполни данные во вкладке «План» 📋</div></section>';
    return;
  }

  const range = getPeriodRange();
  const contribByMonth = filterContribsByRange(range);

  let html = '';

  html += keyStatsCard();
  html += incomeStackedBar();

  if (hasIncome) {
    const data = state.monthlyIncomes.map((i, idx) => ({
      label: i.name,
      value: Number(i.amount) || 0,
      color: PALETTE[idx % PALETTE.length],
    }));
    html += donutCard('Источники месячного дохода', data);
  }

  const expData = state.expenses.map((e, idx) => ({
    label: e.name,
    value: Number(e.amount) || 0,
    color: PALETTE[(idx + 2) % PALETTE.length],
  }));
  const longGoalsMonth = totalLongGoalsPerMonth();
  const shortGoalsMonth = totalShortGoalsPerMonth();
  if (longGoalsMonth > 0) {
    expData.push({ label: '🎯 Долгосрочные цели', value: longGoalsMonth, color: '#7c5cff' });
  }
  if (shortGoalsMonth > 0) {
    expData.push({ label: '🎯 Краткосрочные цели', value: shortGoalsMonth, color: '#ffc857' });
  }
  if (expData.length) {
    html += donutCard('Структура месячных расходов', expData);
  }

  if (state.goals.length) {
    html += goalsProgressCard(state.goals, 'Прогресс по долгосрочным целям');
  }
  if (state.shortGoals.length) {
    html += goalsProgressCard(state.shortGoals, 'Прогресс по краткосрочным целям');
  }

  if (hasContribs) {
    html += periodSummaryCard(contribByMonth, range);
    if (Object.keys(contribByMonth).length) {
      html += monthlyContribsCard(contribByMonth);
      html += cumulativeChart(contribByMonth, range);
    }
  }

  el.innerHTML = html;
}

/* ==========================================================================
   13. CRUD: ДОХОДЫ И РАСХОДЫ
   ========================================================================== */

function addMonthlyIncome() {
  const nameEl = document.getElementById('miName');
  const amtEl = document.getElementById('miAmount');
  const name = nameEl.value.trim();
  const amount = parseFloat(amtEl.value);
  if (!name) { nameEl.focus(); return; }
  if (isNaN(amount) || amount < 0) { amtEl.focus(); return; }

  state.monthlyIncomes.push({ id: uid(), name, amount });
  nameEl.value = ''; amtEl.value = ''; nameEl.focus();
  save(); renderMonthlyIncomes(); renderTotal(); renderCalendar(); renderStats();
}

function addOneTimeIncome() {
  const nameEl = document.getElementById('oiName');
  const amtEl = document.getElementById('oiAmount');
  const dateEl = document.getElementById('oiDate');
  const name = nameEl.value.trim();
  const amount = parseFloat(amtEl.value);
  const date = dateEl.value || todayStr();

  if (!name) { nameEl.focus(); return; }
  if (isNaN(amount) || amount < 0) { amtEl.focus(); return; }

  state.oneTimeIncomes.push({ id: uid(), name, amount, date });
  nameEl.value = ''; amtEl.value = ''; dateEl.value = todayStr(); nameEl.focus();
  save(); renderOneTimeIncomes(); renderTotal(); renderStats();
}

function addExpense() {
  const nameEl = document.getElementById('expName');
  const amtEl = document.getElementById('expAmount');
  const name = nameEl.value.trim();
  const amount = parseFloat(amtEl.value);
  if (!name) { nameEl.focus(); return; }
  if (isNaN(amount) || amount < 0) { amtEl.focus(); return; }

  state.expenses.push({ id: uid(), name, amount });
  nameEl.value = ''; amtEl.value = ''; nameEl.focus();
  save(); renderExpenses(); renderTotal(); renderCalendar(); renderStats();
}

/* ==========================================================================
   14. ЭКСПОРТ / ИМПОРТ
   ========================================================================== */

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[;"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportCSV() {
  const income = totalMonthlyIncome();
  const baseExp = totalBaseExpenses();
  const longGoalsPerMonth = totalLongGoalsPerMonth();
  const shortGoalsPerMonth = totalShortGoalsPerMonth();
  const goalsPerMonth = longGoalsPerMonth + shortGoalsPerMonth;
  const totalExp = baseExp + goalsPerMonth;
  const oneTime = totalOneTimeThisMonth();
  const free = income - totalExp + oneTime;

  const rows = [];
  const push = (...cells) => rows.push(cells.map(csvEscape).join(';'));

  push('Планировщик финансов');
  push('Дата экспорта', todayStr());
  push();

  push('МЕСЯЧНЫЙ ДОХОД');
  push('Источник', 'Сумма (₽)');
  state.monthlyIncomes.forEach(i => push(i.name, fmtNum(i.amount)));
  if (!state.monthlyIncomes.length) push('—', '0');
  push('ИТОГО в месяц', fmtNum(income));
  push();

  push('РАЗОВЫЙ ДОХОД');
  push('Название', 'Дата', 'Сумма (₽)');
  [...state.oneTimeIncomes]
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .forEach(i => push(i.name, i.date || '', fmtNum(i.amount)));
  if (!state.oneTimeIncomes.length) push('—', '', '0');
  push('ИТОГО разовых', fmtNum(state.oneTimeIncomes.reduce((s, i) => s + Number(i.amount || 0), 0)));
  push('В том числе в этом месяце', fmtNum(oneTime));
  push();

  push('ЕЖЕМЕСЯЧНЫЕ РАСХОДЫ');
  push('Название', 'Сумма (₽)');
  state.expenses.forEach(e => push(e.name, fmtNum(e.amount)));
  if (!state.expenses.length) push('—', '0');
  push('ИТОГО обычных расходов', fmtNum(baseExp));
  push();
  push('НАКОПЛЕНИЯ НА ДОЛГОСРОЧНЫЕ ЦЕЛИ (авто)', fmtNum(longGoalsPerMonth));
  push('НАКОПЛЕНИЯ НА КРАТКОСРОЧНЫЕ ЦЕЛИ (авто)', fmtNum(shortGoalsPerMonth));
  push('ИТОГО РАСХОДОВ В МЕСЯЦ', fmtNum(totalExp));
  push();

  const goalHeader = ['Название', 'Цель (₽)', 'Отложено (₽)', 'Осталось (₽)', 'Срок', 'Месяцев',
       'Ставка %', 'Индексация %', 'Взнос 1-й год (₽)', 'Взнос последний (₽)',
       'Доход от % (₽)', 'Прогресс', 'Взносов'];

  push('ДОЛГОСРОЧНЫЕ ЦЕЛИ');
  push(...goalHeader);
  const sortedLong = [...state.goals].sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
  sortedLong.forEach(g => {
    const c = calcGoal(g);
    const lastMonthly = c.yearBreakdown.length
      ? c.yearBreakdown[c.yearBreakdown.length - 1].monthly
      : c.perMonth;
    push(
      g.name, fmtNum(g.target), fmtNum(c.saved), fmtNum(c.remaining),
      formatDeadline(g.deadline), c.months,
      c.rateAnnual > 0 ? c.rateAnnual.toString() : '',
      c.indexAnnual > 0 ? c.indexAnnual.toString() : '',
      fmtNum(c.perMonth),
      fmtNum(lastMonthly),
      c.interestEarned > 0 ? fmtNum(c.interestEarned) : '',
      Math.round(c.percent) + '%',
      (g.contributions || []).length
    );
  });
  if (!state.goals.length) push('—');
  push('ИТОГО в месяц на долгосрочные цели', fmtNum(longGoalsPerMonth));
  push();

  push('КРАТКОСРОЧНЫЕ ЦЕЛИ');
  push(...goalHeader);
  const sortedShort = [...state.shortGoals].sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
  sortedShort.forEach(g => {
    const c = calcGoal(g);
    const lastMonthly = c.yearBreakdown.length
      ? c.yearBreakdown[c.yearBreakdown.length - 1].monthly
      : c.perMonth;
    push(
      g.name, fmtNum(g.target), fmtNum(c.saved), fmtNum(c.remaining),
      formatDeadline(g.deadline), c.months,
      c.rateAnnual > 0 ? c.rateAnnual.toString() : '',
      c.indexAnnual > 0 ? c.indexAnnual.toString() : '',
      fmtNum(c.perMonth),
      fmtNum(lastMonthly),
      c.interestEarned > 0 ? fmtNum(c.interestEarned) : '',
      Math.round(c.percent) + '%',
      (g.contributions || []).length
    );
  });
  if (!state.shortGoals.length) push('—');
  push('ИТОГО в месяц на краткосрочные цели', fmtNum(shortGoalsPerMonth));
  push();

  push('ВЗНОСЫ');
  push('Тип', 'Цель', 'Дата', 'Сумма (₽)');
  sortedLong.forEach(g => {
    (g.contributions || [])
      .slice().sort((a, b) => a.date.localeCompare(b.date))
      .forEach(cn => push('Долгосрочная', g.name, cn.date, fmtNum(cn.amount)));
  });
  sortedShort.forEach(g => {
    (g.contributions || [])
      .slice().sort((a, b) => a.date.localeCompare(b.date))
      .forEach(cn => push('Краткосрочная', g.name, cn.date, fmtNum(cn.amount)));
  });
  push();

  push('ИТОГ');
  push('Месячный доход', fmtNum(income));
  push('Расходы в месяц (вкл. цели)', '−' + fmtNum(totalExp));
  push('  в т.ч. на долгосрочные цели', '−' + fmtNum(longGoalsPerMonth));
  push('  в т.ч. на краткосрочные цели', '−' + fmtNum(shortGoalsPerMonth));
  push('Разовые доходы (в этом месяце)', '+' + fmtNum(oneTime));
  push('Свободно на жизнь', fmtNum(free));

  const csv = '\ufeff' + rows.join('\r\n');
  download(`finance_${todayStr()}.csv`, csv, 'text/csv;charset=utf-8');
  showToast('CSV скачан');
}

function exportJSON() {
  const data = {
    exportedAt: new Date().toISOString(),
    version: 6,
    monthlyIncomes: state.monthlyIncomes,
    oneTimeIncomes: state.oneTimeIncomes,
    expenses: state.expenses,
    goals: state.goals,
    shortGoals: state.shortGoals,
  };
  const json = JSON.stringify(data, null, 2);
  download(`finance_backup_${todayStr()}.json`, json, 'application/json');
  showToast('Бэкап скачан');
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (typeof data !== 'object' || data === null) throw new Error('не объект');

      if (!confirm('Импорт перезапишет все текущие данные. Продолжить?')) return;

      let monthlyIncomes = [];
      if (Array.isArray(data.monthlyIncomes)) {
        monthlyIncomes = data.monthlyIncomes.map(x => ({
          id: x.id || uid(),
          name: String(x.name || ''),
          amount: Number(x.amount) || 0,
        }));
      } else if (Number(data.salary) > 0) {
        monthlyIncomes = [{ id: uid(), name: 'Зарплата', amount: Number(data.salary) }];
      }

      const oneTimeIncomes = Array.isArray(data.oneTimeIncomes)
        ? data.oneTimeIncomes.map(x => ({
            id: x.id || uid(),
            name: String(x.name || ''),
            amount: Number(x.amount) || 0,
            date: x.date || todayStr(),
          }))
        : [];

      const expenses = Array.isArray(data.expenses)
        ? data.expenses.map(x => ({
            id: x.id || uid(),
            name: String(x.name || ''),
            amount: Number(x.amount) || 0,
          }))
        : [];

      const parseGoals = arr => Array.isArray(arr)
        ? arr.map(g => {
            const contributions = Array.isArray(g.contributions)
              ? g.contributions.map(c => ({
                  id: c.id || uid(),
                  date: c.date || todayStr(),
                  amount: Number(c.amount) || 0,
                }))
              : [];
            if (!contributions.length && Number(g.saved) > 0) {
              contributions.push({ id: uid(), date: todayStr(), amount: Number(g.saved) });
            }
            return {
              id: g.id || uid(),
              name: String(g.name || ''),
              target: Number(g.target) || 0,
              deadline: g.deadline || '',
              contributions,
              rate: Number(g.rate) || 0,
              indexRate: Number(g.indexRate) || 0,
            };
          })
        : [];

      const goals = parseGoals(data.goals);
      const shortGoals = parseGoals(data.shortGoals);

      state = { monthlyIncomes, oneTimeIncomes, expenses, goals, shortGoals };

      save();
      renderMonthlyIncomes(); renderOneTimeIncomes(); renderExpenses();
      renderGoals(); renderShortGoals();
      renderTotal(); renderCalendar(); renderStats();
      showToast('Данные восстановлены');
    } catch (err) {
      console.error(err);
      showToast('Ошибка: ' + err.message, true);
    }
  };
  reader.readAsText(file);
}

/* ==========================================================================
   15. TOAST
   ========================================================================== */

let toastTimer;
function showToast(msg, isError, action) {
  const el = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  const actionBtn = document.getElementById('toastAction');

  if (action) {
    actionBtn.textContent = action.label;
    actionBtn.style.display = 'inline-block';
    actionBtn.onclick = () => {
      hideToast();
      action.onClick();
    };
  } else {
    actionBtn.style.display = 'none';
    actionBtn.onclick = null;
  }

  el.classList.toggle('error', !!isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 5500 : 2200);
}

function hideToast() {
  document.getElementById('toast').classList.remove('show');
}

/* ==========================================================================
   16. ТАБЫ
   ========================================================================== */

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.toggle('hidden', el.id !== 'tab-' + name);
  });
  if (name === 'calendar') renderCalendar();
  if (name === 'stats') renderStats();
}

/* ==========================================================================
   17. СВОРАЧИВАЕМЫЕ СЕКЦИИ
   ========================================================================== */

function initCollapsibles() {
  document.querySelectorAll('.collapsible [data-collapse-toggle]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const card = btn.closest('.collapsible');
      card.classList.toggle('collapsed');
      saveCollapsedState();
    });
  });

  document.querySelectorAll('.collapsible .card-title-text').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      el.closest('.collapsible').querySelector('[data-collapse-toggle]').click();
    });
  });

  restoreCollapsedState();
}

function saveCollapsedState() {
  const collapsed = [...document.querySelectorAll('.collapsible.collapsed')]
    .map(c => c.dataset.collapseId)
    .filter(Boolean);
  try {
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(collapsed));
  } catch (e) {}
}

function restoreCollapsedState() {
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) return;
    const collapsed = JSON.parse(raw);
    if (!Array.isArray(collapsed)) return;
    collapsed.forEach(id => {
      const card = document.querySelector(`.collapsible[data-collapse-id="${id}"]`);
      if (card) card.classList.add('collapsed');
    });
  } catch (e) {}
}

/* ==========================================================================
   18. ИНИЦИАЛИЗАЦИЯ
   ========================================================================== */

load();

document.getElementById('oiDate').value = todayStr();

// Privacy: синхронизируем label/aria с сохранённым состоянием
setPrivacy(isPrivacyOn());
document.getElementById('privacyToggle').addEventListener('click', togglePrivacy);

renderMonthlyIncomes();
renderOneTimeIncomes();
renderExpenses();
renderGoals();
renderShortGoals();
renderTotal();
renderCalendar();
renderStats();

document.getElementById('addMiBtn').onclick = addMonthlyIncome;
document.getElementById('miName').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('miAmount').focus();
});
document.getElementById('miAmount').addEventListener('keydown', e => {
  if (e.key === 'Enter') addMonthlyIncome();
});

document.getElementById('addOiBtn').onclick = addOneTimeIncome;
document.getElementById('oiName').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('oiAmount').focus();
});
document.getElementById('oiAmount').addEventListener('keydown', e => {
  if (e.key === 'Enter') addOneTimeIncome();
});

document.getElementById('addExpBtn').onclick = addExpense;
document.getElementById('expName').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('expAmount').focus();
});
document.getElementById('expAmount').addEventListener('keydown', e => {
  if (e.key === 'Enter') addExpense();
});

document.getElementById('toggleGoalForm').onclick = () => {
  openGoalModal('add', null, 'long');
};

document.getElementById('toggleShortGoalForm').onclick = () => {
  openGoalModal('add', null, 'short');
};

document.getElementById('goalModalClose').onclick = closeGoalModal;
document.getElementById('goalModalCancel').onclick = closeGoalModal;
document.getElementById('goalModalSave').onclick = saveGoalFromModal;

document.getElementById('goalModal').addEventListener('click', e => {
  if (e.target.id === 'goalModal') closeGoalModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('goalModal').style.display !== 'none') {
    closeGoalModal();
  }
});

document.getElementById('mGoalUseRate').addEventListener('change', e => {
  const group = document.getElementById('mGoalRateGroup');
  group.style.display = e.target.checked ? 'block' : 'none';
  if (e.target.checked) document.getElementById('mGoalRate').focus();
});

document.getElementById('mGoalUseIndex').addEventListener('change', e => {
  const group = document.getElementById('mGoalIndexGroup');
  group.style.display = e.target.checked ? 'block' : 'none';
  if (e.target.checked) document.getElementById('mGoalIndex').focus();
});

document.querySelectorAll('#mGoalQuickDates button').forEach(btn => {
  btn.onclick = () => setModalDeadlineOffset(Number(btn.dataset.addMonths));
});

document.getElementById('mGoalName').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('mGoalTarget').focus();
});
document.getElementById('mGoalTarget').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('mGoalSaved').focus();
});

document.getElementById('periodSelect').addEventListener('change', e => {
  document.getElementById('customPeriodRow').style.display =
    e.target.value === 'custom' ? 'flex' : 'none';
  renderStats();
});
document.getElementById('periodFrom').addEventListener('change', renderStats);
document.getElementById('periodTo').addEventListener('change', renderStats);

(function initCustomPeriod() {
  const now = new Date();
  const sixAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const from = `${sixAgo.getFullYear()}-${String(sixAgo.getMonth() + 1).padStart(2, '0')}`;
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  document.getElementById('periodFrom').value = from;
  document.getElementById('periodTo').value = to;
})();

document.getElementById('exportCsvBtn').onclick = exportCSV;
document.getElementById('exportJsonBtn').onclick = exportJSON;
document.getElementById('importJsonBtn').onclick = () => {
  document.getElementById('importFile').click();
};
document.getElementById('importFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) importJSON(file);
  e.target.value = '';
});

document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => switchTab(t.dataset.tab);
});

initCollapsibles();

/* ==========================================================================
   19. PWA: МАНИФЕСТ, ИКОНКИ, SERVICE WORKER, УСТАНОВКА
   ========================================================================== */

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c5cff"/>
      <stop offset="100%" stop-color="#3ddc97"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <text x="256" y="256" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
        font-size="300" font-weight="700" text-anchor="middle" dominant-baseline="central"
        fill="#ffffff">₽</text>
</svg>`;

const ICON_DATA_URI = 'data:image/svg+xml;base64,' +
  btoa(unescape(encodeURIComponent(ICON_SVG)));

(function injectManifest() {
  const manifest = {
    name: 'Планировщик финансов',
    short_name: 'Финансы',
    description: 'Планирование личного бюджета: доходы, расходы, долгосрочные цели',
    start_url: '.',
    scope: '.',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f1117',
    theme_color: '#0f1117',
    lang: 'ru',
    dir: 'ltr',
    icons: [
      { src: ICON_DATA_URI, sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
      { src: ICON_DATA_URI, sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
      { src: ICON_DATA_URI, sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
    ]
  };

  const json = JSON.stringify(manifest);
  const manifestUri = 'data:application/manifest+json;charset=utf-8,' +
    encodeURIComponent(json);

  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = manifestUri;
  document.head.appendChild(link);

  const appleIcon = document.createElement('link');
  appleIcon.rel = 'apple-touch-icon';
  appleIcon.href = ICON_DATA_URI;
  document.head.appendChild(appleIcon);

  const favicon = document.createElement('link');
  favicon.rel = 'icon';
  favicon.type = 'image/svg+xml';
  favicon.href = ICON_DATA_URI;
  document.head.appendChild(favicon);
})();

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.matchMedia('(display-mode: fullscreen)').matches ||
         window.navigator.standalone === true;
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(reg => console.log('[PWA] SW зарегистрирован:', reg.scope))
      .catch(err => console.warn('[PWA] SW не зарегистрирован:', err.message));
  });
}

let deferredInstallPrompt = null;
const installBtn = document.getElementById('installPwaBtn');

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (!isStandalone()) {
    installBtn.style.display = 'flex';
  }
});

installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  installBtn.style.display = 'none';
  deferredInstallPrompt.prompt();
  try {
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log('[PWA] Install outcome:', outcome);
  } catch (e) { console.warn(e); }
  deferredInstallPrompt = null;
});

window.addEventListener('appinstalled', () => {
  installBtn.style.display = 'none';
  deferredInstallPrompt = null;
  showToast('Приложение установлено 🎉');
});

if (isStandalone()) {
  installBtn.style.display = 'none';
}

(function iosInstallHint() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  if (isIOS && isSafari && !isStandalone()) {
    const dismissed = localStorage.getItem('ios_install_hint_dismissed');
    if (dismissed) return;

    setTimeout(() => {
      showToast('📲 Установи на iPhone: Поделиться → На экран «Домой»', false, {
        label: 'Понятно',
        onClick: () => {
          localStorage.setItem('ios_install_hint_dismissed', '1');
        }
      });
    }, 3000);
  }
})();

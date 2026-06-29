/* =====================================================================
   ЭТАП 2: Полная логика раздела "Сделки"
   - Создать сделку (форма, валидация, отправка в бота)
   - Мои сделки (фильтрация, список, счётчики)
   - Найти сделку (поиск по ID)
   - Детальная страница (действия в зависимости от роли и статуса)
===================================================================== */

// ── Telegram WebApp API ────────────────────────────────────────────────────
const tg = window.Telegram?.WebApp;
const TG_USER = tg?.initDataUnsafe?.user || { id: 0, username: 'demo', first_name: 'Demo' };
const INIT_DATA = tg?.initData || '';

if (tg) {
  tg.ready();
  tg.expand();
  tg.disableVerticalSwipes?.();
}

// ── Константы ──────────────────────────────────────────────────────────────
const BOT_URL = 'https://t.me/NotcoinSafeBot';
const MINIAPP_URL = 'https://ssxzico.github.io/myminiapp/';
const MANAGER = 'NotcoinxAdmin';
const COMMISSION = 0.01; // 1%

const CURRENCIES = {
  stars: { label: '⭐ STARS', symbol: 'STARS', min: 50 },
  ton: { label: '💎 TON', symbol: 'TON', min: 0.5 },
  usdt: { label: '💵 USDT', symbol: 'USDT', min: 1 },
  rub: { label: '🇷🇺 RUB', symbol: 'RUB', min: 100 },
  uah: { label: '🇺🇦 UAH', symbol: 'UAH', min: 50 },
  uzs: { label: '🇺🇿 UZS', symbol: 'UZS', min: 10000 },
};

const STATUS_LABELS = {
  pending: { ru: 'Ожидает участника', en: 'Waiting for participant', cls: 'status-pill--wait' },
  active: { ru: 'Активна', en: 'Active', cls: 'status-pill--active' },
  paid: { ru: 'Оплачена', en: 'Paid', cls: 'status-pill--wait' },
  awaiting_buyer: { ru: 'Ждёт подтверждения', en: 'Awaiting confirmation', cls: 'status-pill--wait' },
  completed: { ru: 'Завершена', en: 'Completed', cls: 'status-pill--done' },
  cancelled: { ru: 'Отменена', en: 'Cancelled', cls: 'status-pill--cancel' },
  dispute: { ru: 'Спор', en: 'Dispute', cls: 'status-pill--dispute' },
};

// ── Реальные сделки из API ───────────────────────────────────────────────
let DEALS_DB = [];
let LAST_API_OK = false;
localStorage.removeItem('otc_deals');

function replaceDealsFromServer(deals) {
  DEALS_DB = Array.isArray(deals) ? deals : [];
  if (state.currentDeal) {
    state.currentDeal = DEALS_DB.find(d => d.deal_id === state.currentDeal.deal_id) || state.currentDeal;
  }
}

function upsertDeal(deal) {
  if (!deal || !deal.deal_id) return;
  const idx = DEALS_DB.findIndex(d => d.deal_id === deal.deal_id);
  if (idx >= 0) DEALS_DB[idx] = deal;
  else DEALS_DB.unshift(deal);
  state.currentDeal = deal;
}

function saveDealsToDB() {
  // Deals are stored in SQLite via the bot API. Local fake cache is intentionally disabled.
}

function genDealId() {
  return '';
}

// ── Утилиты ────────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const months = APP_LANG === 'en'
    ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    : ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${d.getDate()} ${months[d.getMonth()]}, ${h}:${m}`;
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function getUserRole(deal) {
  const uid = TG_USER.id || 0;
  if (deal.creator_id === uid) return deal.creator_role;
  return deal.creator_role === 'seller' ? 'buyer' : 'seller';
}

function getPartnerUsername(deal) {
  const uid = TG_USER.id || 0;
  if (deal.creator_id === uid) return deal.respondent_username || null;
  return deal.creator_username || null;
}

function roleLabel(role) {
  return role === 'seller' ? tr('role_seller') : tr('role_buyer');
}

function formatAmount(amount, currency) {
  const sym = CURRENCIES[currency]?.symbol || String(currency || '').toUpperCase();
  return `${Number(amount || 0).toFixed(2)} ${sym}`;
}

function makeStatusPill(status) {
  const s = STATUS_LABELS[status] || { ru: status, en: status, cls: '' };
  return `<span class="status-pill ${s.cls}">${escapeHTML(s[APP_LANG] || s.ru || status)}</span>`;
}

function makeTicket(deal, navTarget) {
  const role = getUserRole(deal);
  const partner = getPartnerUsername(deal);
  const partnerLabel = role === 'seller' ? tr('buyer_label') : tr('seller_label');
  const partnerStr = partner
    ? `${partnerLabel} · @${escapeHTML(partner)}`
    : `${partnerLabel} · ${tr('waiting_label')}`;
  return `
    <button class="ticket" data-nav="${navTarget}" data-deal-id="${escapeHTML(deal.deal_id)}">
      <div class="ticket__row">
        <span class="ticket__id">OTC-${escapeHTML(deal.deal_id)}</span>
        ${makeStatusPill(deal.status)}
      </div>
      <div class="ticket__row">
        <span class="ticket__desc">${escapeHTML(deal.description)}</span>
        <span class="ticket__amount">${formatAmount(deal.amount, deal.currency).replace(' ', '<span class="dim"> ')}${'</span>'}</span>
      </div>
      <div class="ticket__row ticket__row--meta">
        <span>${partnerStr}</span>
        <span>${formatDate(deal.created_at)}</span>
      </div>
    </button>`;
}

// ── Состояние приложения ────────────────────────────────────────────────────
const state = {
  currentDeal: null,       // сделка открытая в detail
  myDealsFilter: 'active', // фильтр "Мои сделки"
  searchResult: null,      // результат поиска
  createForm: {
    role: 'seller',
    currency: 'stars',
    amount: '',
    description: '',
  }
};

// ── НАВИГАЦИЯ (из этапа 1, расширено) ─────────────────────────────────────
const SCREENS = {
  'deals': { title: 'Сделки', tab: 'deals', back: false },
  'deals-create': { title: 'Создать сделку', tab: 'deals', back: true },
  'deals-my': { title: 'Мои сделки', tab: 'deals', back: true },
  'deals-search': { title: 'Найти сделку', tab: 'deals', back: true },
  'deals-detail': { title: 'Сделка', tab: 'deals', back: true },
  'wallets': { title: 'Реквизиты', tab: 'wallets', back: false },
  'wallets-edit': { title: 'Редактировать', tab: 'wallets', back: true },
  'profile': { title: 'Профиль', tab: 'profile', back: false },
  'settings': { title: 'Настройки', tab: 'settings', back: false },
  'settings-lang': { title: 'Язык интерфейса', tab: 'settings', back: true },
  'settings-support': { title: 'Поддержка', tab: 'settings', back: true },
};
const TAB_HOME = { deals: 'deals', wallets: 'wallets', profile: 'profile', settings: 'settings' };

const contentEl = document.getElementById('content');
const titleEl = document.getElementById('screenTitle');
const backBtn = document.getElementById('backBtn');
const tabbar = document.querySelector('.tabbar');

let historyStack = ['deals'];

function renderScreen(name) {
  document.querySelectorAll('.screen').forEach(s => {
    s.hidden = s.dataset.screen !== name;
  });
  const meta = SCREENS[name];
  titleEl.textContent = meta.title;
  backBtn.hidden = !meta.back;
  tabbar.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('is-active', t.dataset.tab === meta.tab);
  });
  contentEl.scrollTo({ top: 0, behavior: 'smooth' });

  // Инициализация данных при переходе
  if (name === 'deals') renderDealsHome();
  if (name === 'deals-my') renderMyDeals();
  if (name === 'deals-create') initCreateForm();
  if (name === 'deals-search') initSearch();
  if (name === 'deals-detail') renderDealDetail();
}

function navigate(name, opts = {}) {
  if (!SCREENS[name]) return;
  if (opts.reset) historyStack = [name];
  else historyStack.push(name);
  renderScreen(name);
}

function goBack() {
  if (historyStack.length > 1) {
    historyStack.pop();
    renderScreen(historyStack[historyStack.length - 1]);
  }
}

document.addEventListener('click', (e) => {
  const navEl = e.target.closest('[data-nav]');
  if (!navEl) return;
  const target = navEl.dataset.nav;
  const dealId = navEl.dataset.dealId;
  if (dealId) {
    const deal = DEALS_DB.find(d => d.deal_id === dealId);
    if (deal) state.currentDeal = deal;
  }
  navigate(target);
});

tabbar.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => navigate(TAB_HOME[btn.dataset.tab], { reset: true }));
});
backBtn.addEventListener('click', goBack);

// ── ТЕМА ───────────────────────────────────────────────────────────────────
const themeBtn = document.getElementById('themeBtn');
function applyTheme(t2) {
  document.documentElement.classList.toggle('light', t2 === 'light');
  localStorage.setItem('miniapp-theme', t2);
}
(function initTheme() {
  const s = localStorage.getItem('miniapp-theme');
  if (s) { applyTheme(s); return; }
  applyTheme(window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
})();
themeBtn.addEventListener('click', () => {
  applyTheme(document.documentElement.classList.contains('light') ? 'dark' : 'light');
});

// ═══════════════════════════════════════════════════════════════════════════
// РАЗДЕЛ: СДЕЛКИ — Главная
// ═══════════════════════════════════════════════════════════════════════════
function renderDealsHome() {
  const uid = TG_USER.id || 0;
  const myDeals = DEALS_DB.filter(d => d.creator_id === uid || d.respondent_id === uid);
  const active = myDeals.filter(d => ['active', 'pending', 'paid', 'awaiting_buyer', 'dispute'].includes(d.status));
  const done = myDeals.filter(d => d.status === 'completed');

  const myBtn = document.getElementById("myDealsSub");
  if (myBtn) {
    myBtn.textContent = `${active.length} ${tr('active_short')} · ${done.length} ${tr('completed_short')}`;
  }

  const list = document.getElementById('deals-preview-list');
  if (!list) return;
  const recent = [...myDeals].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 2);
  list.innerHTML = recent.length
    ? recent.map(d => makeTicket(d, 'deals-detail')).join('')
    : `<p class="empty-hint">${tr(LAST_API_OK ? 'no_deals' : 'loading')}</p>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// РАЗДЕЛ: СОЗДАТЬ СДЕЛКУ
// ═══════════════════════════════════════════════════════════════════════════
function initCreateForm() {
  // Сбрасываем форму
  state.createForm = { role: 'seller', currency: 'stars', amount: '', description: '' };

  // Роли
  document.querySelectorAll('[data-create-role]').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.createRole === state.createForm.role);
    btn.addEventListener('click', () => {
      state.createForm.role = btn.dataset.createRole;
      document.querySelectorAll('[data-create-role]').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
    });
  });

  // Валюты
  document.querySelectorAll('[data-create-cur]').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.createCur === state.createForm.currency);
    btn.addEventListener('click', () => {
      state.createForm.currency = btn.dataset.createCur;
      document.querySelectorAll('[data-create-cur]').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      updateCurrencySuffix();
      validateCreateAmount();
    });
  });

  // Поле суммы
  const amountInput = document.getElementById('createAmount');
  if (amountInput) {
    amountInput.value = '';
    amountInput.removeAttribute('disabled');
    amountInput.addEventListener('input', () => {
      state.createForm.amount = amountInput.value;
      validateCreateAmount();
    });
  }

  // Поле описания
  const descInput = document.getElementById('createDesc');
  if (descInput) {
    descInput.value = '';
    descInput.removeAttribute('disabled');
    descInput.addEventListener('input', () => {
      state.createForm.description = descInput.value.slice(0, 120);
      descInput.value = state.createForm.description;
      const hint = document.getElementById('descHint');
      if (hint) hint.textContent = `${state.createForm.description.length}/120 ${tr('chars')}`;
    });
  }

  updateCurrencySuffix();

  // Кнопка создать
  const createBtn = document.getElementById('createDealBtn');
  if (createBtn) {
    createBtn.onclick = handleCreateDeal;
  }
}

function updateCurrencySuffix() {
  const suffix = document.getElementById('amountSuffix');
  if (suffix) suffix.textContent = CURRENCIES[state.createForm.currency]?.symbol || '';
}

function validateCreateAmount() {
  const val = parseFloat(state.createForm.amount);
  const min = CURRENCIES[state.createForm.currency]?.min || 0;
  const err = document.getElementById('amountError');
  if (err) {
    if (!state.createForm.amount) { err.textContent = ''; return; }
    if (isNaN(val) || val <= 0) {
      err.textContent = tr('amount_invalid');
    } else if (val < min) {
      err.textContent = `${tr('minimum')}: ${min} ${CURRENCIES[state.createForm.currency]?.symbol}`;
    } else {
      err.textContent = '';
    }
  }
}

async function handleCreateDeal() {
  const amount = parseFloat(state.createForm.amount);
  const min = CURRENCIES[state.createForm.currency]?.min || 0;
  const desc = state.createForm.description.trim();

  if (!amount || isNaN(amount) || amount < min) {
    showToast(`${tr('minimum_amount')}: ${min} ${CURRENCIES[state.createForm.currency]?.symbol}`);
    return;
  }
  if (!desc) {
    showToast(tr('enter_deal_desc'));
    return;
  }
  if (!INIT_DATA) {
    showToast(tr('telegram_required'));
    return;
  }

  const createBtn = document.getElementById('createDealBtn');
  if (createBtn) createBtn.disabled = true;
  try {
    const deal = await apiRequest('/api/deals', {
      method: 'POST',
      body: JSON.stringify({
        role: state.createForm.role,
        currency: state.createForm.currency,
        amount,
        description: desc,
      }),
    });
    upsertDeal(deal);
    showToast(tr('deal_created_toast'));
    navigate('deals-detail');
  } catch (e) {
    console.warn('[Create deal] failed:', e.message);
    showToast(tr('deal_create_error'));
  } finally {
    if (createBtn) createBtn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// РАЗДЕЛ: МОИ СДЕЛКИ
// ═══════════════════════════════════════════════════════════════════════════
function renderMyDeals() {
  const uid = TG_USER.id || 0;
  const allMine = DEALS_DB.filter(d => d.creator_id === uid || d.respondent_id === uid)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const filterMap = {
    active: d => ['active', 'pending', 'paid', 'awaiting_buyer', 'dispute'].includes(d.status),
    completed: d => d.status === 'completed',
    all: () => true,
  };

  const filtered = allMine.filter(filterMap[state.myDealsFilter] || filterMap.all);

  // Обновляем счётчики на сегментах
  document.querySelectorAll('[data-deals-filter]').forEach(btn => {
    const f = btn.dataset.dealsFilter;
    const count = allMine.filter(filterMap[f] || filterMap.all).length;
    const base = { active: tr('filter_active'), completed: tr('filter_done'), all: tr('filter_all') }[f] || f;
    btn.textContent = `${base}${count ? ` (${count})` : ''}`;
    btn.classList.toggle('is-active', f === state.myDealsFilter);
    btn.onclick = () => {
      state.myDealsFilter = f;
      renderMyDeals();
    };
  });

  const list = document.getElementById('myDealsList');
  if (!list) return;

  if (filtered.length === 0) {
    list.innerHTML = `<p class="empty-hint">${tr('empty_section')}</p>`;
    return;
  }

  list.innerHTML = filtered.map(d => makeTicket(d, 'deals-detail')).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// РАЗДЕЛ: ПОИСК СДЕЛКИ
// ═══════════════════════════════════════════════════════════════════════════
function initSearch() {
  state.searchResult = null;
  const input = document.getElementById('searchInput');
  const resultBox = document.getElementById('searchResult');
  const searchBtn = document.getElementById('searchBtn');

  if (input) {
    input.value = '';
    input.removeAttribute('disabled');
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') doSearch();
    });
  }
  if (resultBox) resultBox.innerHTML = '';

  if (searchBtn) searchBtn.onclick = doSearch;
}

async function doSearch() {
  const input = document.getElementById('searchInput');
  const resultBox = document.getElementById('searchResult');
  if (!input || !resultBox) return;

  const query = input.value.trim().replace(/^OTC-/i, '').replace(/^#/, '');
  if (!query) { showToast(tr('enter_deal_id')); return; }

  const uid = TG_USER.id || 0;

  // 1. Ищем локально
  let deal = DEALS_DB.find(d => d.deal_id === query);

  // 2. Если не нашли локально — пробуем API
  if (!deal && API_BASE_URL) {
    try {
      resultBox.innerHTML = `<p class="empty-hint">${tr('searching')}</p>`;
      const res = await fetch(`${API_BASE_URL}/api/deal/${query}`);
      if (res.ok) {
        deal = await res.json();
        // Добавляем в локальный кэш
        if (!DEALS_DB.find(d => d.deal_id === deal.deal_id)) {
          upsertDeal(deal);
        }
      }
    } catch (e) {
      console.warn('[Search] API недоступен:', e.message);
    }
  }

  if (!deal) {
    resultBox.innerHTML = `<p class="empty-hint">${tr('deal_not_found')}</p>`;
    return;
  }

  // Проверяем доступ — только участники сделки
  const isParticipant = deal.creator_id === uid || deal.respondent_id === uid;
  if (!isParticipant) {
    // Можно присоединиться к pending сделке
    if (deal.status === 'pending') {
      resultBox.innerHTML = makeTicket(deal, 'deals-detail') + `
        <div class="field-hint" style="text-align:center;margin-top:8px">${tr('can_join_deal')}</div>`;
      state.currentDeal = deal;
      state.searchIsJoin = true;
    } else {
      resultBox.innerHTML = `<p class="empty-hint">${tr('deal_no_access')}</p>`;
      return;
    }
  } else {
    state.currentDeal = deal;
    state.searchIsJoin = false;
    resultBox.innerHTML = makeTicket(deal, 'deals-detail');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// РАЗДЕЛ: ДЕТАЛЬНАЯ СТРАНИЦА СДЕЛКИ
// ═══════════════════════════════════════════════════════════════════════════
function renderDealDetail() {
  const deal = state.currentDeal;
  const detailEl = document.querySelector('[data-screen="deals-detail"]');
  if (!deal || !detailEl) return;

  const uid = TG_USER.id || 0;
  const role = getUserRole(deal);
  const partner = getPartnerUsername(deal);
  const isCreator = deal.creator_id === uid;
  const isParticipant = isCreator || deal.respondent_id === uid;
  const isJoin = !isParticipant && state.searchIsJoin;

  const commAmt = (deal.amount * COMMISSION).toFixed(2);
  const netAmt = (deal.amount - deal.amount * COMMISSION).toFixed(2);
  const partnerLabel = role === 'seller' ? tr('buyer_label') : tr('seller_label');

  detailEl.innerHTML = `
    <div class="detail-card">
      <div class="detail-card__head">
        <span class="ticket__id ticket__id--lg">OTC-${escapeHTML(deal.deal_id)}</span>
        ${makeStatusPill(deal.status)}
      </div>
      <div class="detail-card__divider"></div>

      ${isParticipant ? `
      <div class="detail-row">
        <span class="detail-row__label">${tr('your_role_detail')}</span>
        <span class="detail-row__value">${roleLabel(role)}</span>
      </div>` : ''}

      ${partner ? `
      <div class="detail-row">
        <span class="detail-row__label">${partnerLabel}</span>
        <span class="detail-row__value">@${escapeHTML(partner)}</span>
      </div>` : (deal.status === 'pending' ? `
      <div class="detail-row">
        <span class="detail-row__label">${partnerLabel}</span>
        <span class="detail-row__value" style="color:var(--text-dim)">${tr('waiting_participant')}</span>
      </div>` : '')}

      <div class="detail-row">
        <span class="detail-row__label">${tr('description_label')}</span>
        <span class="detail-row__value">${escapeHTML(deal.description)}</span>
      </div>

      <div class="detail-row">
        <span class="detail-row__label">${tr('amount_label')}</span>
        <span class="detail-row__value detail-row__value--mono">${formatAmount(deal.amount, deal.currency)}</span>
      </div>

      <div class="detail-row">
        <span class="detail-row__label">${tr('commission_with_percent')}</span>
        <span class="detail-row__value detail-row__value--mono" style="color:var(--text-dim)">${commAmt} ${CURRENCIES[deal.currency]?.symbol}</span>
      </div>

      ${role === 'seller' ? `
      <div class="detail-row">
        <span class="detail-row__label">${tr('you_receive')}</span>
        <span class="detail-row__value detail-row__value--mono" style="color:var(--accent,#4ade80)">${netAmt} ${CURRENCIES[deal.currency]?.symbol}</span>
      </div>` : `
      <div class="detail-row">
        <span class="detail-row__label">${tr('to_pay')}</span>
        <span class="detail-row__value detail-row__value--mono">${formatAmount(deal.amount, deal.currency)}</span>
      </div>`}

      <div class="detail-card__divider"></div>

      <div class="detail-row">
        <span class="detail-row__label">${tr('created_at')}</span>
        <span class="detail-row__value" style="color:var(--text-dim)">${formatDate(deal.created_at)}</span>
      </div>

      ${getStatusNote(deal, role)}
    </div>

    ${getActionButtons(deal, role, isParticipant, isJoin)}
  `;

  bindDetailActions(deal, role, isParticipant, isJoin);
}

function getStatusNote(deal, role) {
  const notes = {
    pending: role === 'seller' ? tr('note_pending_seller') : tr('note_pending_buyer'),
    active: role === 'seller' ? tr('note_active_seller') : tr('note_active_buyer'),
    paid: tr('note_paid'),
    awaiting_buyer: tr('note_awaiting_buyer'),
    completed: tr('note_completed'),
    cancelled: tr('note_cancelled'),
    dispute: tr('note_dispute'),
  };
  const note = notes[deal.status] || '';
  return note ? `<p class="detail-note">${note}</p>` : '';
}

function getActionButtons(deal, role, isParticipant, isJoin) {
  if (isJoin) {
    return `<button class="btn btn--primary btn--block" id="detailAction1">${tr('join_deal_btn')}</button>`;
  }
  if (!isParticipant) return '';

  const uid = TG_USER.id || 0;
  let btns = '';

  switch (deal.status) {
    case 'pending':
      if (deal.creator_id === uid) {
        btns = `
          <button class="btn btn--primary btn--block" id="detailAction1">📋 ${tr('copy_deal_link')}</button>
          <button class="btn btn--ghost btn--block" id="detailAction2">${tr('cancel_deal')}</button>`;
      } else {
        btns = `<button class="btn btn--primary btn--block" id="detailAction1">${tr('join_deal_btn')}</button>`;
      }
      break;

    case 'active':
      if (role === 'buyer') {
        btns = `
          <button class="btn btn--primary btn--block" id="detailAction1">💸 ${tr('pay_deal')}</button>
          <button class="btn btn--ghost btn--block" id="detailAction2">${tr('open_dispute')}</button>`;
      } else {
        btns = `<button class="btn btn--ghost btn--block" id="detailAction2">${tr('open_dispute')}</button>`;
      }
      break;

    case 'paid':
      if (role === 'seller') {
        btns = `<button class="btn btn--primary btn--block" id="detailAction1">✅ ${tr('transfer_to_manager')}</button>`;
      }
      break;

    case 'awaiting_buyer':
      if (role === 'buyer') {
        btns = `
          <button class="btn btn--primary btn--block" id="detailAction1">✅ ${tr('confirm_received')}</button>
          <button class="btn btn--ghost btn--block" id="detailAction2">${tr('open_dispute')}</button>`;
      }
      break;
  }

  return btns;
}

function bindDetailActions(deal, role, isParticipant, isJoin) {
  const uid = TG_USER.id || 0;
  const btn1 = document.getElementById('detailAction1');
  const btn2 = document.getElementById('detailAction2');

  if (isJoin && btn1) {
    btn1.onclick = () => handleJoinDeal(deal);
    return;
  }

  if (!isParticipant) return;

  if (btn1) {
    switch (deal.status) {
      case 'pending':
        if (deal.creator_id === uid) {
          btn1.onclick = () => {
            const link = buildDealShareLink(deal.deal_id);
            if (navigator.clipboard) {
              navigator.clipboard.writeText(link).then(() => showToast(tr('link_copied_toast')));
            } else {
              showToast(link);
            }
          };
        } else {
          btn1.onclick = () => handleJoinDeal(deal);
        }
        break;
      case 'paid':
        if (role === 'seller') btn1.onclick = () => handleTransferToManager(deal);
        break;
      case 'awaiting_buyer':
        if (role === 'buyer') btn1.onclick = () => handleConfirmReceived(deal);
        break;
      case 'active':
        if (role === 'buyer') btn1.onclick = () => handlePayDeal(deal);
        break;
    }
  }

  if (btn2) {
    switch (deal.status) {
      case 'pending':
        btn2.onclick = () => handleCancelDeal(deal);
        break;
      case 'active':
      case 'awaiting_buyer':
        btn2.onclick = () => handleOpenDispute(deal);
        break;
    }
  }
}

// ── Действия со сделкой ────────────────────────────────────────────────────
async function performDealAction(deal, action, successKey) {
  if (!INIT_DATA) {
    showToast(tr('telegram_required'));
    return;
  }
  try {
    const updated = await apiRequest(`/api/deal/${deal.deal_id}/action`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    upsertDeal(updated);
    showToast(tr(successKey));
    renderDealDetail();
    renderDealsHome();
  } catch (e) {
    console.warn(`[Deal action] ${action} failed:`, e.message);
    showToast(tr('action_failed'));
  }
}

function handleJoinDeal(deal) {
  if (deal.respondent_id) { showToast(tr('deal_taken')); return; }
  performDealAction(deal, 'join_deal', 'joined_deal_toast');
}

function handleCancelDeal(deal) {
  confirmAction(tr('cancel_deal_question'), tr('cancel_deal_text'), () => {
    performDealAction(deal, 'cancel_deal', 'deal_cancelled_toast');
  });
}

function handlePayDeal(deal) {
  confirmAction(tr('confirm_payment_question'), `${tr('you_pay')} ${formatAmount(deal.amount, deal.currency)}`, () => {
    performDealAction(deal, 'pay_deal', 'payment_confirmed_toast');
  });
}

function handleTransferToManager(deal) {
  confirmAction(tr('transfer_question'), `${tr('contact_manager')} @${MANAGER}.`, () => {
    performDealAction(deal, 'transfer_to_manager', 'status_updated_toast');
  });
}

function handleConfirmReceived(deal) {
  confirmAction(tr('confirm_received_question'), tr('confirm_received_text'), () => {
    performDealAction(deal, 'confirm_deal', 'deal_completed_toast');
  });
}

function handleOpenDispute(deal) {
  confirmAction(tr('open_dispute_question'), `${tr('manager_will_review')} @${MANAGER}.`, () => {
    performDealAction(deal, 'open_dispute', 'dispute_opened_toast');
  });
}

// ── UI Утилиты ─────────────────────────────────────────────────────────────
function showToast(msg) {
  let t2 = document.getElementById('toast');
  if (!t2) {
    t2 = document.createElement('div');
    t2.id = 'toast';
    document.body.appendChild(t2);
  }
  t2.textContent = msg;
  t2.classList.add('toast--show');
  clearTimeout(t2._timer);
  t2._timer = setTimeout(() => t2.classList.remove('toast--show'), 2500);
}

function confirmAction(title, text, onConfirm) {
  let modal = document.getElementById('confirmModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'confirmModal';
    modal.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal-box">
          <div class="modal-title" id="modalTitle"></div>
          <div class="modal-text" id="modalText"></div>
          <div class="modal-actions">
            <button class="btn btn--ghost" id="modalCancel">Отмена</button>
            <button class="btn btn--primary" id="modalConfirm">Подтвердить</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalText').textContent = text;
  modal.style.display = 'flex';
  document.getElementById('modalCancel').textContent = tr('modal_cancel');
  document.getElementById('modalConfirm').textContent = tr('modal_confirm');
  document.getElementById('modalCancel').onclick = () => { modal.style.display = 'none'; };
  document.getElementById('modalOverlay').onclick = (e) => {
    if (e.target === document.getElementById('modalOverlay')) modal.style.display = 'none';
  };
  document.getElementById('modalConfirm').onclick = () => {
    modal.style.display = 'none';
    onConfirm();
  };
}

// ── init ────────────────────────────────────────────────────────────────────
// Initial render is done after API data and i18n are ready.

// ═══════════════════════════════════════════════════════════════════════════
// РАЗДЕЛ: РЕКВИЗИТЫ — полная логика (Этап 3)
// ═══════════════════════════════════════════════════════════════════════════

const WALLET_CONFIG = [
  {
    key: 'stars',
    label: '⭐ STARS',
    placeholder: '@username',
    hint: 'Telegram-username (например @yourname)',
    validate: validateStars,
    mono: false,
  },
  {
    key: 'ton',
    label: '💎 TON',
    placeholder: 'UQ...',
    hint: 'TON-адрес кошелька',
    validate: validateCryptoWallet,
    mono: true,
  },
  {
    key: 'usdt',
    label: '💵 USDT (TRC-20)',
    placeholder: 'T...',
    hint: 'USDT TRC-20 адрес',
    validate: validateCryptoWallet,
    mono: true,
  },
  {
    key: 'rub',
    label: '🇷🇺 RUB — номер карты',
    placeholder: '0000 0000 0000 0000',
    hint: '16 цифр номера карты',
    validate: validateCard,
    mono: true,
  },
  {
    key: 'uah',
    label: '🇺🇦 UAH — номер карты',
    placeholder: '0000 0000 0000 0000',
    hint: '16 цифр номера карты',
    validate: validateCard,
    mono: true,
  },
  {
    key: 'uzs',
    label: '🇺🇿 UZS — номер карты',
    placeholder: '0000 0000 0000 0000',
    hint: '16 цифр номера карты',
    validate: validateCard,
    mono: true,
  },
];

// ── Хранилище реквизитов ───────────────────────────────────────────────────
function walletLabel(cfg2) {
  return tr(`wallet_${cfg2.key}_label`) || cfg2.label;
}

function walletHint(cfg2) {
  return tr(`wallet_${cfg2.key}_hint`) || cfg2.hint;
}

function loadWallets() {
  const saved = localStorage.getItem('otc_wallets');
  if (saved) return JSON.parse(saved);
  return { stars: '', ton: '', usdt: '', rub: '', uah: '', uzs: '' };
}

function saveWallets(data) {
  localStorage.setItem('otc_wallets', JSON.stringify(data));
}

let WALLETS = loadWallets();

// ── Валидация ──────────────────────────────────────────────────────────────
function validateStars(val) {
  if (!val) return null; // пусто — ок (не обязательно)
  const clean = val.startsWith('@') ? val.slice(1) : val;
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(clean)) {
    return tr('err_username');
  }
  return null;
}

function validateCryptoWallet(val) {
  if (!val) return null;
  const clean = val.trim();
  if (clean.length < 4 || clean.length > 100) {
    return tr('err_wallet_len');
  }
  return null;
}

function validateCard(val) {
  if (!val) return null;
  const digits = val.replace(/\D/g, '');
  if (digits.length !== 16) return tr('err_card');
  return null;
}

function normalizeStars(val) {
  val = val.trim();
  if (val && !val.startsWith('@')) val = '@' + val;
  return val;
}

function formatCard(val) {
  const digits = val.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function maskWallet(val, key) {
  if (!val) return '—';
  if (key === 'stars') return val;
  if (key === 'rub' || key === 'uah' || key === 'uzs') {
    const digits = val.replace(/\D/g, '');
    if (digits.length >= 8) {
      return digits.slice(0, 4) + ' •••• ' + digits.slice(-4);
    }
    return val;
  }
  // crypto
  if (val.length > 10) return val.slice(0, 5) + '...' + val.slice(-4);
  return val;
}

// ── Рендер: просмотр реквизитов ────────────────────────────────────────────
function renderWalletsView() {
  WALLETS = loadWallets();
  const listEl = document.getElementById('walletViewList');
  if (!listEl) return;

  listEl.innerHTML = WALLET_CONFIG.map(cfg2 => {
    const val = WALLETS[cfg2.key];
    const display = val ? maskWallet(val, cfg2.key) : '—';
    const isMono = cfg2.mono && val;
    return `
      <div class="wallet-row" data-wkey="${cfg2.key}">
        <span class="wallet-row__cur">${walletLabel(cfg2)}</span>
        <span class="wallet-row__val ${isMono ? 'wallet-row__val--mono' : ''} ${!val ? 'wallet-row__val--empty' : ''}">
          ${display}
        </span>
      </div>`;
  }).join('');

  // Обновляем счётчик заполненных
  const filled = WALLET_CONFIG.filter(c => WALLETS[c.key]).length;
  const counterEl = document.getElementById('walletFillCounter');
  if (counterEl) {
    counterEl.textContent = filled === WALLET_CONFIG.length
      ? tr('wallets_all_filled')
      : `${tr('wallets_filled')} ${filled} / ${WALLET_CONFIG.length}`;
    counterEl.style.color = filled === WALLET_CONFIG.length ? '#4ade80' : 'var(--text-dim)';
  }
}

// ── Рендер: форма редактирования ───────────────────────────────────────────
function renderWalletsEdit() {
  WALLETS = loadWallets();
  const formEl = document.getElementById('walletEditForm');
  if (!formEl) return;

  formEl.innerHTML = WALLET_CONFIG.map(cfg2 => {
    const val = WALLETS[cfg2.key] || '';
    return `
      <div class="field-group">
        <div class="field-label">${walletLabel(cfg2)}</div>
        <input
          type="text"
          class="input ${cfg2.mono ? 'input--mono' : ''}"
          id="wInput_${cfg2.key}"
          value="${val}"
          placeholder="${cfg2.placeholder}"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
        >
        <div class="field-hint">${walletHint(cfg2)}</div>
        <div class="field-error" id="wErr_${cfg2.key}"></div>
      </div>`;
  }).join('');

  // Маска для карточных полей
  ['rub', 'uah', 'uzs'].forEach(key => {
    const inp = document.getElementById(`wInput_${key}`);
    if (!inp) return;
    inp.addEventListener('input', () => {
      const pos = inp.selectionStart;
      const raw = inp.value.replace(/\D/g, '').slice(0, 16);
      const formatted = raw.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
      inp.value = formatted;
    });
  });

  // Кнопка сохранить
  const saveBtn = document.getElementById('walletSaveBtn');
  if (saveBtn) saveBtn.onclick = handleWalletSave;
}

// ── Сохранение ─────────────────────────────────────────────────────────────
function handleWalletSave() {
  let hasError = false;
  const newWallets = {};

  WALLET_CONFIG.forEach(cfg2 => {
    const inp = document.getElementById(`wInput_${cfg2.key}`);
    const errEl = document.getElementById(`wErr_${cfg2.key}`);
    if (!inp) return;

    let val = inp.value.trim();

    // Нормализация
    if (cfg2.key === 'stars' && val) val = normalizeStars(val);
    if (['rub', 'uah', 'uzs'].includes(cfg2.key) && val) {
      val = val.replace(/\s/g, ''); // убираем пробелы — храним цифрами
    }

    const err = cfg2.validate(val);
    if (err) {
      if (errEl) { errEl.textContent = err; }
      hasError = true;
    } else {
      if (errEl) errEl.textContent = '';
      newWallets[cfg2.key] = val;
    }
  });

  if (hasError) {
    showToast(tr('fix_form_errors'));
    // Скролл к первой ошибке
    const firstErr = document.querySelector('.field-error:not(:empty)');
    if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  WALLETS = newWallets;
  saveWallets(WALLETS);

  saveWalletsToServer(WALLETS);

  showToast(tr('wallets_saved_toast'));
  setTimeout(() => {
    goBack();
    renderWalletsView();
  }, 500);
}


// ── Патч навигации для реквизитов ─────────────────────────────────────────
// Сохраняем исходный renderScreen и добавляем вызовы wallet-разделов
const _rsOrig = renderScreen;
renderScreen = function (name) {
  _rsOrig(name);
  if (name === 'wallets') renderWalletsView();
  if (name === 'wallets-edit') renderWalletsEdit();
};
// Также патчим navigate (stage2 вызывает renderScreen внутри себя)
const _navOrig = navigate;
navigate = function (name, opts) {
  if (!SCREENS[name]) return;
  if (opts && opts.reset) historyStack = [name];
  else historyStack.push(name);
  renderScreen(name);
};

// ═══════════════════════════════════════════════════════════════════════════
// РАЗДЕЛ: ПРОФИЛЬ — полная логика (Этап 4)
// ═══════════════════════════════════════════════════════════════════════════

// ── Хранилище данных профиля ────────────────────────────────────────────────
function loadProfileData() {
  const saved = localStorage.getItem('otc_profile');
  if (saved) return JSON.parse(saved);
  // Демо-данные (в реальном проекте приходят от бота через initData)
  return {
    user_id: TG_USER.id || 0,
    first_name: TG_USER.first_name || 'Demo',
    username: TG_USER.username || 'demo_user',
    photo_url: TG_USER.photo_url || null,
    register_date: new Date(Date.now() - 120 * 24 * 3600000).toISOString(), // ~4 мес назад
    deals_count: 0,
    ref_count: 0,
    ref_earned_ton: 0,
    ref_earned_usdt: 0,
    referrer_id: null,
  };
}

function saveProfileData(data) {
  localStorage.setItem('otc_profile', JSON.stringify(data));
}

let PROFILE = loadProfileData();

// ── Утилиты профиля ─────────────────────────────────────────────────────────
function formatRegDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const monthsRu = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  const monthsEn = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  if (APP_LANG === 'en') return `${monthsEn[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return `${d.getDate()} ${monthsRu[d.getMonth()]} ${d.getFullYear()}`;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function countCompletedDeals() {
  const uid = TG_USER.id || 0;
  return DEALS_DB.filter(d =>
    d.status === 'completed' &&
    (d.creator_id === uid || d.respondent_id === uid)
  ).length;
}

function buildRefLink(userId) {
  // Реферальная ссылка ведёт через бота (deeplink), бот регистрирует реферала
  return `${BOT_URL}?start=ref_${userId}`;
}

function buildDealShareLink(dealId) {
  return `${BOT_URL}?start=deal_${dealId}`;
}

function formatRefEarned(profile) {
  const parts = [];
  if (profile.ref_earned_ton > 0) parts.push(`${profile.ref_earned_ton.toFixed(2)} TON`);
  if (profile.ref_earned_usdt > 0) parts.push(`${profile.ref_earned_usdt.toFixed(2)} USDT`);
  return parts.length ? parts.join(' + ') : '0 TON';
}

// ── Рендер профиля ──────────────────────────────────────────────────────────
function renderProfile() {
  PROFILE = loadProfileData();
  const completedDeals = PROFILE.deals_count ?? countCompletedDeals();
  const refLink = buildRefLink(PROFILE.user_id);
  const displayName = PROFILE.first_name || tr('user_fallback');
  const displayUsername = PROFILE.username ? `@${PROFILE.username}` : '';
  const initials = getInitials(displayName);

  // ── Аватар ────────────────────────────────────────────────────────────────
  const avatarEl = document.getElementById('profileAvatar');
  if (avatarEl) {
    if (PROFILE.photo_url) {
      avatarEl.innerHTML = `<img src="${PROFILE.photo_url}" alt="avatar" style="
        width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
      avatarEl.style.background = 'transparent';
    } else {
      avatarEl.textContent = initials;
      avatarEl.style.background = '';
    }
  }

  // ── Имя и username ────────────────────────────────────────────────────────
  const nameEl = document.getElementById('profileName');
  if (nameEl) nameEl.textContent = displayName;

  const unameEl = document.getElementById('profileUsername');
  if (unameEl) unameEl.textContent = displayUsername;

  // ── Статистика: сделки ────────────────────────────────────────────────────
  const dealsCountEl = document.getElementById('profileDealsCount');
  if (dealsCountEl) dealsCountEl.textContent = completedDeals;

  // ── Статистика: дата регистрации ──────────────────────────────────────────
  const regDateEl = document.getElementById('profileRegDate');
  if (regDateEl) regDateEl.textContent = formatRegDate(PROFILE.register_date);

  // ── Реферальная ссылка ────────────────────────────────────────────────────
  const refLinkEl = document.getElementById('profileRefLink');
  if (refLinkEl) refLinkEl.textContent = refLink.replace('https://', '');

  // ── Счётчики рефералов ────────────────────────────────────────────────────
  const refCountEl = document.getElementById('profileRefCount');
  if (refCountEl) refCountEl.textContent = `${PROFILE.ref_count} ${tr('people_short')}`;

  const refEarnedEl = document.getElementById('profileRefEarned');
  if (refEarnedEl) refEarnedEl.textContent = formatRefEarned(PROFILE);

  // ── Кнопка копировать реф-ссылку ─────────────────────────────────────────
  const copyBtn = document.getElementById('profileRefCopyBtn');
  if (copyBtn) {
    copyBtn.onclick = () => {
      const fullLink = refLink;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(fullLink)
          .then(() => {
            showToast(tr('link_copied_toast'));
            copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none">
              <path d="M5 12L10 17L19 7" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round"/></svg>`;
            setTimeout(() => {
              copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none">
                <rect x="9" y="9" width="11" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M5 15V5.5C5 4.7 5.7 4 6.5 4H15" stroke="currentColor" stroke-width="1.5"/></svg>`;
            }, 1500);
          })
          .catch(() => showToast(fullLink));
      } else {
        showToast(fullLink);
      }
    };
  }

  // ── Кнопка «Поделиться» ────────────────────────────────────────────────────
  const shareBtn = document.getElementById('profileRefShareBtn');
  if (shareBtn) {
    shareBtn.onclick = () => {
      const text = `${tr('share_ref_text')} ${refLink}`;
      if (tg?.shareToChat) {
        tg.shareToChat(text);
      } else if (navigator.share) {
        navigator.share({ text }).catch(() => { });
      } else {
        // Fallback: открыть Telegram share
        const encoded = encodeURIComponent(text);
        window.open(`https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encoded}`, '_blank');
      }
    };
  }

  // ── Уровень пользователя (бейдж) ─────────────────────────────────────────
  const levelEl = document.getElementById('profileLevel');
  if (levelEl) {
    const lvl = getUserLevel(completedDeals);
    levelEl.textContent = lvl.label;
    levelEl.style.background = lvl.bg;
    levelEl.style.color = lvl.color;
  }
}

function getUserLevel(deals) {
  if (deals >= 50) return { label: `🏆 ${tr('level_expert')}`, bg: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#000' };
  if (deals >= 20) return { label: `⭐ ${tr('level_pro')}`, bg: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff' };
  if (deals >= 5) return { label: `✅ ${tr('level_trusted')}`, bg: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff' };
  return { label: `🆕 ${tr('level_new')}`, bg: 'var(--surface-2)', color: 'var(--text-dim)' };
}

// ── Патч навигации для профиля ─────────────────────────────────────────────
const _rsStage4Orig = renderScreen;
renderScreen = function (name) {
  _rsStage4Orig(name);
  if (name === 'profile') renderProfile();
};
const _navStage4Orig = navigate;
navigate = function (name, opts) {
  if (!SCREENS[name]) return;
  if (opts && opts.reset) historyStack = [name];
  else historyStack.push(name);
  renderScreen(name);
};

// ═══════════════════════════════════════════════════════════════════════════
// РАЗДЕЛ: НАСТРОЙКИ — полная логика (Этап 5)
// + i18n (двуязычность RU/EN)
// + Финальная интеграция с Telegram Bot
// ═══════════════════════════════════════════════════════════════════════════

// ── Переводы ────────────────────────────────────────────────────────────────
const I18N = {
  ru: {
    // Tabbar
    tab_deals: 'Сделки',
    tab_wallets: 'Реквизиты',
    tab_profile: 'Профиль',
    tab_settings: 'Настройки',
    // Topbar titles
    screen_deals: 'Сделки',
    screen_deals_create: 'Создать сделку',
    screen_deals_my: 'Мои сделки',
    screen_deals_search: 'Найти сделку',
    screen_deals_detail: 'Сделка',
    screen_wallets: 'Реквизиты',
    screen_wallets_edit: 'Редактировать',
    screen_profile: 'Профиль',
    screen_settings: 'Настройки',
    screen_settings_lang: 'Язык интерфейса',
    screen_settings_support: 'Поддержка',
    // Settings
    lang_title: 'Язык интерфейса',
    lang_note: 'Язык также изменится в боте при следующем открытии.',
    support_title: 'Поддержка',
    support_sub: 'Связаться с менеджером',
    support_text: 'Если возникли вопросы по сделке, спору или выплате — менеджер ответит в течение 15 минут.',
    theme_title: 'Тема',
    theme_dark: 'Тёмная',
    theme_light: 'Светлая',
    about_text: 'Сервис безопасных сделок с подарками Telegram, NFT, токенами и фиатом. Комиссия — 1% от суммы сделки.',
    version_label: 'Версия',
    site_label: 'Сайт',
    manager_label: 'Менеджер',
    lang_ru: 'Русский',
    lang_en: 'English',
    current_lang: 'Русский',
    // Deals
    commission_label: 'Комиссия сервиса',
    create_deal: 'Создать сделку',
    create_deal_sub: 'Новая безопасная сделка',
    my_deals: 'Мои сделки',
    find_deal: 'Найти сделку',
    find_deal_sub: 'По номеру сделки',
    recent_deals: 'Последние сделки',
    no_deals: 'У вас пока нет сделок',
    your_role: 'Кто вы в сделке',
    role_seller: '👑 Продавец',
    role_buyer: '🛒 Покупатель',
    deal_currency: 'Валюта сделки',
    deal_amount: 'Сумма',
    deal_desc: 'Описание сделки',
    deal_desc_ph: 'Что вы продаёте? Если NFT — вставьте ссылку',
    create_btn: 'Создать сделку',
    filter_active: 'Активные',
    filter_done: 'Завершённые',
    filter_all: 'Все',
    deal_id_label: 'Номер сделки',
    deal_id_hint: 'Номер можно скопировать из сообщения собеседника',
    search_btn: 'Найти сделку',
    empty_section: 'Нет сделок в этом разделе',
    // Profile
    successful_deals: 'Успешных сделок',
    reg_date: 'Дата регистрации',
    ref_system: 'Реферальная система',
    ref_link_label: 'Ваша реферальная ссылка',
    share_link: '📤 Поделиться ссылкой',
    invited: 'Приглашено',
    earned: 'Заработано',
    ref_bonus: '💡 Вы получаете <strong>25%</strong> с комиссии каждой сделки вашего реферала',
    // Wallets
    wallets_header: 'Реквизиты',
    wallets_for: 'Для получения выплат по сделкам',
    edit_wallets: '✏️ Редактировать реквизиты',
    wallets_note: 'Реквизиты нужны продавцу — на них приходит оплата после завершения сделки.',
    wallets_edit_hint: 'Заполните только те реквизиты, которые используете. Пустые поля не сохраняются.',
    save_wallets: 'Сохранить реквизиты',
  },
  en: {
    tab_deals: 'Deals',
    tab_wallets: 'Wallets',
    tab_profile: 'Profile',
    tab_settings: 'Settings',
    screen_deals: 'Deals',
    screen_deals_create: 'Create Deal',
    screen_deals_my: 'My Deals',
    screen_deals_search: 'Find Deal',
    screen_deals_detail: 'Deal',
    screen_wallets: 'Wallets',
    screen_wallets_edit: 'Edit',
    screen_profile: 'Profile',
    screen_settings: 'Settings',
    screen_settings_lang: 'Language',
    screen_settings_support: 'Support',
    lang_title: 'Language',
    lang_note: 'Language will also change in the bot on next open.',
    support_title: 'Support',
    support_sub: 'Contact manager',
    support_text: 'If you have questions about a deal, dispute or payout — the manager will reply within 15 minutes.',
    theme_title: 'Theme',
    theme_dark: 'Dark',
    theme_light: 'Light',
    about_text: 'Secure deals with Telegram gifts, NFTs, tokens and fiat. Commission — 1% of the deal amount.',
    version_label: 'Version',
    site_label: 'Website',
    manager_label: 'Manager',
    lang_ru: 'Русский',
    lang_en: 'English',
    current_lang: 'English',
    commission_label: 'Service fee',
    create_deal: 'Create Deal',
    create_deal_sub: 'New secure deal',
    my_deals: 'My Deals',
    find_deal: 'Find Deal',
    find_deal_sub: 'By deal number',
    recent_deals: 'Recent deals',
    no_deals: 'You have no deals yet',
    your_role: 'Your role in the deal',
    role_seller: '👑 Seller',
    role_buyer: '🛒 Buyer',
    deal_currency: 'Deal currency',
    deal_amount: 'Amount',
    deal_desc: 'Deal description',
    deal_desc_ph: 'What are you selling? If NFT — paste the link',
    create_btn: 'Create Deal',
    filter_active: 'Active',
    filter_done: 'Completed',
    filter_all: 'All',
    deal_id_label: 'Deal number',
    deal_id_hint: 'You can copy the number from your counterpart\'s message',
    search_btn: 'Find Deal',
    empty_section: 'No deals in this section',
    successful_deals: 'Successful deals',
    reg_date: 'Registration date',
    ref_system: 'Referral system',
    ref_link_label: 'Your referral link',
    share_link: '📤 Share link',
    invited: 'Invited',
    earned: 'Earned',
    ref_bonus: '💡 You earn <strong>25%</strong> of the commission from every deal your referral makes',
    wallets_header: 'Wallets',
    wallets_for: 'For receiving deal payouts',
    edit_wallets: '✏️ Edit wallets',
    wallets_note: 'Wallets are needed by the seller — payouts arrive here after deal completion.',
    wallets_edit_hint: 'Fill only the wallets you use. Empty fields are not saved.',
    save_wallets: 'Save wallets',
  }
};


Object.assign(I18N.ru, {
  loading: 'Загрузка…',
  active_short: 'активных',
  completed_short: 'завершено',
  chars: 'символов',
  amount_invalid: 'Введите корректную сумму',
  minimum: 'Минимум',
  minimum_amount: 'Минимальная сумма',
  enter_deal_desc: 'Введите описание сделки',
  telegram_required: 'Откройте MiniApp через Telegram, чтобы выполнить действие',
  deal_created_toast: '✅ Сделка создана в базе',
  deal_create_error: 'Не удалось создать сделку',
  enter_deal_id: 'Введите номер сделки',
  searching: 'Поиск…',
  deal_not_found: 'Сделка не найдена',
  deal_no_access: 'У вас нет доступа к этой сделке',
  can_join_deal: 'Вы можете присоединиться к этой сделке',
  buyer_label: 'Покупатель',
  seller_label: 'Продавец',
  waiting_label: 'ожидает',
  your_role_detail: 'Ваша роль',
  waiting_participant: 'Ожидает участника',
  description_label: 'Описание',
  amount_label: 'Сумма',
  commission_with_percent: 'Комиссия (1%)',
  you_receive: 'Вы получите',
  to_pay: 'К оплате',
  created_at: 'Создана',
  note_pending_seller: 'Поделитесь ссылкой на сделку с покупателем. Ждите, пока он присоединится.',
  note_pending_buyer: 'Поделитесь ссылкой на сделку с продавцом. Ждите, пока он присоединится.',
  note_active_seller: 'Ожидайте оплаты от покупателя. После подтверждения передайте товар менеджеру.',
  note_active_buyer: `Оплатите сделку и сообщите менеджеру @${MANAGER}. Продавец передаст товар.`,
  note_paid: 'Оплата получена. Ожидайте подтверждения менеджера.',
  note_awaiting_buyer: 'Продавец передал товар менеджеру. Подтвердите получение.',
  note_completed: '✅ Сделка успешно завершена.',
  note_cancelled: '⚫ Сделка отменена.',
  note_dispute: `🔴 Открыт спор. Менеджер @${MANAGER} разберётся в ситуации.`,
  join_deal_btn: 'Присоединиться к сделке',
  copy_deal_link: 'Скопировать ссылку на сделку',
  cancel_deal: 'Отменить сделку',
  pay_deal: 'Оплатить сделку',
  open_dispute: 'Открыть спор',
  transfer_to_manager: 'Передал(а) товар менеджеру',
  confirm_received: 'Подтвердить получение',
  deal_taken: 'Сделка уже занята',
  joined_deal_toast: '✅ Вы присоединились к сделке',
  deal_cancelled_toast: 'Сделка отменена',
  payment_confirmed_toast: '✅ Оплата подтверждена',
  status_updated_toast: '✅ Статус обновлён',
  deal_completed_toast: '🎉 Сделка завершена',
  dispute_opened_toast: '🔴 Спор открыт',
  action_failed: 'Не удалось выполнить действие',
  cancel_deal_question: 'Отменить сделку?',
  cancel_deal_text: 'Сделка будет отменена без возврата.',
  confirm_payment_question: 'Подтвердить оплату?',
  you_pay: 'Вы оплачиваете',
  transfer_question: 'Передали товар менеджеру?',
  contact_manager: 'Свяжитесь с',
  confirm_received_question: 'Подтвердить получение?',
  confirm_received_text: 'Вы подтверждаете, что получили товар.',
  open_dispute_question: 'Открыть спор?',
  manager_will_review: 'Ситуацию рассмотрит менеджер',
  modal_cancel: 'Отмена',
  modal_confirm: 'Подтвердить',
  err_username: 'Введите корректный Telegram username (мин. 5 символов)',
  err_wallet_len: 'Адрес должен быть от 4 до 100 символов',
  err_card: 'Введите 16 цифр номера карты',
  fix_form_errors: 'Исправьте ошибки в форме',
  wallets_saved_toast: '✅ Реквизиты сохранены',
  user_fallback: 'Пользователь',
  people_short: 'чел.',
  level_expert: 'Эксперт',
  level_pro: 'Про',
  level_trusted: 'Надёжный',
  level_new: 'Новичок',
  link_copied_toast: '✅ Ссылка скопирована',
  share_ref_text: '🔒 Безопасные сделки с Telegram-подарками, TON и USDT\n\nПрисоединяйся:',
});

Object.assign(I18N.en, {
  loading: 'Loading…',
  active_short: 'active',
  completed_short: 'completed',
  chars: 'characters',
  amount_invalid: 'Enter a valid amount',
  minimum: 'Minimum',
  minimum_amount: 'Minimum amount',
  enter_deal_desc: 'Enter deal description',
  telegram_required: 'Open the MiniApp through Telegram to perform this action',
  deal_created_toast: '✅ Deal created in the database',
  deal_create_error: 'Could not create the deal',
  enter_deal_id: 'Enter deal number',
  searching: 'Searching…',
  deal_not_found: 'Deal not found',
  deal_no_access: 'You do not have access to this deal',
  can_join_deal: 'You can join this deal',
  buyer_label: 'Buyer',
  seller_label: 'Seller',
  waiting_label: 'waiting',
  your_role_detail: 'Your role',
  waiting_participant: 'Waiting for participant',
  description_label: 'Description',
  amount_label: 'Amount',
  commission_with_percent: 'Commission (1%)',
  you_receive: 'You receive',
  to_pay: 'To pay',
  created_at: 'Created',
  note_pending_seller: 'Share the deal link with the buyer. Wait until they join.',
  note_pending_buyer: 'Share the deal link with the seller. Wait until they join.',
  note_active_seller: 'Wait for the buyer to pay. After confirmation, transfer the item to the manager.',
  note_active_buyer: `Pay for the deal and message manager @${MANAGER}. The seller will transfer the item.`,
  note_paid: 'Payment received. Wait for manager confirmation.',
  note_awaiting_buyer: 'The seller transferred the item to the manager. Confirm receipt.',
  note_completed: '✅ Deal completed successfully.',
  note_cancelled: '⚫ Deal cancelled.',
  note_dispute: `🔴 A dispute is open. Manager @${MANAGER} will review it.`,
  join_deal_btn: 'Join deal',
  copy_deal_link: 'Copy deal link',
  cancel_deal: 'Cancel deal',
  pay_deal: 'Pay deal',
  open_dispute: 'Open dispute',
  transfer_to_manager: 'Transferred item to manager',
  confirm_received: 'Confirm receipt',
  deal_taken: 'Deal is already taken',
  joined_deal_toast: '✅ You joined the deal',
  deal_cancelled_toast: 'Deal cancelled',
  payment_confirmed_toast: '✅ Payment confirmed',
  status_updated_toast: '✅ Status updated',
  deal_completed_toast: '🎉 Deal completed',
  dispute_opened_toast: '🔴 Dispute opened',
  action_failed: 'Could not perform action',
  cancel_deal_question: 'Cancel deal?',
  cancel_deal_text: 'The deal will be cancelled.',
  confirm_payment_question: 'Confirm payment?',
  you_pay: 'You pay',
  transfer_question: 'Transferred the item to the manager?',
  contact_manager: 'Contact',
  confirm_received_question: 'Confirm receipt?',
  confirm_received_text: 'You confirm that you received the item.',
  open_dispute_question: 'Open dispute?',
  manager_will_review: 'The manager will review the situation',
  modal_cancel: 'Cancel',
  modal_confirm: 'Confirm',
  err_username: 'Enter a valid Telegram username (min. 5 characters)',
  err_wallet_len: 'Address must be 4 to 100 characters',
  err_card: 'Enter the 16 card digits',
  fix_form_errors: 'Fix the form errors',
  wallets_saved_toast: '✅ Wallets saved',
  user_fallback: 'User',
  people_short: 'people',
  level_expert: 'Expert',
  level_pro: 'Pro',
  level_trusted: 'Trusted',
  level_new: 'New',
  link_copied_toast: '✅ Link copied',
  share_ref_text: '🔒 Secure deals with Telegram gifts, TON and USDT\n\nJoin:',
  wallets_all_filled: 'All wallets are filled ✓',
  wallets_filled: 'Filled',
  wallet_stars_label: '⭐ STARS',
  wallet_ton_label: '💎 TON',
  wallet_usdt_label: '💵 USDT (TRC-20)',
  wallet_rub_label: '🇷🇺 RUB — card number',
  wallet_uah_label: '🇺🇦 UAH — card number',
  wallet_uzs_label: '🇺🇿 UZS — card number',
  wallet_stars_hint: 'Telegram username, for example @yourname',
  wallet_ton_hint: 'TON wallet address',
  wallet_usdt_hint: 'USDT TRC-20 address',
  wallet_rub_hint: '16 card digits',
  wallet_uah_hint: '16 card digits',
  wallet_uzs_hint: '16 card digits',
});

// ── Текущий язык ────────────────────────────────────────────────────────────
let APP_LANG = localStorage.getItem('otc_lang') || 'ru';

function tr(key) {
  return (I18N[APP_LANG] || I18N.ru)[key] || key;
}

function setLang(lang) {
  APP_LANG = lang;
  localStorage.setItem('otc_lang', lang);
  applyI18n();
  saveLanguageToServer(lang);
}

function applyI18n() {

  const textMap = [
    ['.hero-strip__label', 'commission_label'],
    ['[data-nav="deals-create"] .action-card__title', 'create_deal'],
    ['[data-nav="deals-create"] .action-card__sub', 'create_deal_sub'],
    ['[data-nav="deals-my"] .action-card__title', 'my_deals'],
    ['[data-nav="deals-search"] .action-card__title', 'find_deal'],
    ['[data-nav="deals-search"] .action-card__sub', 'find_deal_sub'],
    ['[data-screen="deals"] .section-label', 'recent_deals'],
    ['[data-screen="deals-create"] .field-group:nth-of-type(1) .field-label', 'your_role'],
    ['[data-create-role="seller"]', 'role_seller'],
    ['[data-create-role="buyer"]', 'role_buyer'],
    ['[data-screen="deals-create"] .field-group:nth-of-type(2) .field-label', 'deal_currency'],
    ['[data-screen="deals-create"] .field-group:nth-of-type(3) .field-label', 'deal_amount'],
    ['[data-screen="deals-create"] .field-group:nth-of-type(4) .field-label', 'deal_desc'],
    ['#createDealBtn', 'create_btn'],
    ['[data-screen="deals-search"] .field-label', 'deal_id_label'],
    ['[data-screen="deals-search"] .field-hint', 'deal_id_hint'],
    ['#searchBtn', 'search_btn'],
    ['.wallet-header-card__title', 'wallets_header'],
    ['[data-screen="wallets"] .section-label', 'wallets_for'],
    ['[data-nav="wallets-edit"]', 'edit_wallets'],
    ['[data-screen="wallets"] .wallet-note', 'wallets_note'],
    ['.wallet-edit-hint', 'wallets_edit_hint'],
    ['#walletSaveBtn', 'save_wallets'],
    ['#profileLevel', 'level_new'],
    ['.stat-card:nth-child(1) .stat-card__label', 'successful_deals'],
    ['.stat-card:nth-child(2) .stat-card__label', 'reg_date'],
    ['[data-screen="profile"] .section-label', 'ref_system'],
    ['.ref-card__label', 'ref_link_label'],
    ['#profileRefShareBtn', 'share_link'],
    ['.ref-card .detail-row:nth-of-type(1) .detail-row__label', 'invited'],
    ['.ref-card .detail-row:nth-of-type(2) .detail-row__label', 'earned'],
    ['.ref-bonus-note', 'ref_bonus'],
  ];
  textMap.forEach(([selector, key]) => {
    const el = document.querySelector(selector);
    if (!el) return;
    const val = tr(key);
    if (val.includes('<strong>')) el.innerHTML = val;
    else el.textContent = val;
  });
  const desc = document.getElementById('createDesc');
  if (desc) desc.placeholder = tr('deal_desc_ph');
  document.documentElement.lang = APP_LANG;
  // Обновляем все [data-i18n] элементы
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const val = tr(key);
    if (val.includes('<strong>')) {
      el.innerHTML = val;
    } else {
      el.textContent = val;
    }
  });
  // Tabbar
  const tabLabels = {
    deals: tr('tab_deals'),
    wallets: tr('tab_wallets'),
    profile: tr('tab_profile'),
    settings: tr('tab_settings'),
  };
  document.querySelectorAll('.tab').forEach(t2 => {
    const span = t2.querySelector('span');
    if (span && tabLabels[t2.dataset.tab]) span.textContent = tabLabels[t2.dataset.tab];
  });
  // Текущий язык в настройках
  const langLabel = document.getElementById('currentLangLabel');
  if (langLabel) langLabel.textContent = tr('current_lang');
  // Тема
  const themeLabel = document.getElementById('currentThemeLabel');
  if (themeLabel) {
    const isDark = !document.documentElement.classList.contains('light');
    themeLabel.textContent = isDark ? tr('theme_dark') : tr('theme_light');
  }
  // Обновляем заголовок экрана
  const curScreen = historyStack[historyStack.length - 1];
  if (curScreen) {
    const screenKey = 'screen_' + curScreen.replace(/-/g, '_');
    titleEl.textContent = tr(screenKey) || SCREENS[curScreen]?.title || '';
  }
}

// ── Рендер настроек ─────────────────────────────────────────────────────────
function renderSettings() {
  applyI18n();
  // Тема — клик
  const themeRow = document.getElementById('settingsThemeRow');
  if (themeRow) {
    themeRow.onclick = () => {
      const isLight = document.documentElement.classList.contains('light');
      applyTheme(isLight ? 'dark' : 'light');
      applyI18n();
    };
  }
}

// ── Рендер выбора языка ─────────────────────────────────────────────────────
function renderLangScreen() {
  ['ru', 'en'].forEach(lang => {
    const btn = document.querySelector(`[data-lang="${lang}"]`);
    const check = document.getElementById(`check${lang.charAt(0).toUpperCase() + lang.slice(1)}`);
    if (!btn) return;
    btn.classList.toggle('is-active', lang === APP_LANG);
    if (check) check.textContent = lang === APP_LANG ? '✓' : '';
    btn.onclick = () => {
      setLang(lang);
      document.querySelectorAll('[data-lang]').forEach(b => {
        b.classList.remove('is-active');
        const c = document.getElementById(`check${b.dataset.lang.charAt(0).toUpperCase() + b.dataset.lang.slice(1)}`);
        if (c) c.textContent = '';
      });
      btn.classList.add('is-active');
      if (check) check.textContent = '✓';
      showToast(lang === 'ru' ? '✅ Язык изменён на Русский' : '✅ Language changed to English');
    };
  });
}

// ── Рендер поддержки ─────────────────────────────────────────────────────────
function renderSupportScreen() {
  const managerBtn = document.getElementById('supportManagerBtn');
  if (managerBtn) {
    managerBtn.textContent = `💬 ${tr('support_title')}: @${MANAGER}`;
    managerBtn.onclick = () => {
      if (tg) {
        tg.openTelegramLink(`https://t.me/${MANAGER}`);
      } else {
        window.open(`https://t.me/${MANAGER}`, '_blank');
      }
    };
  }
  const channelBtn = document.getElementById('supportChannelBtn');
  if (channelBtn) {
    channelBtn.onclick = () => {
      const channel = 'NotcoinOTC';
      if (tg) {
        tg.openTelegramLink(`https://t.me/${channel}`);
      } else {
        window.open(`https://t.me/${channel}`, '_blank');
      }
    };
  }
}

// ── Патч навигации для настроек ────────────────────────────────────────────
const _rsFinalOrig = renderScreen;
renderScreen = function (name) {
  _rsFinalOrig(name);
  if (name === 'settings') renderSettings();
  if (name === 'settings-lang') renderLangScreen();
  if (name === 'settings-support') renderSupportScreen();
};
const _navFinalOrig = navigate;
navigate = function (name, opts) {
  if (!SCREENS[name]) return;
  if (opts && opts.reset) historyStack = [name];
  else historyStack.push(name);
  renderScreen(name);
};

// ═══════════════════════════════════════════════════════════════════════════
// ФИНАЛЬНАЯ ИНТЕГРАЦИЯ С TELEGRAM BOT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Единая точка отправки данных боту.
 * В Telegram: tg.sendData(JSON)  — закрывает WebApp и отправляет боту.
 * Вне Telegram (dev): логируем в консоль.
 */
function sendToBot(payload) {
  if (tg) {
    tg.sendData(JSON.stringify(payload));
  } else {
    console.info('[BOT SEND]', payload);
  }
}

/**
 * Открыть ссылку через Telegram (openTelegramLink) или в браузере.
 */
function openLink(url) {
  if (tg) {
    tg.openLink(url);
  } else {
    window.open(url, '_blank');
  }
}

/**
 * Инициализация данных профиля из initData бота.
 * Бот передаёт данные пользователя через WebApp.initDataUnsafe.
 */
function initProfileFromTelegram() {
  const user = tg?.initDataUnsafe?.user;
  if (!user) return;

  // Обновляем PROFILE данными из Telegram
  PROFILE.user_id = user.id;
  PROFILE.first_name = user.first_name || '';
  PROFILE.username = user.username || '';
  PROFILE.photo_url = user.photo_url || null;
  saveProfileData(PROFILE);
}

/**
 * Синхронизация языка с ботом при старте.
 * Если бот передал язык через start_param или WebApp.initDataUnsafe — применяем.
 */
function syncLangFromBot() {
  // Bот может передать язык через URL: ?tgWebAppStartParam=lang_ru
  const startParam = tg?.initDataUnsafe?.start_param || '';
  if (startParam.startsWith('lang_')) {
    const botLang = startParam.replace('lang_', '');
    if (I18N[botLang]) {
      APP_LANG = botLang;
      localStorage.setItem('otc_lang', botLang);
    }
  }
  // Или через язык пользователя в TG
  const tgLang = tg?.initDataUnsafe?.user?.language_code;
  if (!localStorage.getItem('otc_lang') && tgLang) {
    APP_LANG = tgLang === 'ru' ? 'ru' : 'en';
    localStorage.setItem('otc_lang', APP_LANG);
  }
}

/**
 * Обработка start_param — открытие нужного экрана при запуске.
 * Например: ?tgWebAppStartParam=deal_4821  → открываем детали сделки.
 */
async function handleStartParam() {
  const startParam = tg?.initDataUnsafe?.start_param || '';
  if (!startParam) return;

  if (startParam.startsWith('deal_')) {
    const dealId = startParam.replace('deal_', '');
    let deal = DEALS_DB.find(d => d.deal_id === dealId);
    if (!deal) {
      try {
        deal = await apiRequest(`/api/deal/${dealId}`);
        upsertDeal(deal);
      } catch (e) {
        console.warn('[StartParam] deal load failed:', e.message);
      }
    }
    if (deal) {
      state.currentDeal = deal;
      setTimeout(() => navigate('deals-detail', { reset: true }), 100);
    }
  }
}

/**
 * Настройка кнопки Telegram MainButton (для key action).
 * Показываем/скрываем нативную кнопку TG в зависимости от контекста.
 */
function setupMainButton(text, onClick) {
  if (!tg?.MainButton) return;
  tg.MainButton.setText(text);
  tg.MainButton.onClick(onClick);
  tg.MainButton.show();
}

function hideMainButton() {
  tg?.MainButton?.hide();
}

// ═══════════════════════════════════════════════════════════════════════════
// ЗАГРУЗКА РЕАЛЬНЫХ ДАННЫХ С БОТА
// Бот должен поднять простой API (см. webapp_handler.py + api.py)
// URL: https://ssxzico.github.io/myminiapp/ → бот на том же VPS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Загружает реальные данные пользователя с API бота.
 * API должен быть запущен на сервере бота (см. api.py в инструкции).
 *
 * Если API недоступен — приложение работает на локальных данных (localStorage).
 * Это обеспечивает работу даже без сервера (демо-режим).
 *
 * НАСТРОЙКА: замени API_BASE_URL на адрес твоего сервера.
 */


function getApiBaseUrl() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('api');
  if (fromQuery) {
    localStorage.setItem('otc_api_base_url', fromQuery.replace(/\/$/, ''));
    return fromQuery.replace(/\/$/, '');
  }
  const configured = window.OTC_API_BASE_URL || localStorage.getItem('otc_api_base_url');
  if (configured) return configured.replace(/\/$/, '');
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:8000';
  if (window.location.protocol === 'file:') return 'http://localhost:8000';
  return window.location.origin;
}

/**
 * API_BASE_URL — адрес FastAPI сервера.
 * Автоматически определяется: если открыт через localhost — локальный сервер,
 * иначе — тот же origin (Nginx проксирует /api/ и /miniapp/ с VPS).
 */
const API_BASE_URL = getApiBaseUrl();


async function apiRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': INIT_DATA,
    ...(options.headers || {}),
  };
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

async function saveWalletsToServer(wallets) {
  if (!INIT_DATA || !TG_USER.id) return;
  try {
    const data = await apiRequest(`/api/user/${TG_USER.id}/wallets`, {
      method: 'POST',
      body: JSON.stringify({ wallets }),
    });
    if (data.wallets) {
      WALLETS = data.wallets;
      saveWallets(WALLETS);
    }
  } catch (e) {
    console.warn('[Wallets] API save failed:', e.message);
  }
}

async function saveLanguageToServer(lang) {
  if (!INIT_DATA || !TG_USER.id) return;
  try {
    await apiRequest(`/api/user/${TG_USER.id}/language`, {
      method: 'POST',
      body: JSON.stringify({ language: lang }),
    });
  } catch (e) {
    console.warn('[Language] API save failed:', e.message);
  }
}

async function loadRealUserData() {
  if (!API_BASE_URL) return; // API не настроен — работаем на демо-данных
  const userId = TG_USER.id;
  if (!userId || userId === 0) return;

  try {
    // Передаём initData боту для верификации пользователя
    const headers = {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': INIT_DATA,
    };

    const res = await fetch(`${API_BASE_URL}/api/user/${userId}`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // ── Обновляем профиль ──────────────────────────────────────────────────
    if (data.deals_count !== undefined) PROFILE.deals_count = data.deals_count;
    if (data.ref_count !== undefined) PROFILE.ref_count = data.ref_count;
    if (data.earned_from_referrals !== undefined) PROFILE.ref_earned_ton = data.earned_from_referrals;
    if (data.register_date) PROFILE.register_date = data.register_date;
    saveProfileData(PROFILE);

    // ── Обновляем сделки ───────────────────────────────────────────────────
    if (Array.isArray(data.deals)) {
      replaceDealsFromServer(data.deals);
    }
    LAST_API_OK = true;

    // ── Обновляем реквизиты ────────────────────────────────────────────────
    if (data.wallets) {
      WALLETS = { ...data.wallets };
      saveWallets(WALLETS);
    }

    // ── Язык из бота ──────────────────────────────────────────────────────
    if (data.language && I18N[data.language]) {
      APP_LANG = data.language;
      localStorage.setItem('otc_lang', APP_LANG);
    }

    console.info('[MiniApp] Данные пользователя загружены с сервера');
  } catch (e) {
    LAST_API_OK = false;
    replaceDealsFromServer([]);
    console.warn('[MiniApp] API недоступен:', e.message);
  }
}

// ── Инициализация при старте ────────────────────────────────────────────────
(async function init() {
  syncLangFromBot();
  initProfileFromTelegram();
  applyI18n();

  // Загружаем реальные данные с сервера (если API настроен)
  await loadRealUserData();

  // После загрузки данных — обновляем экран
  renderScreen(historyStack[historyStack.length - 1]);
  applyI18n();

  // Обрабатываем start_param (открытие нужного раздела/сделки из бота)
  await handleStartParam();
})();


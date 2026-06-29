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
const BOT_URL     = 'https://t.me/TestZicoBot';
const MINIAPP_URL = 'https://ssxzico.github.io/myminiapp/';
const MANAGER     = 'NotcoinxAdmin';
const COMMISSION  = 0.01; // 1%

const CURRENCIES = {
  stars: { label: '⭐ STARS', symbol: 'STARS', min: 50 },
  ton:   { label: '💎 TON',   symbol: 'TON',   min: 0.5 },
  usdt:  { label: '💵 USDT',  symbol: 'USDT',  min: 1 },
  rub:   { label: '🇷🇺 RUB',   symbol: 'RUB',   min: 100 },
  uah:   { label: '🇺🇦 UAH',   symbol: 'UAH',   min: 50 },
  uzs:   { label: '🇺🇿 UZS',   symbol: 'UZS',   min: 10000 },
};

const STATUS_LABELS = {
  pending:        { ru: 'Ожидает участника', cls: 'status-pill--wait' },
  active:         { ru: 'Активна',           cls: 'status-pill--active' },
  paid:           { ru: 'Оплачена',          cls: 'status-pill--wait' },
  awaiting_buyer: { ru: 'Ждёт подтверждения',cls: 'status-pill--wait' },
  completed:      { ru: 'Завершена',         cls: 'status-pill--done' },
  cancelled:      { ru: 'Отменена',          cls: 'status-pill--cancel' },
  dispute:        { ru: 'Спор',              cls: 'status-pill--dispute' },
};

// ── In-memory хранилище сделок (имитирует БД) ──────────────────────────────
// В реальном проекте данные приходят от бота через Telegram.sendData / initData
let DEALS_DB = JSON.parse(localStorage.getItem('otc_deals') || '[]');

function saveDealsToDB() {
  localStorage.setItem('otc_deals', JSON.stringify(DEALS_DB));
}

function genDealId() {
  return Math.floor(Math.random() * 9000 + 1000).toString();
}

// Начальные демо-сделки (только если БД пуста)
if (DEALS_DB.length === 0) {
  DEALS_DB = [
    {
      deal_id: '4821',
      creator_id: TG_USER.id || 1,
      respondent_id: 99,
      amount: 120,
      currency: 'ton',
      description: 'NFT-подарок «Plush Pepe»',
      status: 'active',
      creator_role: 'seller',
      created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
      respondent_username: 'nadira_k',
    },
    {
      deal_id: '4798',
      creator_id: TG_USER.id || 1,
      respondent_id: 88,
      amount: 340,
      currency: 'usdt',
      description: 'Перевод USDT за услугу',
      status: 'pending',
      creator_role: 'buyer',
      created_at: new Date(Date.now() - 48 * 3600000).toISOString(),
      respondent_username: 'javlon_x',
    },
    {
      deal_id: '4765',
      creator_id: TG_USER.id || 1,
      respondent_id: 77,
      amount: 58,
      currency: 'ton',
      description: 'Подарок «Astral Shard»',
      status: 'dispute',
      creator_role: 'seller',
      created_at: new Date(Date.now() - 5 * 24 * 3600000).toISOString(),
      respondent_username: 'milana_pro',
    },
    {
      deal_id: '4720',
      creator_id: TG_USER.id || 1,
      respondent_id: 55,
      amount: 5000,
      currency: 'rub',
      description: 'Обмен RUB на TON',
      status: 'completed',
      creator_role: 'seller',
      created_at: new Date(Date.now() - 10 * 24 * 3600000).toISOString(),
      respondent_username: 'user555',
    },
  ];
  saveDealsToDB();
}

// ── Утилиты ────────────────────────────────────────────────────────────────
function formatDate(iso) {
  const d = new Date(iso);
  const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  const h = d.getHours().toString().padStart(2,'0');
  const m = d.getMinutes().toString().padStart(2,'0');
  return `${d.getDate()} ${months[d.getMonth()]}, ${h}:${m}`;
}

function getUserRole(deal) {
  const uid = TG_USER.id || 1;
  if (deal.creator_id === uid) return deal.creator_role;
  return deal.creator_role === 'seller' ? 'buyer' : 'seller';
}

function getPartnerUsername(deal) {
  const uid = TG_USER.id || 1;
  if (deal.creator_id === uid) return deal.respondent_username || null;
  return deal.creator_username || null;
}

function roleLabel(role) {
  return role === 'seller' ? '👑 Продавец' : '🛒 Покупатель';
}

function formatAmount(amount, currency) {
  const sym = CURRENCIES[currency]?.symbol || currency.toUpperCase();
  return `${Number(amount).toFixed(2)} ${sym}`;
}

function makeStatusPill(status) {
  const s = STATUS_LABELS[status] || { ru: status, cls: '' };
  return `<span class="status-pill ${s.cls}">${s.ru}</span>`;
}

function makeTicket(deal, navTarget) {
  const role = getUserRole(deal);
  const partner = getPartnerUsername(deal);
  const partnerStr = partner ? (role === 'seller' ? `Покупатель · @${partner}` : `Продавец · @${partner}`) : (role === 'seller' ? 'Покупатель · ожидает' : 'Продавец · ожидает');
  return `
    <button class="ticket" data-nav="${navTarget}" data-deal-id="${deal.deal_id}">
      <div class="ticket__row">
        <span class="ticket__id">OTC-${deal.deal_id}</span>
        ${makeStatusPill(deal.status)}
      </div>
      <div class="ticket__row">
        <span class="ticket__desc">${deal.description}</span>
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
  'deals':            { title: 'Сделки',          tab: 'deals',    back: false },
  'deals-create':      { title: 'Создать сделку',  tab: 'deals',    back: true  },
  'deals-my':          { title: 'Мои сделки',      tab: 'deals',    back: true  },
  'deals-search':      { title: 'Найти сделку',    tab: 'deals',    back: true  },
  'deals-detail':      { title: 'Сделка',          tab: 'deals',    back: true  },
  'wallets':           { title: 'Реквизиты',       tab: 'wallets',  back: false },
  'wallets-edit':      { title: 'Редактировать',   tab: 'wallets',  back: true  },
  'profile':           { title: 'Профиль',         tab: 'profile',  back: false },
  'settings':          { title: 'Настройки',       tab: 'settings', back: false },
  'settings-lang':     { title: 'Язык интерфейса', tab: 'settings', back: true  },
  'settings-support':  { title: 'Поддержка',       tab: 'settings', back: true  },
};
const TAB_HOME = { deals:'deals', wallets:'wallets', profile:'profile', settings:'settings' };

const contentEl = document.getElementById('content');
const titleEl   = document.getElementById('screenTitle');
const backBtn   = document.getElementById('backBtn');
const tabbar    = document.querySelector('.tabbar');

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
  const myDeals = DEALS_DB.filter(d => d.creator_id === (TG_USER.id || 1) || d.respondent_id === (TG_USER.id || 1));
  const active  = myDeals.filter(d => ['active','pending','paid','awaiting_buyer','dispute'].includes(d.status));
  const done    = myDeals.filter(d => d.status === 'completed');

  // Обновляем сабтекст кнопки "Мои сделки"
  const myBtn = document.getElementById("myDealsSub");
  if (myBtn) {
    myBtn.textContent = `${active.length} активных · ${done.length} завершено`;
  }

  // Последние 2 сделки
  const list = document.getElementById('deals-preview-list');
  if (!list) return;
  const recent = [...myDeals].sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0,2);
  list.innerHTML = recent.length
    ? recent.map(d => makeTicket(d, 'deals-detail')).join('')
    : '<p class="empty-hint">У вас пока нет сделок</p>';
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
      if (hint) hint.textContent = `${state.createForm.description.length}/120 символов`;
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
      err.textContent = 'Введите корректную сумму';
    } else if (val < min) {
      err.textContent = `Минимум: ${min} ${CURRENCIES[state.createForm.currency]?.symbol}`;
    } else {
      err.textContent = '';
    }
  }
}

function handleCreateDeal() {
  const amount = parseFloat(state.createForm.amount);
  const min = CURRENCIES[state.createForm.currency]?.min || 0;
  const desc = state.createForm.description.trim();

  if (!amount || isNaN(amount) || amount < min) {
    showToast(`Минимальная сумма: ${min} ${CURRENCIES[state.createForm.currency]?.symbol}`);
    return;
  }
  if (!desc) {
    showToast('Введите описание сделки');
    return;
  }

  const newDeal = {
    deal_id: genDealId(),
    creator_id: TG_USER.id || 1,
    respondent_id: null,
    creator_username: TG_USER.username,
    respondent_username: null,
    amount,
    currency: state.createForm.currency,
    description: desc,
    status: 'pending',
    creator_role: state.createForm.role,
    created_at: new Date().toISOString(),
  };

  DEALS_DB.unshift(newDeal);
  saveDealsToDB();

  // Уведомляем бот (если запущены в TG)
  if (tg) {
    tg.sendData(JSON.stringify({
      action: 'create_deal',
      role: state.createForm.role,
      currency: state.createForm.currency,
      amount,
      description: desc,
    }));
  }

  state.currentDeal = newDeal;
  showToast('✅ Сделка создана!');

  // Переходим на детальную страницу новой сделки
  setTimeout(() => navigate('deals-detail'), 600);
}

// ═══════════════════════════════════════════════════════════════════════════
// РАЗДЕЛ: МОИ СДЕЛКИ
// ═══════════════════════════════════════════════════════════════════════════
function renderMyDeals() {
  const uid = TG_USER.id || 1;
  const allMine = DEALS_DB.filter(d => d.creator_id === uid || d.respondent_id === uid)
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

  const filterMap = {
    active:    d => ['active','pending','paid','awaiting_buyer','dispute'].includes(d.status),
    completed: d => d.status === 'completed',
    all:       ()=> true,
  };

  const filtered = allMine.filter(filterMap[state.myDealsFilter] || filterMap.all);

  // Обновляем счётчики на сегментах
  document.querySelectorAll('[data-deals-filter]').forEach(btn => {
    const f = btn.dataset.dealsFilter;
    const count = allMine.filter(filterMap[f] || filterMap.all).length;
    const base = { active:'Активные', completed:'Завершённые', all:'Все' }[f] || f;
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
    list.innerHTML = '<p class="empty-hint">Нет сделок в этом разделе</p>';
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

function doSearch() {
  const input = document.getElementById('searchInput');
  const resultBox = document.getElementById('searchResult');
  if (!input || !resultBox) return;

  const query = input.value.trim().replace(/^OTC-/i, '').replace(/^#/, '');
  if (!query) { showToast('Введите номер сделки'); return; }

  const deal = DEALS_DB.find(d => d.deal_id === query);
  const uid = TG_USER.id || 1;

  if (!deal) {
    resultBox.innerHTML = '<p class="empty-hint">Сделка не найдена</p>';
    return;
  }
  // Проверяем доступ — только участники сделки
  const isParticipant = deal.creator_id === uid || deal.respondent_id === uid;
  if (!isParticipant) {
    // Можно присоединиться к pending сделке
    if (deal.status === 'pending') {
      resultBox.innerHTML = makeTicket(deal, 'deals-detail') + `
        <div class="field-hint" style="text-align:center;margin-top:8px">Вы можете присоединиться к этой сделке</div>`;
      // Нажатие на тикет — показываем детали с кнопкой "Присоединиться"
      state.currentDeal = deal;
      state.searchIsJoin = true;
    } else {
      resultBox.innerHTML = '<p class="empty-hint">У вас нет доступа к этой сделке</p>';
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

  const uid = TG_USER.id || 1;
  const role = getUserRole(deal);
  const partner = getPartnerUsername(deal);
  const isCreator = deal.creator_id === uid;
  const isParticipant = isCreator || deal.respondent_id === uid;
  const isJoin = !isParticipant && state.searchIsJoin;

  const commAmt = (deal.amount * COMMISSION).toFixed(2);
  const netAmt  = (deal.amount - deal.amount * COMMISSION).toFixed(2);

  // Рендерим карточку
  detailEl.innerHTML = `
    <div class="detail-card">
      <div class="detail-card__head">
        <span class="ticket__id ticket__id--lg">OTC-${deal.deal_id}</span>
        ${makeStatusPill(deal.status)}
      </div>
      <div class="detail-card__divider"></div>

      ${isParticipant ? `
      <div class="detail-row">
        <span class="detail-row__label">Ваша роль</span>
        <span class="detail-row__value">${roleLabel(role)}</span>
      </div>` : ''}

      ${partner ? `
      <div class="detail-row">
        <span class="detail-row__label">${role === 'seller' ? 'Покупатель' : 'Продавец'}</span>
        <span class="detail-row__value">@${partner}</span>
      </div>` : (deal.status === 'pending' ? `
      <div class="detail-row">
        <span class="detail-row__label">${role === 'seller' ? 'Покупатель' : 'Продавец'}</span>
        <span class="detail-row__value" style="color:var(--text-dim)">Ожидает участника</span>
      </div>` : '')}

      <div class="detail-row">
        <span class="detail-row__label">Описание</span>
        <span class="detail-row__value">${deal.description}</span>
      </div>

      <div class="detail-row">
        <span class="detail-row__label">Сумма</span>
        <span class="detail-row__value detail-row__value--mono">${formatAmount(deal.amount, deal.currency)}</span>
      </div>

      <div class="detail-row">
        <span class="detail-row__label">Комиссия (1%)</span>
        <span class="detail-row__value detail-row__value--mono" style="color:var(--text-dim)">${commAmt} ${CURRENCIES[deal.currency]?.symbol}</span>
      </div>

      ${role === 'seller' ? `
      <div class="detail-row">
        <span class="detail-row__label">Вы получите</span>
        <span class="detail-row__value detail-row__value--mono" style="color:var(--accent,#4ade80)">${netAmt} ${CURRENCIES[deal.currency]?.symbol}</span>
      </div>` : `
      <div class="detail-row">
        <span class="detail-row__label">К оплате</span>
        <span class="detail-row__value detail-row__value--mono">${formatAmount(deal.amount, deal.currency)}</span>
      </div>`}

      <div class="detail-card__divider"></div>

      <div class="detail-row">
        <span class="detail-row__label">Создана</span>
        <span class="detail-row__value" style="color:var(--text-dim)">${formatDate(deal.created_at)}</span>
      </div>

      ${getStatusNote(deal, role)}
    </div>

    ${getActionButtons(deal, role, isParticipant, isJoin)}
  `;

  // Привязываем кнопки действий
  bindDetailActions(deal, role, isParticipant, isJoin);
}

function getStatusNote(deal, role) {
  const notes = {
    pending: role === 'seller'
      ? 'Поделитесь ссылкой на сделку с покупателем. Ждите, пока он присоединится.'
      : 'Поделитесь ссылкой на сделку с продавцом. Ждите, пока он присоединится.',
    active: role === 'seller'
      ? 'Ожидайте оплаты от покупателя. После подтверждения — передайте товар менеджеру.'
      : `Оплатите сделку и сообщите менеджеру @${MANAGER}. Продавец передаст товар.`,
    paid:           'Оплата получена. Ожидайте подтверждения менеджера.',
    awaiting_buyer: 'Продавец передал товар менеджеру. Подтвердите получение.',
    completed:      '✅ Сделка успешно завершена.',
    cancelled:      '⚫ Сделка отменена.',
    dispute:        `🔴 Открыт спор. Менеджер @${MANAGER} разберётся в ситуации.`,
  };
  const note = notes[deal.status] || '';
  return note ? `<p class="detail-note">${note}</p>` : '';
}

function getActionButtons(deal, role, isParticipant, isJoin) {
  if (isJoin) {
    return `<button class="btn btn--primary btn--block" id="detailAction1">Присоединиться к сделке</button>`;
  }
  if (!isParticipant) return '';

  const uid = TG_USER.id || 1;
  let btns = '';

  switch (deal.status) {
    case 'pending':
      if (deal.creator_id === uid) {
        // Скопировать ссылку + отменить
        btns = `
          <button class="btn btn--primary btn--block" id="detailAction1">📋 Скопировать ссылку на сделку</button>
          <button class="btn btn--ghost btn--block" id="detailAction2">Отменить сделку</button>`;
      } else {
        btns = `<button class="btn btn--primary btn--block" id="detailAction1">Присоединиться к сделке</button>`;
      }
      break;

    case 'active':
      if (role === 'buyer') {
        btns = `
          <button class="btn btn--primary btn--block" id="detailAction1">💸 Оплатить сделку</button>
          <button class="btn btn--ghost btn--block" id="detailAction2">Открыть спор</button>`;
      } else {
        btns = `<button class="btn btn--ghost btn--block" id="detailAction2">Открыть спор</button>`;
      }
      break;

    case 'paid':
      if (role === 'seller') {
        btns = `<button class="btn btn--primary btn--block" id="detailAction1">✅ Передал(а) товар менеджеру</button>`;
      }
      break;

    case 'awaiting_buyer':
      if (role === 'buyer') {
        btns = `
          <button class="btn btn--primary btn--block" id="detailAction1">✅ Подтвердить получение</button>
          <button class="btn btn--ghost btn--block" id="detailAction2">Открыть спор</button>`;
      }
      break;

    case 'completed':
    case 'cancelled':
    case 'dispute':
      btns = '';
      break;
  }

  return btns;
}

function bindDetailActions(deal, role, isParticipant, isJoin) {
  const uid = TG_USER.id || 1;
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
              navigator.clipboard.writeText(link).then(() => showToast('Ссылка скопирована!'));
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
function handleJoinDeal(deal) {
  const uid = TG_USER.id || 1;
  if (deal.respondent_id) { showToast('Сделка уже занята'); return; }

  deal.respondent_id = uid;
  deal.respondent_username = TG_USER.username || 'you';
  deal.status = 'active';
  saveDealsToDB();

  if (tg) tg.sendData(JSON.stringify({ action: 'join_deal', deal_id: deal.deal_id }));

  showToast('✅ Вы присоединились к сделке!');
  setTimeout(() => renderDealDetail(), 400);
}

function handleCancelDeal(deal) {
  confirmAction('Отменить сделку?', 'Сделка будет отменена без возврата.', () => {
    deal.status = 'cancelled';
    saveDealsToDB();
    if (tg) tg.sendData(JSON.stringify({ action: 'cancel_deal', deal_id: deal.deal_id }));
    showToast('Сделка отменена');
    setTimeout(() => renderDealDetail(), 400);
  });
}

function handlePayDeal(deal) {
  confirmAction('Подтвердить оплату?', `Вы оплачиваете ${formatAmount(deal.amount, deal.currency)}`, () => {
    deal.status = 'paid';
    saveDealsToDB();
    if (tg) tg.sendData(JSON.stringify({ action: 'pay_deal', deal_id: deal.deal_id }));
    showToast('✅ Оплата подтверждена!');
    setTimeout(() => renderDealDetail(), 400);
  });
}

function handleTransferToManager(deal) {
  confirmAction('Передали товар менеджеру?', `Свяжитесь с @${MANAGER} для подтверждения.`, () => {
    deal.status = 'awaiting_buyer';
    saveDealsToDB();
    if (tg) tg.sendData(JSON.stringify({ action: 'transfer_to_manager', deal_id: deal.deal_id }));
    showToast('✅ Статус обновлён!');
    setTimeout(() => renderDealDetail(), 400);
  });
}

function handleConfirmReceived(deal) {
  confirmAction('Подтвердить получение?', 'Вы подтверждаете, что получили товар.', () => {
    deal.status = 'completed';
    saveDealsToDB();
    if (tg) tg.sendData(JSON.stringify({ action: 'confirm_deal', deal_id: deal.deal_id }));
    showToast('🎉 Сделка завершена!');
    setTimeout(() => renderDealDetail(), 400);
  });
}

function handleOpenDispute(deal) {
  confirmAction('Открыть спор?', `Менеджер @${MANAGER} рассмотрит ситуацию.`, () => {
    deal.status = 'dispute';
    saveDealsToDB();
    if (tg) tg.sendData(JSON.stringify({ action: 'open_dispute', deal_id: deal.deal_id }));
    showToast('🔴 Спор открыт');
    setTimeout(() => renderDealDetail(), 400);
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
renderScreen('deals');

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
    return 'Введите корректный Telegram username (мин. 5 символов)';
  }
  return null;
}

function validateCryptoWallet(val) {
  if (!val) return null;
  const clean = val.trim();
  if (clean.length < 4 || clean.length > 100) {
    return 'Адрес должен быть от 4 до 100 символов';
  }
  return null;
}

function validateCard(val) {
  if (!val) return null;
  const digits = val.replace(/\D/g, '');
  if (digits.length !== 16) return 'Введите 16 цифр номера карты';
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
        <span class="wallet-row__cur">${cfg2.label}</span>
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
      ? 'Все реквизиты заполнены ✓'
      : `Заполнено ${filled} из ${WALLET_CONFIG.length}`;
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
        <div class="field-label">${cfg2.label}</div>
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
        <div class="field-hint">${cfg2.hint}</div>
        <div class="field-error" id="wErr_${cfg2.key}"></div>
      </div>`;
  }).join('');

  // Маска для карточных полей
  ['rub','uah','uzs'].forEach(key => {
    const inp = document.getElementById(`wInput_${key}`);
    if (!inp) return;
    inp.addEventListener('input', () => {
      const pos = inp.selectionStart;
      const raw = inp.value.replace(/\D/g,'').slice(0,16);
      const formatted = raw.replace(/(\d{4})(?=\d)/g,'$1 ').trim();
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
    if (['rub','uah','uzs'].includes(cfg2.key) && val) {
      val = val.replace(/\s/g,''); // убираем пробелы — храним цифрами
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
    showToast('Исправьте ошибки в форме');
    // Скролл к первой ошибке
    const firstErr = document.querySelector('.field-error:not(:empty)');
    if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  WALLETS = newWallets;
  saveWallets(WALLETS);

  // Отправляем боту
  if (tg) {
    tg.sendData(JSON.stringify({ action: 'update_wallets', wallets: WALLETS }));
  }

  showToast('✅ Реквизиты сохранены!');
  setTimeout(() => {
    goBack();
    renderWalletsView();
  }, 500);
}


// ── Патч навигации для реквизитов ─────────────────────────────────────────
// Сохраняем исходный renderScreen и добавляем вызовы wallet-разделов
const _rsOrig = renderScreen;
renderScreen = function(name) {
  _rsOrig(name);
  if (name === 'wallets') renderWalletsView();
  if (name === 'wallets-edit') renderWalletsEdit();
};
// Также патчим navigate (stage2 вызывает renderScreen внутри себя)
const _navOrig = navigate;
navigate = function(name, opts) {
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
    user_id: TG_USER.id || 1,
    first_name: TG_USER.first_name || 'Demo',
    username: TG_USER.username || 'demo_user',
    photo_url: TG_USER.photo_url || null,
    register_date: new Date(Date.now() - 120 * 24 * 3600000).toISOString(), // ~4 мес назад
    deals_count: 0, // будет пересчитан из DEALS_DB
    ref_count: 7,
    ref_earned_ton: 14.62,
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
  const months = [
    'января','февраля','марта','апреля','мая','июня',
    'июля','августа','сентября','октября','ноября','декабря'
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function countCompletedDeals() {
  const uid = TG_USER.id || 1;
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
  const completedDeals = countCompletedDeals();
  const refLink = buildRefLink(PROFILE.user_id);
  const displayName = PROFILE.first_name || 'Пользователь';
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
  if (refCountEl) refCountEl.textContent = `${PROFILE.ref_count} чел.`;

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
            showToast('✅ Ссылка скопирована!');
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
      const text = `🔒 Безопасные сделки с Telegram-подарками, TON и USDT\n\nПрисоединяйся: ${refLink}`;
      if (tg?.shareToChat) {
        tg.shareToChat(text);
      } else if (navigator.share) {
        navigator.share({ text }).catch(() => {});
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
  if (deals >= 50) return { label: '🏆 Эксперт', bg: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#000' };
  if (deals >= 20) return { label: '⭐ Про', bg: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff' };
  if (deals >= 5)  return { label: '✅ Надёжный', bg: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff' };
  return { label: '🆕 Новичок', bg: 'var(--surface-2)', color: 'var(--text-dim)' };
}

// ── Патч навигации для профиля ─────────────────────────────────────────────
const _rsStage4Orig = renderScreen;
renderScreen = function(name) {
  _rsStage4Orig(name);
  if (name === 'profile') renderProfile();
};
const _navStage4Orig = navigate;
navigate = function(name, opts) {
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

// ── Текущий язык ────────────────────────────────────────────────────────────
let APP_LANG = localStorage.getItem('otc_lang') || 'ru';

function tr(key) {
  return (I18N[APP_LANG] || I18N.ru)[key] || key;
}

function setLang(lang) {
  APP_LANG = lang;
  localStorage.setItem('otc_lang', lang);
  applyI18n();
  // Уведомляем бот
  if (tg) {
    tg.sendData(JSON.stringify({ action: 'change_language', language: lang }));
  }
}

function applyI18n() {
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
renderScreen = function(name) {
  _rsFinalOrig(name);
  if (name === 'settings') renderSettings();
  if (name === 'settings-lang') renderLangScreen();
  if (name === 'settings-support') renderSupportScreen();
};
const _navFinalOrig = navigate;
navigate = function(name, opts) {
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
function handleStartParam() {
  const startParam = tg?.initDataUnsafe?.start_param || '';
  if (!startParam) return;

  if (startParam.startsWith('deal_')) {
    const dealId = startParam.replace('deal_', '');
    const deal = DEALS_DB.find(d => d.deal_id === dealId);
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
const API_BASE_URL = ''; // Пример: 'https://api.notcoin.org' — оставь пустым если нет API

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
    if (Array.isArray(data.deals) && data.deals.length > 0) {
      DEALS_DB = data.deals;
      saveDealsToDB();
    }

    // ── Обновляем реквизиты ────────────────────────────────────────────────
    if (data.wallets) {
      WALLETS = { ...loadWallets(), ...data.wallets };
      saveWallets(WALLETS);
    }

    // ── Язык из бота ──────────────────────────────────────────────────────
    if (data.language && I18N[data.language]) {
      APP_LANG = data.language;
      localStorage.setItem('otc_lang', APP_LANG);
    }

    console.info('[MiniApp] Данные пользователя загружены с сервера');
  } catch (e) {
    // Тихая ошибка — работаем на кэше
    console.warn('[MiniApp] API недоступен, используем локальные данные:', e.message);
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
  handleStartParam();
})();


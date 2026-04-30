/* ── Config ── */
const CONFIG_KEY = 'italia_sb_config';
let supabaseClient = null;

function getSavedConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || null; }
  catch { return null; }
}

function saveConfig() {
  const url = document.getElementById('cfg-url').value.trim();
  const key = document.getElementById('cfg-key').value.trim();
  if (!url || !key) { showToast('請填寫 URL 和 Anon Key'); return; }
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, key }));
  initSupabase(url, key);
  document.getElementById('config-overlay').classList.remove('open');
  setTimeout(() => loadPlaces(), 100);  // ← 加這個 setTimeout
}



function initSupabase(url, key) {
  supabaseClient = supabase.createClient(url, key);
}

/* ── State ── */
let curCity = 'roma';
let curCat = 'all';
let allPlaces = [];

const CITY_NAMES = {
  roma: 'Roma',
  firenze: 'Firenze',
  siena: 'Siena',
  venezia: 'Venezia',
  milano: 'Milano',
};

const CAT_LABELS = { food: '小吃', shop: '購物', restaurant: '餐廳', spot:'景點' };
const RECO_LABELS = { food: '必點推薦', shop: '必買清單', restaurant: '必吃餐廳', spot:'景點' };
const BADGE_CLASS = { food: 'badge-food', shop: 'badge-shop', restaurant: 'badge-restaurant', spot:'badge-spot' };

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  const cfg = getSavedConfig();
  if (cfg) {
    initSupabase(cfg.url, cfg.key);
    loadPlaces();
  } else {
    document.getElementById('config-overlay').classList.add('open');
    document.getElementById('loading').style.display = 'none';
  }

  // City nav
  document.getElementById('city-nav').addEventListener('click', e => {
    const btn = e.target.closest('.city-btn');
    if (!btn) return;
    document.querySelectorAll('.city-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    curCity = btn.dataset.city;
    curCat = 'all';
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.cat-tab[data-cat="all"]').classList.add('active');
    loadPlaces();
  });

  // Cat tabs
  document.getElementById('cat-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.cat-tab');
    if (!btn) return;
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    curCat = btn.dataset.cat;
    renderPlaces();
  });

  // Add button
  document.getElementById('open-modal-btn').addEventListener('click', () => openModal());

  // Radio change → update reco label
  document.querySelectorAll('input[name="cat"]').forEach(r => {
    r.addEventListener('change', updateRecoLabel);
  });
});

/* ── Load from Supabase ── */
async function loadPlaces() {
  if (!supabaseClient) return;
  setLoading(true);
  try {
    const { data, error } = await supabaseClient
      .from('places')
      .select('*')
      .eq('city', curCity)
      .order('created_at', { ascending: false });
    if (error) throw error;
    allPlaces = data || [];
    renderPlaces();
  } catch (err) {
    console.error(err);
    showToast('載入失敗：' + err.message);
  } finally {
    setLoading(false);
  }
}

/* ── Render ── */
function renderPlaces() {
  const filtered = curCat === 'all'
    ? allPlaces
    : allPlaces.filter(p => p.category === curCat);

  // Stats
  document.getElementById('n-food').textContent = allPlaces.filter(p => p.category === 'food').length;
  document.getElementById('n-shop').textContent = allPlaces.filter(p => p.category === 'shop').length;
  document.getElementById('n-restaurant').textContent = allPlaces.filter(p => p.category === 'restaurant').length;
  document.getElementById('n-spot').textContent = allPlaces.filter(p => p.category === 'spot').length;

  const list = document.getElementById('place-list');
  const empty = document.getElementById('empty-state');

  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = filtered.map(place => {
    const recos = (place.recommendations || []);
    const recoHtml = recos.length
      ? `<ul class="reco-list">${recos.map(r => `<li>${escHtml(r)}</li>`).join('')}</ul>`
      : `<p class="no-reco">尚無推薦項目</p>`;
    const noteHtml = place.note
      ? `<div class="card-note">${escHtml(place.note)}</div>`
      : '';
    const addressHtml = place.address
      ? `<div class="card-address">
          <a href="${escHtml(place.address)}" target="_blank" rel="noopener">
            📍 在 Google Maps 開啟
          </a>
        </div>`
      : '';
    const igHtml = place.ig_url
      ? `<div class="card-address">
          <a href="${escHtml(place.ig_url)}" target="_blank" rel="noopener">
            🎬 觀看 IG Reels
          </a>
        </div>`
      : '';
    return `
      <div class="place-card" id="card-${place.id}">
        <div class="card-header" onclick="toggleCard('${place.id}')">
          <svg class="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M6 4l4 4-4 4"/>
          </svg>
          <span class="card-name">${escHtml(place.name)}</span>
          <span class="cat-badge ${BADGE_CLASS[place.category]}">${CAT_LABELS[place.category]}</span>
          <div class="card-actions" onclick="event.stopPropagation()">
            <button class="icon-btn" title="編輯" onclick="openEditModal('${place.id}')">✎</button>
            <button class="icon-btn del" title="刪除" onclick="deletePlace('${place.id}')">✕</button>
          </div>
        </div>
        <div class="card-body" style="display:none">
          <div class="reco-section-label">${RECO_LABELS[place.category]}</div>
          ${recoHtml}
          ${noteHtml}
          ${addressHtml}
          ${igHtml}
        </div>
      </div>
    `;
  }).join('');
}

function toggleCard(id) {
  const card = document.getElementById('card-' + id);
  const body = card.querySelector('.card-body');
  const isOpen = card.classList.contains('open');
  card.classList.toggle('open', !isOpen);
  body.style.display = isOpen ? 'none' : 'block';
}

/* ── Add / Edit ── */
function openModal(place = null) {
  const modal = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent = place ? '編輯地點' : '新增地點';
  document.getElementById('edit-id').value = place ? place.id : '';
  document.getElementById('f-name').value = place ? place.name : '';
  document.getElementById('f-note').value = place ? (place.note || '') : '';
  document.getElementById('f-recos').value = place ? (place.recommendations || []).join('\n') : '';
  document.getElementById('f-address').value = place ? (place.address || '') : '';
  document.getElementById('f-ig').value = place ? (place.ig_url || '') : '';

  const cat = place ? place.category : 'food';
  document.querySelector(`input[name="cat"][value="${cat}"]`).checked = true;
  updateRecoLabel();
  modal.classList.add('open');
  document.getElementById('f-name').focus();
}

function openEditModal(id) {
  const place = allPlaces.find(p => String(p.id) === String(id));
  if (place) openModal(place);
}

function updateRecoLabel() {
  const cat = document.querySelector('input[name="cat"]:checked')?.value || 'food';
  document.getElementById('reco-label').textContent = RECO_LABELS[cat] + '（每行一項）';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function closeModalOnOverlay(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

async function savePlace() {
  if (!supabaseClient) return;
  const id = document.getElementById('edit-id').value;
  const name = document.getElementById('f-name').value.trim();
  const category = document.querySelector('input[name="cat"]:checked').value;
  const note = document.getElementById('f-note').value.trim();
  const recoRaw = document.getElementById('f-recos').value;
  const recommendations = recoRaw.split('\n').map(r => r.trim()).filter(Boolean);
  const address = document.getElementById('f-address').value.trim();
  const ig_url = document.getElementById('f-ig').value.trim();
  const payload = { name, category, note: note || '', recommendations, address: address || '', ig_url: ig_url || '' };

  if (!name) { showToast('請填寫地點名稱'); return; }

  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = '儲存中…';

  try {
    if (id) {
      const { error } = await supabaseClient
        .from('places')
        .update(payload)
        .eq('id', id);
      if (error) throw error;
      showToast('已更新');
    } else {
      const { error } = await supabaseClient
        .from('places')
        .insert([{ city: curCity, ...payload }]);
      if (error) throw error;
      showToast('已新增');
    }
    closeModal();
    await loadPlaces();
  } catch (err) {
    showToast('儲存失敗：' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '儲存';
  }
}

async function deletePlace(id) {
  if (!supabaseClient) return;
  if (!confirm('確定要刪除這個地點嗎？')) return;
  try {
    const { error } = await supabaseClient.from('places').delete().eq('id', id);
    if (error) throw error;
    showToast('已刪除');
    await loadPlaces();
  } catch (err) {
    showToast('刪除失敗：' + err.message);
  }
}

/* ── Helpers ── */
function setLoading(on) {
  document.getElementById('loading').style.display = on ? 'flex' : 'none';
  document.getElementById('place-list').style.display = on ? 'none' : 'flex';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

// Keyboard shortcut: Escape to close modal
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});
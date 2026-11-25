import { getSupabase, DEMO_FILMS, DEMO_SETTINGS } from './supabase.js';
import { extractDriveId, drivePreviewUrl } from './drive.js';

const $ = (id) => document.getElementById(id);
const COLORS = ['#c0392b', '#e67e22', '#d68910', '#16a085', '#27ae60', '#2e5c8a', '#2980b9', '#7d5ba6', '#8e44ad', '#c2185b', '#34495e', '#5d4037'];

let sb = null;
let demo = false;
let films = [];
let editing = null;   // 편집 중인 film (null 이면 새로 추가)
let pickedColor = COLORS[0];

// ---------- 공통 ----------
function toast(msg, bad = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('bad', bad);
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2600);
}

function show(view) {
  $('loginView').hidden = view !== 'login';
  $('adminView').hidden = view !== 'admin';
  $('logoutBtn').hidden = view !== 'admin' || demo;
}

function notice(html) {
  const n = $('notice');
  if (!html) { n.hidden = true; return; }
  n.innerHTML = html;
  n.hidden = false;
}

// ---------- 인증 ----------
async function checkAdmin() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { show('login'); notice(''); return; }
  const { data, error } = await sb.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle();
  if (error || !data) {
    show('login');
    $('logoutBtn').hidden = false;
    notice(`<strong>${escapeHtml(session.user.email)}</strong> 계정은 아직 관리자로 등록되지 않았어요.<br/>
      Supabase SQL Editor에서 <code>insert into public.admins (user_id) select id from auth.users where email = '이메일';</code> 을 실행한 뒤 새로고침하세요.`);
    return;
  }
  notice('');
  show('admin');
  await loadAll();
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('loginError');
  err.hidden = true;
  const { error } = await sb.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginPassword').value });
  if (error) { err.textContent = '로그인에 실패했어요. 이메일과 비밀번호를 확인하세요.'; err.hidden = false; return; }
  checkAdmin();
});

$('logoutBtn').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});

// ---------- 데이터 ----------
async function loadAll() {
  if (demo) {
    renderSettings(loadAll._settings || (loadAll._settings = { ...DEMO_SETTINGS }));
    renderFilms();
    return;
  }
  const [s, f] = await Promise.all([
    sb.from('site_settings').select('*').eq('id', 1).maybeSingle(),
    sb.from('films').select('*').order('sort_order').order('created_at'),
  ]);
  if (f.error) toast('상영작을 불러오지 못했어요.', true);
  renderSettings(s.data || DEMO_SETTINGS);
  films = f.data || [];
  renderFilms();
}

function renderSettings(s) {
  $('setTitle').value = s.event_title || '';
  $('setSubtitle').value = s.event_subtitle || '';
}

$('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { event_title: $('setTitle').value.trim(), event_subtitle: $('setSubtitle').value.trim() };
  if (demo) { loadAll._settings = payload; toast('저장했어요 (데모 모드: 새로고침하면 사라져요)'); return; }
  const { error } = await sb.from('site_settings').update(payload).eq('id', 1);
  error ? toast('저장에 실패했어요.', true) : toast('행사 정보를 저장했어요.');
});

function renderFilms() {
  const list = $('filmList');
  list.replaceChildren();
  $('filmCount').textContent = films.length ? `${films.length}편` : '';
  $('emptyList').hidden = films.length > 0;

  films.forEach((film, i) => {
    const li = document.createElement('li');
    li.className = 'film-item' + (film.visible === false ? ' hidden-film' : '');
    li.innerHTML = `
      <span class="film-no">${String(i + 1).padStart(2, '0')}</span>
      <span class="film-swatch"></span>
      <div class="film-info">
        <strong></strong>
        <span class="meta"></span>${film.visible === false ? '<span class="tag">비공개</span>' : ''}
      </div>
      <div class="film-actions">
        <button class="btn btn-ghost btn-sm" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="위로">↑</button>
        <button class="btn btn-ghost btn-sm" data-act="down" ${i === films.length - 1 ? 'disabled' : ''} aria-label="아래로">↓</button>
        <button class="btn btn-ghost btn-sm" data-act="edit">수정</button>
        <button class="btn btn-danger btn-sm" data-act="delete">삭제</button>
      </div>`;
    li.querySelector('.film-swatch').style.background = film.poster_color;
    li.querySelector('strong').textContent = film.title;
    li.querySelector('.meta').textContent = [film.director, film.runtime].filter(Boolean).join(' · ') || '정보 없음';
    li.querySelector('.film-actions').addEventListener('click', (e) => {
      const act = e.target.closest('button')?.dataset.act;
      if (act === 'up') move(i, -1);
      if (act === 'down') move(i, 1);
      if (act === 'edit') openEditor(film);
      if (act === 'delete') remove(film);
    });
    list.appendChild(li);
  });
}

async function move(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= films.length) return;
  [films[i], films[j]] = [films[j], films[i]];
  films.forEach((f, idx) => (f.sort_order = idx));
  renderFilms();
  if (demo) return;
  const results = await Promise.all(
    films.map((f, idx) => sb.from('films').update({ sort_order: idx }).eq('id', f.id))
  );
  if (results.some((r) => r.error)) { toast('순서 저장에 실패했어요.', true); loadAll(); }
}

async function remove(film) {
  if (!confirm(`‘${film.title}’을(를) 삭제할까요? 되돌릴 수 없어요.`)) return;
  if (!demo) {
    const { error } = await sb.from('films').delete().eq('id', film.id);
    if (error) { toast('삭제에 실패했어요.', true); return; }
  }
  films = films.filter((f) => f.id !== film.id);
  renderFilms();
  toast('삭제했어요.');
}

// ---------- 편집기 ----------
function renderSwatches() {
  const box = $('swatches');
  box.replaceChildren();
  COLORS.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (c.toLowerCase() === pickedColor.toLowerCase() ? ' on' : '');
    b.style.background = c;
    b.setAttribute('aria-label', c);
    b.addEventListener('click', () => { pickedColor = c; renderSwatches(); });
    box.appendChild(b);
  });
  const custom = document.createElement('input');
  custom.type = 'color';
  custom.value = pickedColor;
  custom.title = '직접 고르기';
  custom.addEventListener('input', () => { pickedColor = custom.value; });
  custom.addEventListener('change', renderSwatches);
  box.appendChild(custom);
}

function updateUrlStatus() {
  const raw = $('fUrl').value.trim();
  const st = $('urlStatus');
  if (!raw) { st.className = 'url-status span-2'; st.textContent = '공유 링크를 그대로 붙여넣으면 재생용 주소로 자동 변환돼요.'; return null; }
  const id = extractDriveId(raw);
  if (!id) {
    st.className = 'url-status span-2 bad';
    st.textContent = '구글 드라이브 파일 링크를 인식하지 못했어요. 드라이브에서 [공유 → 링크 복사]한 주소인지 확인하세요.';
    return null;
  }
  st.className = 'url-status span-2 ok';
  st.innerHTML = `✓ 인식됨 → 재생 주소: <code></code>`;
  st.querySelector('code').textContent = drivePreviewUrl(id);
  return id;
}

function openEditor(film) {
  editing = film || null;
  $('editorTitle').textContent = film ? '상영작 수정' : '상영작 추가';
  $('fTitle').value = film?.title || '';
  $('fDirector').value = film?.director || '';
  $('fRuntime').value = film?.runtime || '';
  $('fDesc').value = film?.description || '';
  $('fUrl').value = film?.drive_url || '';
  $('fVisible').checked = film ? film.visible !== false : true;
  pickedColor = film?.poster_color || COLORS[films.length % COLORS.length];
  renderSwatches();
  updateUrlStatus();
  $('previewWrap').hidden = true;
  $('previewFrame').replaceChildren();
  $('editor').hidden = false;
  $('fTitle').focus();
}

function closeEditor() {
  $('previewFrame').replaceChildren();
  $('editor').hidden = true;
}

$('newFilmBtn').addEventListener('click', () => openEditor(null));
$('closeEditor').addEventListener('click', closeEditor);
$('editor').addEventListener('click', (e) => { if (e.target === $('editor')) closeEditor(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('editor').hidden) closeEditor(); });
$('fUrl').addEventListener('input', updateUrlStatus);

$('previewBtn').addEventListener('click', () => {
  const id = updateUrlStatus();
  if (!id) return;
  const frame = $('previewFrame');
  frame.replaceChildren();
  const iframe = document.createElement('iframe');
  iframe.src = drivePreviewUrl(id);
  iframe.allow = 'autoplay; fullscreen';
  iframe.allowFullscreen = true;
  frame.appendChild(iframe);
  $('previewWrap').hidden = false;
});

$('filmForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileId = updateUrlStatus();
  if (!fileId) { $('fUrl').focus(); return; }
  const payload = {
    title: $('fTitle').value.trim(),
    director: $('fDirector').value.trim(),
    runtime: $('fRuntime').value.trim(),
    description: $('fDesc').value.trim(),
    drive_url: $('fUrl').value.trim(),
    file_id: fileId,
    poster_color: pickedColor,
    visible: $('fVisible').checked,
  };
  if (!payload.title) { $('fTitle').focus(); return; }

  if (demo) {
    if (editing) Object.assign(editing, payload);
    else films.push({ id: `local-${Date.now()}`, sort_order: films.length, ...payload });
    renderFilms(); closeEditor(); toast('저장했어요 (데모 모드: 새로고침하면 사라져요)');
    return;
  }

  let res;
  if (editing) {
    res = await sb.from('films').update(payload).eq('id', editing.id);
  } else {
    const maxOrder = films.reduce((m, f) => Math.max(m, f.sort_order ?? 0), -1);
    res = await sb.from('films').insert({ ...payload, sort_order: maxOrder + 1 });
  }
  if (res.error) { console.error(res.error); toast('저장에 실패했어요. 관리자 권한을 확인하세요.', true); return; }
  closeEditor();
  toast(editing ? '수정했어요.' : '상영작을 추가했어요.');
  loadAll();
});

// ---------- 시작 ----------
(async () => {
  sb = await getSupabase();
  if (!sb) {
    demo = true;
    films = DEMO_FILMS.map((f, i) => ({ ...f, drive_url: '', sort_order: i, visible: true }));
    notice(`<strong>데모 모드</strong> · Supabase가 아직 연결되지 않았어요. 화면과 링크 변환은 시험해 볼 수 있지만 저장되지는 않아요.<br/>
      Vercel 환경변수 <code>SUPABASE_URL</code>, <code>SUPABASE_ANON_KEY</code> 를 설정하면 실제로 저장됩니다.`);
    show('admin');
    loadAll();
    return;
  }
  sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') show('login'); });
  checkAdmin();
})();

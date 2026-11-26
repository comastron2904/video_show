import { getSupabase, DEMO_FILMS, DEMO_SETTINGS } from './supabase.js';
import { extractDriveId, drivePreviewUrl } from './drive.js';

const $ = (id) => document.getElementById(id);
const COLORS = ['#c0392b', '#e67e22', '#d68910', '#16a085', '#27ae60', '#2e5c8a', '#2980b9', '#7d5ba6', '#8e44ad', '#c2185b', '#34495e', '#5d4037'];

let sb = null;
let demo = false;
let films = [];
let editing = null;   // 편집 중인 film (null 이면 새로 추가)
let pickedColor = COLORS[0];
let thumbFile = null;   // 새로 고른 이미지 파일
let thumbUrl = '';      // 현재 썸네일 주소

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
  if (error) {
    console.error('[premiere] 관리자 확인 실패', error);
    show('login');
    $('logoutBtn').hidden = false;
    const perm = error.code === '42501' || /permission denied/i.test(error.message || '');
    const missing = error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find/i.test(error.message || '');
    notice(`관리자 권한을 확인하는 중 오류가 났어요: <code>${escapeHtml(error.code || '')} ${escapeHtml(error.message || '')}</code><br/>
      ${perm ? '테이블 접근 권한(grant)이 없습니다. <code>supabase/schema.sql</code> 을 다시 실행하세요 (권한 부여 구문이 포함되어 있습니다).'
        : missing ? '테이블이 없습니다. <code>supabase/schema.sql</code> 을 이 프로젝트의 SQL Editor 에서 실행하세요.'
        : '브라우저 콘솔(F12)의 오류 내용을 확인하세요.'}`);
    return;
  }
  if (!data) {
    show('login');
    $('logoutBtn').hidden = false;
    notice(`<strong>${escapeHtml(session.user.email)}</strong> 계정은 아직 관리자로 등록되지 않았어요.<br/>
      Supabase SQL Editor에서 <code>insert into public.admins (user_id) select id from auth.users where email = '이메일';</code> 을 실행한 뒤 새로고침하세요.<br/>
      <small>로그인한 사용자 ID: <code>${escapeHtml(session.user.id)}</code></small>`);
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
      <span class="film-thumb"></span>
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
    const thumbEl = li.querySelector('.film-thumb');
    if (/^(https?:|blob:)/.test(film.thumbnail_url || '')) thumbEl.style.backgroundImage = `url("${encodeURI(film.thumbnail_url)}")`;
    else thumbEl.style.background = film.poster_color;
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


// ---------- 썸네일 ----------
function normalizeImageUrl(raw) {
  const u = String(raw || '').trim();
  if (!u) return '';
  // 구글 드라이브 이미지 공유 링크 → 이미지 주소
  if (/drive\.google\.com|docs\.google\.com/.test(u)) {
    const id = extractDriveId(u);
    if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w1200`;
  }
  return /^https:\/\//i.test(u) ? u : '';
}

function showThumbPreview(url) {
  const el = $('thumbPreview');
  el.style.aspectRatio = '';
  if (url) {
    el.style.backgroundImage = `url("${encodeURI(url)}")`;
    el.classList.add('has-img');
    // 미리보기 칸도 썸네일 비율(가로/세로)에 맞춤
    const probe = new Image();
    probe.onload = () => {
      const a = Math.max(0.5, Math.min(2, probe.naturalWidth / probe.naturalHeight));
      el.style.aspectRatio = String(a);
      el.style.width = a > 1 ? '180px' : '120px';
    };
    probe.src = url;
  } else {
    el.style.backgroundImage = '';
    el.style.width = '';
    el.classList.remove('has-img');
  }
}

let previewObjectUrl = null;
$('fThumbFile').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('이미지 파일만 올릴 수 있어요.', true); return; }
  thumbFile = file;
  $('fThumbUrl').value = '';
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = URL.createObjectURL(file);
  showThumbPreview(previewObjectUrl);
  $('thumbNote').textContent = `${file.name} · 저장하면 업로드됩니다.`;
});
$('fThumbUrl').addEventListener('input', () => {
  thumbFile = null;
  $('fThumbFile').value = '';
  const url = normalizeImageUrl($('fThumbUrl').value);
  showThumbPreview(url);
  $('thumbNote').textContent = $('fThumbUrl').value.trim() && !url
    ? 'https:// 로 시작하는 이미지 주소를 넣어 주세요.'
    : '외부 주소는 사이트에서 불러오지 못할 수 있어요. 파일 업로드를 권장합니다.';
});
$('thumbClear').addEventListener('click', () => {
  thumbFile = null; thumbUrl = '';
  $('fThumbFile').value = ''; $('fThumbUrl').value = '';
  showThumbPreview('');
  $('thumbNote').textContent = '썸네일 없이 자동 포스터로 표시됩니다.';
});

// 큰 사진은 가로 1000px 로 줄여서 JPG 로 변환
function resizeImage(file, maxW = 1000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('변환 실패'))), 'image/jpeg', 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없음')); };
    img.src = url;
  });
}

async function resolveThumbnail() {
  if (thumbFile) {
    if (demo) return URL.createObjectURL(thumbFile);
    const blob = await resizeImage(thumbFile);
    const path = `films/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await sb.storage.from('posters').upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
    if (error) throw Object.assign(new Error(error.message), { upload: true });
    return sb.storage.from('posters').getPublicUrl(path).data.publicUrl;
  }
  const typed = $('fThumbUrl').value.trim();
  if (typed) return normalizeImageUrl(typed);
  return thumbUrl;
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
  thumbFile = null;
  thumbUrl = film?.thumbnail_url || '';
  $('fThumbFile').value = '';
  $('fThumbUrl').value = '';
  showThumbPreview(thumbUrl);
  $('thumbNote').textContent = '파일은 저장할 때 자동으로 줄여서 올라갑니다.';
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

  try {
    payload.thumbnail_url = await resolveThumbnail();
  } catch (err) {
    console.error(err);
    toast(err.upload ? '썸네일 업로드에 실패했어요. supabase/schema.sql 을 다시 실행했는지 확인하세요.' : '썸네일 이미지를 처리하지 못했어요.', true);
    return;
  }

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
  if (res.error) {
    console.error(res.error);
    const noColumn = /thumbnail_url/.test(res.error.message || '');
    toast(noColumn ? '썸네일 칸이 없어요. supabase/schema.sql 을 다시 실행하세요.' : '저장에 실패했어요. 관리자 권한을 확인하세요.', true);
    return;
  }
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
      <code>js/config.js</code> 파일에 Supabase 주소와 키를 넣으면 실제로 저장됩니다.`);
    show('admin');
    loadAll();
    return;
  }
  sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') show('login'); });
  checkAdmin();
})();

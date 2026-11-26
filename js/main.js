import { getSupabase, DEMO_FILMS, DEMO_SETTINGS } from './supabase.js';
import { generateLook, drawCharacter, loadProfile, saveProfile } from './character.js';
import { drivePreviewUrl, driveViewUrl } from './drive.js';
import { getDeviceId, getFingerprint } from './device.js';

const $ = (id) => document.getElementById(id);


async function loadData() {
  const sb = await getSupabase();
  if (!sb) return { films: DEMO_FILMS, settings: DEMO_SETTINGS, demo: true };
  const [filmsRes, settingsRes] = await Promise.all([
    sb.from('films').select('*')
      .eq('visible', true).order('sort_order').order('created_at'),
    sb.from('site_settings').select('*').eq('id', 1).maybeSingle(),
  ]);
  const err = filmsRes.error || settingsRes.error;
  if (err) {
    console.error('[premiere] Supabase 요청 실패:', err.message || err, err);
    if (filmsRes.status === 401 || settingsRes.status === 401) {
      console.error('[premiere] 401: SUPABASE_ANON_KEY 가 이 프로젝트의 anon(public) 또는 publishable 키가 아닙니다. js/config.js 의 anonKey 를 확인하세요.');
    }
  }
  return {
    films: filmsRes.data || [],
    settings: settingsRes.data || { event_title: 'ONLINE PREMIERE', event_subtitle: '온라인 시사회에 오신 것을 환영합니다' },
    demo: false,
  };
}

// ---- 아바타 미리보기 ----
function paintAvatar(canvas, look, { scale = 3, t = 0 } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCharacter(ctx, canvas.width / 2, canvas.height * 0.86 - Math.sin(t * 2) * 2, look, { scale, dir: 'down' });
}

function paintChip(look) {
  const c = $('chipAvatar');
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  const preview = world?.getPreview?.();
  if (preview) {
    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.beginPath(); ctx.arc(36, 36, 36, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#2a1a3a'; ctx.fillRect(0, 0, 72, 72);
      ctx.drawImage(img, 0, 0, 72, 72);
      ctx.restore();
    };
    preview.snapshot(look.seed || 0).then((url) => { if (url) img.src = url; });
    return;
  }
  ctx.save();
  ctx.beginPath(); ctx.arc(36, 36, 36, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#2a1a3a'; ctx.fillRect(0, 0, 72, 72);
  drawCharacter(ctx, 36, 118, look, { scale: 2.1, dir: 'down' });
  ctx.restore();
}

// ---- 온보딩 ----
function openOnboarding(current) {
  return new Promise((resolve) => {
    const modal = $('onboard');
    const input = $('nicknameInput');
    const canvas = $('previewAvatar');
    let roll = current?.roll || 0;
    input.value = current?.nickname || '';
    let raf = 0;
    const start = performance.now();
    let last = start;
    // 3D 캐릭터 모델이 있으면 3D 미리보기, 없으면 2D 미리보기
    const preview = world?.getPreview?.();
    const stage = canvas.parentElement;
    if (preview) {
      preview.canvas.className = 'preview3d';
      if (preview.canvas.parentElement !== stage) stage.appendChild(preview.canvas);
      canvas.hidden = true;
    }
    const tick = (now) => {
      const name = input.value.trim() || '손님';
      const look = generateLook(name, roll);
      const t = (now - start) / 1000;
      if (preview) preview.render(look.seed, (now - last) / 1000, 'full', Math.sin(t * 0.8) * 0.5);
      else paintAvatar(canvas, look, { scale: 4.2, t });
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    modal.hidden = false;
    setTimeout(() => input.focus(), 50);

    const onReroll = () => { roll = (roll + 1 + Math.floor(Math.random() * 1000)) % 100000; };
    const onSubmit = (e) => {
      e.preventDefault();
      const nickname = input.value.trim().slice(0, 12);
      if (!nickname) { input.focus(); return; }
      cancelAnimationFrame(raf);
      $('rerollBtn').removeEventListener('click', onReroll);
      $('onboardForm').removeEventListener('submit', onSubmit);
      modal.hidden = true;
      resolve({ nickname, roll });
    };
    $('rerollBtn').addEventListener('click', onReroll);
    $('onboardForm').addEventListener('submit', onSubmit);
  });
}

// ---- 영상 팝업 ----
let world = null;
let currentFilm = null;

const fsTarget = () => $('playerStage');
const canFullscreen = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

async function toggleFullscreen() {
  const el = fsTarget();
  const isFs = document.fullscreenElement || document.webkitFullscreenElement;
  try {
    if (isFs) {
      await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      await (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      // 안드로이드: 전체화면에서 가로로 돌리기
      try { await screen.orientation?.lock?.('landscape'); } catch { /* 지원 안 함 */ }
    }
  } catch { /* 무시 */ }
}

// 구글 드라이브 플레이어는 휴대폰에서 버튼을 크게 그려서 좁거나 낮은 칸에서는 잘립니다.
// 그래서 최소 640×420 크기로 그린 뒤 화면에 맞게 통째로 축소합니다.
const PLAYER_MIN_W = 640;
const PLAYER_MIN_H = 420;
let fitObserver = null;
function fitIframe() {
  const frame = $('playerFrame');
  const iframe = frame.querySelector('iframe');
  if (!iframe) return;
  const w = frame.clientWidth, h = frame.clientHeight;
  if (!w || !h) return;
  const s = Math.min(1, w / PLAYER_MIN_W, h / PLAYER_MIN_H);
  iframe.style.width = `${w / s}px`;
  iframe.style.height = `${h / s}px`;
  iframe.style.transform = s < 1 ? `scale(${s})` : '';
}

function openPlayer(film, demo) {
  if (!film) return;
  world?.setPaused(true);
  world?.setSuspended?.(true);
  document.body.classList.add('player-open');
  $('fullPlayer').hidden = !canFullscreen();
  $('playerTitle').textContent = film.title;
  $('playerMeta').textContent = [film.director, film.runtime].filter(Boolean).join(' · ');
  const frame = $('playerFrame');
  frame.replaceChildren();
  if (demo || film.file_id === 'DEMO') {
    const p = document.createElement('div');
    p.className = 'demo-video';
    p.innerHTML = '<span>▶</span><p>데모 모드입니다.<br/>관리자 화면에서 구글 드라이브 링크를 등록하면 여기서 재생돼요.</p>';
    frame.appendChild(p);
    $('driveLink').removeAttribute('href');
  } else {
    const iframe = document.createElement('iframe');
    iframe.src = drivePreviewUrl(film.file_id);
    iframe.allow = 'autoplay; fullscreen; encrypted-media';
    iframe.allowFullscreen = true;
    iframe.title = film.title;
    frame.appendChild(iframe);
    if (!fitObserver && 'ResizeObserver' in window) fitObserver = new ResizeObserver(fitIframe);
    fitObserver?.observe(frame);
    $('driveLink').href = driveViewUrl(film.file_id);
  }
  $('player').hidden = false;
  requestAnimationFrame(fitIframe);
  $('closePlayer').focus();
}

function closePlayer() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
  }
  try { screen.orientation?.unlock?.(); } catch { /* 무시 */ }
  fitObserver?.disconnect();
  $('playerFrame').replaceChildren(); // iframe 제거 → 재생 정지
  $('player').hidden = true;
  document.body.classList.remove('player-open');
  world?.setSuspended?.(false);
  world?.setPaused(false);
}

const ratioCache = new Map();
function thumbRatio(url) {
  if (ratioCache.has(url)) return ratioCache.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(Math.max(0.5, Math.min(2, img.naturalWidth / img.naturalHeight)));
    img.onerror = () => resolve(null);
    img.src = url;
  });
  ratioCache.set(url, p);
  return p;
}

function showNear(film) {
  currentFilm = film;
  const card = $('nearCard');
  $('hint').hidden = !!film;
  if (!film) { card.hidden = true; return; }
  const thumb = $('nearColor');
  thumb.classList.remove('landscape');
  thumb.style.aspectRatio = '';
  if (/^(https?:|blob:)/.test(film.thumbnail_url || '')) {
    thumb.style.background = `${film.poster_color || '#c0392b'} url("${encodeURI(film.thumbnail_url)}") center / cover no-repeat`;
    thumb.classList.add('has-img');
    // 썸네일 비율에 맞춰 카드 속 미리보기도 가로/세로로
    thumbRatio(film.thumbnail_url).then((ratio) => {
      if (currentFilm !== film || !ratio) return;
      thumb.style.aspectRatio = String(ratio);
      thumb.classList.toggle('landscape', ratio > 1);
    });
  } else {
    thumb.style.background = film.poster_color || '#c0392b';
    thumb.classList.remove('has-img');
  }
  $('nearTitle').textContent = film.title;
  $('nearMeta').textContent = [film.director, film.runtime].filter(Boolean).join(' · ') || '상영작';
  $('nearDesc').textContent = film.description || '';
  card.hidden = false;
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

// 3D 시사회장을 먼저 시도하고, 안 되면 2D 시사회장으로 전환
async function createBestWorld(opts) {
  const force2d = new URLSearchParams(location.search).has('2d');
  if (!force2d && hasWebGL()) {
    const c = document.createElement('canvas');
    c.className = 'world3d';
    c.setAttribute('aria-label', '3D 시사회장');
    $('world').before(c);
    try {
      const mod = await import('./world3d.js');
      const w = await mod.createWorld(c, opts);
      $('world').hidden = true;
      document.body.classList.add('mode-3d');
      return w;
    } catch (err) {
      console.warn('[premiere] 3D 시사회장을 열 수 없어 2D로 전환합니다.', err);
      c.remove();
    }
  }
  const mod = await import('./world2d.js');
  return mod.createWorld($('world'), opts);
}

// ---- 인기투표 ----
const VOTED_KEY = 'premiere.voted.v1';
const vote = { films: [], demo: true, sb: null, deviceId: null, mine: null, picked: null, busy: false };

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setVotedLocal(id) {
  try { id ? localStorage.setItem(VOTED_KEY, id) : localStorage.removeItem(VOTED_KEY); } catch { /* 무시 */ }
}

function refreshVoteButton() {
  const btn = $('voteBtn');
  btn.classList.toggle('voted', !!vote.mine);
  btn.querySelector('.run-label').textContent = vote.mine ? '투표 완료' : '인기투표';
}

function renderVoteList() {
  const list = $('voteList');
  list.replaceChildren();
  const locked = !!vote.mine;
  vote.films.forEach((f) => {
    const li = document.createElement('li');
    li.className = 'vote-item' + (vote.mine === f.id ? ' mine' : '');
    li.setAttribute('role', 'radio');
    li.setAttribute('aria-checked', String(vote.picked === f.id));
    li.tabIndex = locked ? -1 : 0;
    li.innerHTML = `<span class="vote-thumb"></span>
      <div class="vote-info"><strong>${escapeHtml(f.title)}</strong><span>${escapeHtml([f.director, f.runtime].filter(Boolean).join(' · '))}</span></div>
      <span class="vote-check">${vote.mine === f.id || vote.picked === f.id ? '✓' : ''}</span>`;
    const th = li.querySelector('.vote-thumb');
    if (/^(https?:|blob:)/.test(f.thumbnail_url || '')) {
      th.style.backgroundImage = `url("${encodeURI(f.thumbnail_url)}")`;
      // 썸네일 비율(가로/세로)에 맞춰 목록 미리보기 모양도 자동으로
      thumbRatio(f.thumbnail_url).then((ratio) => {
        if (!ratio) return;
        th.style.aspectRatio = String(ratio);
        th.classList.toggle('landscape', ratio > 1);
      });
    } else {
      th.style.background = f.poster_color || '#c0392b';
    }
    if (locked) li.style.cursor = 'default';
    const pick = () => {
      if (vote.mine || vote.busy) return;
      vote.picked = f.id;
      renderVoteList();
    };
    li.addEventListener('click', pick);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    list.appendChild(li);
  });

  const submit = $('submitVote');
  const done = $('voteDone');
  if (vote.mine) {
    const f = vote.films.find((x) => x.id === vote.mine);
    done.textContent = f ? `‘${f.title}’에 투표하셨어요. 감사합니다! 🎉` : '이미 투표하셨어요. 감사합니다! 🎉';
    done.hidden = false;
    submit.hidden = true;
  } else {
    done.hidden = true;
    submit.hidden = false;
    const f = vote.films.find((x) => x.id === vote.picked);
    submit.disabled = !f || vote.busy;
    submit.textContent = vote.busy ? '투표하는 중…' : f ? `‘${f.title}’에 투표하기` : '작품을 선택해 주세요';
  }
}

function openVote() {
  world?.setPaused(true);
  vote.picked = null;
  renderVoteList();
  $('vote').hidden = false;
}
function closeVote() {
  $('vote').hidden = true;
  world?.setPaused(false);
}

async function submitVote() {
  const film = vote.films.find((x) => x.id === vote.picked);
  if (!film || vote.mine || vote.busy) return;
  if (!confirm(`‘${film.title}’에 투표할까요?\n투표는 기기당 한 번만 할 수 있고 바꿀 수 없어요.`)) return;
  vote.busy = true;
  renderVoteList();
  let result = 'ok';
  if (!vote.demo && vote.sb) {
    const fp = await getFingerprint();
    const { data, error } = await vote.sb.rpc('cast_vote', { p_film: film.id, p_device: vote.deviceId, p_fingerprint: fp });
    if (error) { console.error('[premiere] 투표 실패', error); result = 'error'; } else result = data;
  }
  vote.busy = false;
  if (result === 'ok') {
    vote.mine = film.id;
    setVotedLocal(film.id);
  } else if (result === 'already') {
    const { data } = await vote.sb.rpc('my_vote', { p_device: vote.deviceId });
    vote.mine = data || film.id;
    setVotedLocal(vote.mine);
  } else {
    renderVoteList();
    const done = $('voteDone');
    done.hidden = false;
    done.textContent = result === 'closed' ? '투표가 마감되었어요.' : '투표를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.';
    return;
  }
  refreshVoteButton();
  renderVoteList();
}

async function initVote(films, settings, demo) {
  if (!films.length || settings.voting_open === false) return;
  vote.films = films;
  vote.demo = demo;
  vote.deviceId = await getDeviceId();
  try { vote.mine = localStorage.getItem(VOTED_KEY); } catch { vote.mine = null; }
  if (!demo) {
    vote.sb = await getSupabase();
    if (vote.sb) {
      const { data, error } = await vote.sb.rpc('my_vote', { p_device: vote.deviceId });
      if (!error) { vote.mine = data || null; setVotedLocal(vote.mine); } // 서버 기록을 기준으로 (관리자가 초기화하면 다시 투표 가능)
    }
  }
  const btn = $('voteBtn');
  btn.hidden = false;
  refreshVoteButton();
  btn.addEventListener('click', openVote);
  $('closeVote').addEventListener('click', closeVote);
  $('submitVote').addEventListener('click', submitVote);
  $('vote').addEventListener('click', (e) => { if (e.target === $('vote')) closeVote(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('vote').hidden) closeVote(); });
}

async function main() {
  const isTouch = matchMedia('(pointer: coarse)').matches;
  document.body.classList.toggle('touch', isTouch);
  // 길게 누를 때 뜨는 메뉴/선택 방지 (입력창 제외)
  document.addEventListener('contextmenu', (e) => { if (e.target.tagName === 'CANVAS') e.preventDefault(); });
  document.addEventListener('selectstart', (e) => {
    if (!['INPUT', 'TEXTAREA'].includes(e.target.tagName)) e.preventDefault();
  });

  const { films, settings, demo } = await loadData();
  $('eventTitle').textContent = settings.event_title;
  $('eventSubtitle').textContent = settings.event_subtitle;
  document.title = settings.event_title;

  let profile = loadProfile();
  let look = generateLook(profile?.nickname || '손님', profile?.roll || 0);

  world = await createBestWorld({
    films,
    look,
    nickname: profile?.nickname || '',
    title: settings.event_title,
    onNear: showNear,
    onActivate: (film) => openPlayer(film, demo),
  });
  $('loading').classList.add('done');

  if (!profile) {
    world.setPaused(true);
    profile = await openOnboarding(null);
    saveProfile(profile);
    look = generateLook(profile.nickname, profile.roll);
    world.setLook(look, profile.nickname);
    world.setPaused(false);
  }

  const chip = $('profileChip');
  $('chipName').textContent = profile.nickname;
  paintChip(look);
  chip.hidden = false;

  if (!films.length) {
    $('hint').textContent = '아직 등록된 상영작이 없어요. 곧 공개됩니다!';
  }

  chip.addEventListener('click', async () => {
    world.setPaused(true);
    profile = await openOnboarding(profile);
    saveProfile(profile);
    look = generateLook(profile.nickname, profile.roll);
    $('chipName').textContent = profile.nickname;
    paintChip(look);
    world.setLook(look, profile.nickname);
    world.setPaused(false);
  });

  // 달리기 토글 버튼
  const runBtn = $('runBtn');
  runBtn.hidden = false;
  runBtn.addEventListener('click', () => {
    const on = runBtn.getAttribute('aria-pressed') !== 'true';
    runBtn.setAttribute('aria-pressed', String(on));
    runBtn.querySelector('.run-label').textContent = on ? '달리는 중' : '달리기';
    world.setRunning?.(on);
  });

  initVote(films, settings, demo).catch((e) => console.error('[premiere] 인기투표 준비 실패', e));

  $('watchBtn').addEventListener('click', () => openPlayer(currentFilm, demo));
  $('closePlayer').addEventListener('click', closePlayer);
  $('fullPlayer').addEventListener('click', toggleFullscreen);
  $('player').addEventListener('click', (e) => { if (e.target === $('player')) closePlayer(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('player').hidden) closePlayer(); });
  window.addEventListener('orientationchange', () => setTimeout(fitIframe, 300));

  setTimeout(() => $('hint').classList.add('fade'), 9000);
  if (new URLSearchParams(location.search).has('debug')) window.__openPlayer = (i = 0, real = false) => openPlayer(real ? { ...films[i], file_id: 'TESTFILEID1234567890abcd' } : films[i], real ? false : demo);
}

main().catch((err) => {
  console.error(err);
  $('loading').querySelector('p').textContent = '불러오는 중 문제가 생겼어요. 새로고침해 주세요.';
});

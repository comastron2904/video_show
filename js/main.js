import { getSupabase, DEMO_FILMS, DEMO_SETTINGS } from './supabase.js';
import { generateLook, drawCharacter, loadProfile, saveProfile } from './character.js';
import { drivePreviewUrl, driveViewUrl } from './drive.js';

const $ = (id) => document.getElementById(id);

async function loadData() {
  const sb = await getSupabase();
  if (!sb) return { films: DEMO_FILMS, settings: DEMO_SETTINGS, demo: true };
  const [filmsRes, settingsRes] = await Promise.all([
    sb.from('films').select('id,title,director,runtime,description,file_id,poster_color,sort_order')
      .eq('visible', true).order('sort_order').order('created_at'),
    sb.from('site_settings').select('event_title,event_subtitle').eq('id', 1).maybeSingle(),
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
    img.src = preview.snapshot(look.seed || 0);
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

function openPlayer(film, demo) {
  if (!film) return;
  world?.setPaused(true);
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
    $('driveLink').href = driveViewUrl(film.file_id);
  }
  $('player').hidden = false;
  $('closePlayer').focus();
}

function closePlayer() {
  $('playerFrame').replaceChildren(); // iframe 제거 → 재생 정지
  $('player').hidden = true;
  world?.setPaused(false);
}

function showNear(film) {
  currentFilm = film;
  const card = $('nearCard');
  $('hint').hidden = !!film;
  if (!film) { card.hidden = true; return; }
  $('nearColor').style.background = film.poster_color || '#c0392b';
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

async function main() {
  const isTouch = matchMedia('(pointer: coarse)').matches;
  document.body.classList.toggle('touch', isTouch);

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

  $('watchBtn').addEventListener('click', () => openPlayer(currentFilm, demo));
  $('closePlayer').addEventListener('click', closePlayer);
  $('player').addEventListener('click', (e) => { if (e.target === $('player')) closePlayer(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('player').hidden) closePlayer(); });

  setTimeout(() => $('hint').classList.add('fade'), 9000);
}

main().catch((err) => {
  console.error(err);
  $('loading').querySelector('p').textContent = '불러오는 중 문제가 생겼어요. 새로고침해 주세요.';
});

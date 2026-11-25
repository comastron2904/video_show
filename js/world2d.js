// 아이소메트릭 시사회장 (Canvas 2D)
import { drawCharacter } from './character.js';

const HW = 32;          // 타일 반폭(px)
const HH = 16;          // 타일 반높이(px)
const WALL_H = 120;     // 벽 높이(px)
const SPEED = 3.6;      // 이동 속도(타일/초)
const RUN_MULT = 1.9;   // 달리기 배속
const NEAR_DIST = 1.9;  // 팜플렛 상호작용 거리
const P_RADIUS = 0.28;

const iso = (x, y) => ({ x: (x - y) * HW, y: (x + y) * HH });

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0xc0392b;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function wrapText(ctx, text, maxWidth, maxLines) {
  // 띄어쓰기 단위로 줄바꿈하고, 한 단어가 너무 길면 글자 단위로 자릅니다.
  const tokens = [];
  for (const word of String(text || '').split(/\s+/).filter(Boolean)) {
    if (ctx.measureText(word).width <= maxWidth) { tokens.push(word); continue; }
    let part = '';
    for (const ch of Array.from(word)) {
      if (ctx.measureText(part + ch).width > maxWidth && part) { tokens.push(part); part = ch; }
      else part += ch;
    }
    if (part) tokens.push(part);
  }
  const lines = [];
  let line = '';
  let i = 0;
  for (; i < tokens.length; i++) {
    const test = line ? `${line} ${tokens[i]}` : tokens[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = tokens[i];
      if (lines.length === maxLines) break;
    } else line = test;
  }
  if (lines.length < maxLines) { if (line) lines.push(line); return lines; }
  let last = lines[maxLines - 1];
  while (ctx.measureText(last + '…').width > maxWidth && last.length) last = last.slice(0, -1);
  lines[maxLines - 1] = last + '…';
  return lines;
}

// 상영작 수에 맞춰 홀 크기와 팜플렛 위치 계산
function buildLayout(films) {
  const n = Math.max(films.length, 1);
  const cols = n <= 2 ? n : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const W = Math.max(10, cols * 4 + 3);
  const H = Math.max(10, rows * 4 + 7);
  const offsetX = (W - (cols - 1) * 4) / 2;

  const stands = films.map((film, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const rowCount = r === rows - 1 ? films.length - r * cols : cols;
    const rowOffset = ((cols - rowCount) * 4) / 2;
    return { film, index: i, x: offsetX + rowOffset + c * 4, y: 3 + r * 4 };
  });

  const plants = [
    { x: 0.9, y: 0.9 }, { x: W - 0.9, y: 0.9 }, { x: 0.9, y: H - 0.9 },
  ];
  for (let y = 4.5; y < H - 2; y += 4) plants.push({ x: 0.9, y });
  for (let x = 2.5; x < W - 2; x += 4) {
    if (Math.abs(x - W / 2) > 4.2) plants.push({ x, y: 0.9 });
  }

  return { W, H, stands, plants, spawn: { x: W / 2, y: H - 2 } };
}

export function createWorld(canvas, options) {
  const ctx = canvas.getContext('2d');
  const state = {
    films: options.films || [],
    look: options.look,
    nickname: options.nickname || '',
    title: options.title || '',
    layout: null,
    player: { x: 0, y: 0, dir: 'down', walk: 0, moving: false },
    keys: new Set(),
    target: null,
    pendingStand: null,
    stuckTime: 0,
    near: null,
    paused: false,
    cam: { x: 0, y: 0 },
    zoom: 1,
    dpr: 1,
    time: 0,
    standRects: [],
  };

  function resetLayout() {
    state.layout = buildLayout(state.films);
    state.player.x = state.layout.spawn.x;
    state.player.y = state.layout.spawn.y;
    const p = iso(state.player.x, state.player.y);
    state.cam.x = p.x; state.cam.y = p.y - 40;
    state.near = null;
    options.onNear?.(null);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    state.dpr = dpr;
    state.zoom = Math.max(0.85, Math.min(1.35, Math.min(w, h) / 620));
  }

  // ---- 충돌 ----
  function blocked(x, y) {
    const L = state.layout;
    if (x < 0.45 || y < 0.45 || x > L.W - 0.45 || y > L.H - 0.45) return true;
    for (const s of L.stands) {
      if (Math.abs(x - s.x) < 0.75 + P_RADIUS && Math.abs(y - s.y) < 0.55 + P_RADIUS) return true;
    }
    for (const p of L.plants) {
      if (Math.hypot(x - p.x, y - p.y) < 0.35 + P_RADIUS) return true;
    }
    return false;
  }

  function tryMove(dx, dy) {
    const pl = state.player;
    let moved = false;
    if (!blocked(pl.x + dx, pl.y)) { pl.x += dx; moved = true; }
    if (!blocked(pl.x, pl.y + dy)) { pl.y += dy; moved = true; }
    return moved;
  }

  function faceFrom(dx, dy) {
    const sx = dx - dy, sy = (dx + dy) / 2;
    if (Math.abs(sx) > Math.abs(sy) * 1.2) return sx > 0 ? 'right' : 'left';
    return sy > 0 ? 'down' : 'up';
  }

  // ---- 입력 ----
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  };

  function isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  function onKeyDown(e) {
    if (e.key === 'Shift') state.shift = true;
    if (state.paused || isTyping(e)) return;
    if (KEYMAP[e.code]) {
      state.keys.add(KEYMAP[e.code]);
      state.target = null; state.pendingStand = null;
      e.preventDefault();
    } else if ((e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') && state.near) {
      e.preventDefault();
      options.onActivate?.(state.near.film);
    }
  }
  function onKeyUp(e) {
    if (e.key === 'Shift') state.shift = false;
    if (KEYMAP[e.code]) state.keys.delete(KEYMAP[e.code]);
  }

  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left - rect.width / 2) / state.zoom + state.cam.x;
    const py = (clientY - rect.top - rect.height / 2) / state.zoom + state.cam.y;
    return { px, py, x: (px / HW + py / HH) / 2, y: (py / HH - px / HW) / 2 };
  }

  function onPointerDown(e) {
    if (state.paused) return;
    const w = screenToWorld(e.clientX, e.clientY);
    // 팜플렛 클릭 → 앞까지 걸어가기
    for (let i = state.standRects.length - 1; i >= 0; i--) {
      const r = state.standRects[i];
      if (w.px >= r.x && w.px <= r.x + r.w && w.py >= r.y && w.py <= r.y + r.h) {
        const s = r.stand;
        if (state.near === s) { options.onActivate?.(s.film); return; }
        state.target = { x: s.x + 1.05, y: s.y + 1.05 };
        state.pendingStand = s;
        state.stuckTime = 0;
        return;
      }
    }
    const L = state.layout;
    state.target = { x: Math.max(0.5, Math.min(L.W - 0.5, w.x)), y: Math.max(0.5, Math.min(L.H - 0.5, w.y)) };
    state.pendingStand = null;
    state.stuckTime = 0;
  }

  // ---- 업데이트 ----
  function update(dt) {
    const pl = state.player;
    let dx = 0, dy = 0;

    if (!state.paused) {
      const k = state.keys;
      if (k.has('up')) { dx -= 1; dy -= 1; }
      if (k.has('down')) { dx += 1; dy += 1; }
      if (k.has('left')) { dx -= 1; dy += 1; }
      if (k.has('right')) { dx += 1; dy -= 1; }

      if (!dx && !dy && state.target) {
        const tx = state.target.x - pl.x, ty = state.target.y - pl.y;
        const d = Math.hypot(tx, ty);
        if (d < 0.08) state.target = null;
        else { dx = tx / d; dy = ty / d; }
      }
    }

    const len = Math.hypot(dx, dy);
    pl.moving = false;
    if (len > 0) {
      const running = state.run || state.shift;
      const step = Math.min(SPEED * (running ? RUN_MULT : 1) * dt, state.target && !state.keys.size ? Math.hypot(state.target.x - pl.x, state.target.y - pl.y) : Infinity);
      const moved = tryMove((dx / len) * step, (dy / len) * step);
      pl.dir = faceFrom(dx, dy);
      if (moved) { pl.moving = true; pl.walk += dt * (running ? 18 : 11); state.stuckTime = 0; }
      else if (state.target) {
        state.stuckTime += dt;
        if (state.stuckTime > 0.25) state.target = null;
      }
    }

    // 가장 가까운 팜플렛
    let best = null, bestD = NEAR_DIST;
    for (const s of state.layout.stands) {
      const d = Math.hypot(pl.x - s.x, pl.y - s.y);
      if (d < bestD) { best = s; bestD = d; }
    }
    if (best !== state.near) {
      state.near = best;
      options.onNear?.(best ? best.film : null);
    }
    if (state.pendingStand && state.near === state.pendingStand && !state.target) {
      state.pendingStand = null;
      pl.dir = 'up';
    }

    // 카메라
    const p = iso(pl.x, pl.y);
    state.cam.x += (p.x - state.cam.x) * Math.min(1, dt * 6);
    state.cam.y += (p.y - 40 - state.cam.y) * Math.min(1, dt * 6);
  }

  // ---- 그리기 ----
  function drawBackground(w, h) {
    const g = ctx.createRadialGradient(w / 2, h * 0.35, 50, w / 2, h / 2, Math.max(w, h));
    g.addColorStop(0, '#3a2347');
    g.addColorStop(1, '#120a1c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function poly(points, fill, stroke) {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function drawWalls() {
    const { W, H } = state.layout;
    const up = (p, h) => ({ x: p.x, y: p.y - h });
    const o = iso(0, 0), a = iso(0, H), b = iso(W, 0);

    // 왼쪽 벽 (x=0)
    poly([a, o, up(o, WALL_H), up(a, WALL_H)], '#3b2453');
    poly([a, o, up(o, 34), up(a, 34)], '#2c1a3f');
    // 오른쪽 벽 (y=0)
    poly([o, b, up(b, WALL_H), up(o, WALL_H)], '#4a2d66');
    poly([o, b, up(b, 34), up(o, 34)], '#371f4d');
    // 벽 윗면 몰딩
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#d4a548';
    ctx.beginPath();
    ctx.moveTo(up(a, WALL_H).x, up(a, WALL_H).y);
    ctx.lineTo(up(o, WALL_H).x, up(o, WALL_H).y);
    ctx.lineTo(up(b, WALL_H).x, up(b, WALL_H).y);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(212,165,72,0.6)';
    ctx.beginPath();
    ctx.moveTo(up(a, 34).x, up(a, 34).y);
    ctx.lineTo(up(o, 34).x, up(o, 34).y);
    ctx.lineTo(up(b, 34).x, up(b, 34).y);
    ctx.stroke();

    // 커튼 장식 (왼쪽 벽)
    for (let y = 2; y < H - 1; y += 4) {
      const c1 = iso(0, y), c2 = iso(0, y + 2);
      poly([c1, c2, up(c2, WALL_H - 10), up(c1, WALL_H - 10)], '#7a1f2b');
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1.5;
      for (let i = 0.4; i < 2; i += 0.4) {
        const p = iso(0, y + i);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - WALL_H + 10); ctx.stroke();
      }
      poly([up(c1, WALL_H - 10), up(c2, WALL_H - 10), up(c2, WALL_H - 26), up(c1, WALL_H - 26)], '#d4a548');
    }

    // 마키 간판 (오른쪽 벽)
    const sx0 = Math.max(1, W / 2 - 3.5), sx1 = Math.min(W - 1, W / 2 + 3.5);
    const s0 = iso(sx0, 0), s1 = iso(sx1, 0);
    poly([up(s0, 38), up(s1, 38), up(s1, 108), up(s0, 108)], '#1c0f26', '#d4a548');
    // 전구
    const bulbs = Math.round((sx1 - sx0) * 4);
    for (let i = 0; i <= bulbs; i++) {
      const t = i / bulbs;
      const px = s0.x + (s1.x - s0.x) * t, py = s0.y + (s1.y - s0.y) * t;
      const on = (Math.floor(state.time * 4) + i) % 3 !== 0;
      for (const hgt of [41, 105]) {
        ctx.fillStyle = on ? '#ffe9a8' : '#8a6b2e';
        ctx.beginPath(); ctx.arc(px, py - hgt, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    // 간판 텍스트 (벽면에 맞춰 기울임)
    ctx.save();
    const mid = iso((sx0 + sx1) / 2, 0);
    ctx.setTransform(state.dpr * state.zoom, state.dpr * state.zoom * 0.5, 0, state.dpr * state.zoom,
      (mid.x - state.cam.x) * state.zoom * state.dpr + ctx.canvas.width / 2,
      (mid.y - 73 - state.cam.y) * state.zoom * state.dpr + ctx.canvas.height / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 20px Pretendard, "Apple SD Gothic Neo", sans-serif';
    let title = state.title || 'ONLINE PREMIERE';
    const maxW = (s1.x - s0.x) - 24;
    while (ctx.measureText(title).width > maxW && title.length > 2) title = title.slice(0, -2) + '…';
    ctx.shadowColor = '#ffcf5a'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(title, 0, 0);
    ctx.restore();
  }

  function drawFloor() {
    const { W, H } = state.layout;
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        const p0 = iso(x, y), p1 = iso(x + 1, y), p2 = iso(x + 1, y + 1), p3 = iso(x, y + 1);
        const dark = (x + y) % 2 === 0;
        poly([p0, p1, p2, p3], dark ? '#e8d6b9' : '#f3e6cf');
      }
    }
    // 레드카펫: 입구 → 안쪽
    const cx = W / 2;
    poly([iso(cx - 0.8, 1.5), iso(cx + 0.8, 1.5), iso(cx + 0.8, H), iso(cx - 0.8, H)], '#a32638');
    ctx.strokeStyle = '#d4a548'; ctx.lineWidth = 2;
    ctx.beginPath();
    let p = iso(cx - 0.65, 1.6); ctx.moveTo(p.x, p.y); p = iso(cx - 0.65, H); ctx.lineTo(p.x, p.y);
    p = iso(cx + 0.65, 1.6); ctx.moveTo(p.x, p.y); p = iso(cx + 0.65, H); ctx.lineTo(p.x, p.y);
    ctx.stroke();
    // 바닥 테두리
    poly([iso(0, H), iso(W, H), { x: iso(W, H).x, y: iso(W, H).y + 14 }, { x: iso(0, H).x, y: iso(0, H).y + 14 }], '#8a6a45');
    poly([iso(W, 0), iso(W, H), { x: iso(W, H).x, y: iso(W, H).y + 14 }, { x: iso(W, 0).x, y: iso(W, 0).y + 14 }], '#a07b52');
  }

  function drawPlant(pl) {
    const c = iso(pl.x, pl.y);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(c.x, c.y, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
    // 화분
    ctx.fillStyle = '#b5653a';
    ctx.beginPath();
    ctx.moveTo(c.x - 10, c.y - 18); ctx.lineTo(c.x + 10, c.y - 18);
    ctx.lineTo(c.x + 7, c.y); ctx.lineTo(c.x - 7, c.y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8f4a26';
    ctx.beginPath(); ctx.ellipse(c.x, c.y - 18, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    // 잎
    const leaves = [[-8, -30, 9], [8, -32, 9], [0, -42, 10], [-4, -50, 7], [5, -48, 7]];
    leaves.forEach(([lx, ly, r], i) => {
      ctx.fillStyle = i % 2 ? '#2f8f5b' : '#3fae6e';
      ctx.beginPath(); ctx.arc(c.x + lx, c.y + ly, r, 0, Math.PI * 2); ctx.fill();
    });
  }

  function drawStand(s, isNear) {
    const c = iso(s.x, s.y);
    const film = s.film;
    const color = film.poster_color || '#c0392b';

    // 스포트라이트
    const glow = ctx.createRadialGradient(c.x, c.y + 8, 4, c.x, c.y + 8, 70);
    glow.addColorStop(0, isNear ? 'rgba(255,225,140,0.55)' : 'rgba(255,225,140,0.25)');
    glow.addColorStop(1, 'rgba(255,225,140,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.ellipse(c.x, c.y + 8, 70, 35, 0, 0, Math.PI * 2); ctx.fill();

    // 받침대 (아이소 박스)
    const bw = 0.75, bd = 0.5, bh = 12;
    const f0 = iso(s.x - bw, s.y + bd), f1 = iso(s.x + bw, s.y + bd), f2 = iso(s.x + bw, s.y - bd), f3 = iso(s.x - bw, s.y - bd);
    const up = (p) => ({ x: p.x, y: p.y - bh });
    poly([f0, f1, up(f1), up(f0)], '#5a3a26');
    poly([f1, f2, up(f2), up(f1)], '#47301f');
    poly([up(f0), up(f1), up(f2), up(f3)], '#7a5236');

    // 팜플렛 패널
    const pw = 78, ph = 108, depth = 6;
    const px = c.x - pw / 2, py = c.y - bh - ph - 4;
    const bounce = isNear ? Math.sin(state.time * 3) * 1.5 : 0;

    // 지지대
    ctx.fillStyle = '#3b2a1e';
    ctx.fillRect(c.x - 2, c.y - bh - 8, 4, 8);

    // 옆면(두께)
    ctx.fillStyle = shade(color, -0.35);
    ctx.beginPath();
    ctx.moveTo(px + pw, py + bounce); ctx.lineTo(px + pw + depth, py + bounce + depth / 2);
    ctx.lineTo(px + pw + depth, py + ph + bounce + depth / 2); ctx.lineTo(px + pw, py + ph + bounce);
    ctx.closePath(); ctx.fill();

    // 앞면 포스터
    const g = ctx.createLinearGradient(0, py, 0, py + ph);
    g.addColorStop(0, shade(color, 0.08));
    g.addColorStop(1, shade(color, -0.25));
    ctx.fillStyle = g;
    rr(ctx, px, py + bounce, pw, ph, 3); ctx.fill();
    ctx.strokeStyle = isNear ? '#ffe28a' : '#d4a548';
    ctx.lineWidth = isNear ? 3 : 2;
    rr(ctx, px, py + bounce, pw, ph, 3); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
    rr(ctx, px + 5, py + 5 + bounce, pw - 10, ph - 10, 2); ctx.stroke();

    // 필름 아이콘 영역
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(px + 10, py + 20 + bounce, pw - 20, 34);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(px + 13 + i * 10, py + 22 + bounce, 5, 3);
      ctx.fillRect(px + 13 + i * 10, py + 49 + bounce, 5, 3);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(c.x - 6, py + 30 + bounce); ctx.lineTo(c.x + 8, py + 37 + bounce); ctx.lineTo(c.x - 6, py + 44 + bounce);
    ctx.closePath(); ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '700 8px Pretendard, sans-serif';
    ctx.fillText(`NO.${String(s.index + 1).padStart(2, '0')}`, c.x, py + 9 + bounce);

    ctx.fillStyle = '#fff';
    ctx.font = '800 11.5px Pretendard, "Apple SD Gothic Neo", sans-serif';
    const lines = wrapText(ctx, film.title, pw - 14, 2);
    lines.forEach((l, i) => ctx.fillText(l, c.x, py + 60 + i * 14 + bounce));
    if (film.director) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '500 8.5px Pretendard, sans-serif';
      const d = wrapText(ctx, film.director, pw - 14, 1)[0];
      ctx.fillText(d, c.x, py + ph - 16 + bounce);
    }

    state.standRects.push({ x: px - 4, y: py - 4, w: pw + depth + 8, h: ph + bh + 16, stand: s });

    // 상호작용 표시
    if (isNear) {
      const ay = py - 16 + Math.sin(state.time * 5) * 3;
      ctx.fillStyle = '#ffe28a';
      ctx.beginPath(); ctx.moveTo(c.x - 7, ay - 6); ctx.lineTo(c.x + 7, ay - 6); ctx.lineTo(c.x, ay + 2); ctx.closePath(); ctx.fill();
    }
  }

  function drawNameTag(x, y, text) {
    ctx.font = '700 12px Pretendard, "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 16;
    ctx.fillStyle = 'rgba(18,10,28,0.78)';
    rr(ctx, x - w / 2, y - 10, w, 20, 10); ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(text, x, y + 0.5);
  }

  function drawTargetMarker() {
    if (!state.target) return;
    const t = iso(state.target.x, state.target.y);
    const r = 10 + Math.sin(state.time * 8) * 2;
    ctx.strokeStyle = 'rgba(255,226,138,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(t.x, t.y, r, r / 2, 0, 0, Math.PI * 2); ctx.stroke();
  }

  function render() {
    const w = canvas.width, h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawBackground(w, h);

    const z = state.zoom * state.dpr;
    ctx.setTransform(z, 0, 0, z, w / 2 - state.cam.x * z, h / 2 - state.cam.y * z);

    drawWalls();
    ctx.setTransform(z, 0, 0, z, w / 2 - state.cam.x * z, h / 2 - state.cam.y * z);
    drawFloor();
    drawTargetMarker();

    const L = state.layout;
    const objs = [];
    L.plants.forEach((p) => objs.push({ k: p.x + p.y, draw: () => drawPlant(p) }));
    L.stands.forEach((s) => objs.push({ k: s.x + s.y + 0.5, draw: () => drawStand(s, s === state.near) }));
    const pl = state.player;
    objs.push({
      k: pl.x + pl.y,
      draw: () => {
        const p = iso(pl.x, pl.y);
        drawCharacter(ctx, p.x, p.y, state.look, { dir: pl.dir, walk: pl.walk, moving: pl.moving, scale: 1.05 });
      },
    });
    objs.sort((a, b) => a.k - b.k);
    state.standRects = [];
    objs.forEach((o) => o.draw());

    const p = iso(pl.x, pl.y);
    if (state.nickname) drawNameTag(p.x, p.y - 66, state.nickname);
  }

  let last = performance.now();
  let raf = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    state.time += dt;
    update(dt);
    render();
    raf = requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { state.keys.clear(); state.shift = false; });
  canvas.addEventListener('pointerdown', onPointerDown);

  resize();
  resetLayout();
  raf = requestAnimationFrame(loop);

  return {
    setFilms(films) { state.films = films; resetLayout(); },
    setLook(look, nickname) { state.look = look; state.nickname = nickname; },
    setTitle(t) { state.title = t; },
    setRunning(v) { state.run = !!v; },
    setPaused(p) { state.paused = p; state.keys.clear(); if (p) state.target = null; },
    activateNear() { if (state.near) options.onActivate?.(state.near.film); },
    destroy() { cancelAnimationFrame(raf); },
  };
}

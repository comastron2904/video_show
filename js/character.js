// 닉네임 기반 캐릭터 자동 생성 + 캔버스 드로잉

const SKINS = ['#ffe0c7', '#f9d1b0', '#eab48c', '#c98e66', '#8d5a3c'];
const HAIRS = ['#2b2018', '#4a3020', '#7a4a2a', '#c48a3f', '#e8c872', '#a83c32', '#3b4a6b', '#d9d9d9', '#e37fa6'];
const HAIR_STYLES = ['short', 'long', 'bun', 'spiky', 'cap', 'bob'];
const SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#ecf0f1', '#34495e', '#ff7aa2'];
const PANTS = ['#2c3e50', '#34495e', '#5d4037', '#1e3a5f', '#4a4a4a', '#7f8c8d'];
const ACCESSORIES = ['none', 'none', 'glasses', 'scarf', 'none', 'popcorn'];

const PROFILE_KEY = 'premiere.profile.v1';

function hashString(str) {
  let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) * 4294967296 + (h1 >>> 0);
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

export function generateLook(nickname, roll = 0) {
  const r = rng(hashString(`${nickname.trim()}#${roll}`) % 4294967296);
  const look = {
    skin: pick(r, SKINS),
    hair: pick(r, HAIRS),
    hairStyle: pick(r, HAIR_STYLES),
    shirt: pick(r, SHIRTS),
    pants: pick(r, PANTS),
    accessory: pick(r, ACCESSORIES),
    capColor: pick(r, SHIRTS),
  };
  if (look.capColor === look.shirt) look.capColor = SHIRTS[(SHIRTS.indexOf(look.shirt) + 3) % SHIRTS.length];
  return look;
}

// ---- 기기별 프로필 저장 (localStorage) ----
export function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    if (p && typeof p.nickname === 'string' && p.nickname.trim()) return { nickname: p.nickname, roll: p.roll | 0 };
  } catch { /* 저장소 사용 불가 */ }
  return null;
}

export function saveProfile(profile) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* 무시 */ }
}

// ---- 드로잉 ----
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r + 255 * amt)));
  g = Math.max(0, Math.min(255, Math.round(g + 255 * amt)));
  b = Math.max(0, Math.min(255, Math.round(b + 255 * amt)));
  return `rgb(${r},${g},${b})`;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * 캐릭터를 그립니다. (x, y) = 발 위치
 * opts.dir: 'down' | 'up' | 'left' | 'right'
 * opts.walk: 걷기 애니메이션 위상 (0이면 정지)
 */
export function drawCharacter(ctx, x, y, look, opts = {}) {
  const s = opts.scale || 1;
  const dir = opts.dir || 'down';
  const walk = opts.walk || 0;
  const moving = !!opts.moving;
  const swing = moving ? Math.sin(walk) : 0;
  const bob = moving ? Math.abs(Math.sin(walk)) * 1.5 : 0;
  const back = dir === 'up';
  const side = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);

  // 그림자
  ctx.fillStyle = 'rgba(20,10,30,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(0, -bob);
  ctx.lineJoin = 'round';

  // 다리
  const liftL = Math.max(0, swing) * 2.5, liftR = Math.max(0, -swing) * 2.5;
  ctx.fillStyle = look.pants;
  rr(ctx, -6.5, -14, 5.5, 13 - liftL, 2); ctx.fill();
  rr(ctx, 1, -14, 5.5, 13 - liftR, 2); ctx.fill();
  ctx.fillStyle = '#2a1f1a';
  rr(ctx, -7, -2.5 - liftL, 6.5, 3.5, 1.5); ctx.fill();
  rr(ctx, 0.5, -2.5 - liftR, 6.5, 3.5, 1.5); ctx.fill();

  // 팔 (몸 뒤쪽)
  ctx.fillStyle = shade(look.shirt, -0.12);
  rr(ctx, -12.5, -27 + swing * 2, 5, 12, 2.5); ctx.fill();
  rr(ctx, 7.5, -27 - swing * 2, 5, 12, 2.5); ctx.fill();
  ctx.fillStyle = look.skin;
  ctx.beginPath(); ctx.arc(-10, -15 + swing * 2, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(10, -15 - swing * 2, 2.6, 0, Math.PI * 2); ctx.fill();

  // 몸통
  ctx.fillStyle = look.shirt;
  rr(ctx, -9, -29, 18, 17, 5); ctx.fill();
  ctx.fillStyle = shade(look.shirt, -0.1);
  rr(ctx, -9, -16, 18, 4, 2); ctx.fill();

  if (look.accessory === 'scarf') {
    ctx.fillStyle = look.capColor;
    rr(ctx, -8, -30, 16, 5, 2.5); ctx.fill();
    if (!back) { rr(ctx, 2, -27, 4, 9, 2); ctx.fill(); }
  }

  // 머리
  const hx = side * 1.5, hy = -40;
  ctx.fillStyle = look.skin;
  ctx.beginPath(); ctx.arc(hx, hy, 11.5, 0, Math.PI * 2); ctx.fill();

  drawHair(ctx, look, hx, hy, back, side);

  if (!back) {
    // 눈
    const ex = side * 3;
    ctx.fillStyle = '#2b2233';
    ctx.beginPath(); ctx.ellipse(hx - 4 + ex, hy + 1, 1.6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + 4 + ex, hy + 1, 1.6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(hx - 3.5 + ex, hy, 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx + 4.5 + ex, hy, 0.6, 0, Math.PI * 2); ctx.fill();
    // 볼터치
    ctx.fillStyle = 'rgba(255,120,120,0.35)';
    ctx.beginPath(); ctx.ellipse(hx - 7 + ex, hy + 5, 2.4, 1.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + 7 + ex, hy + 5, 2.4, 1.4, 0, 0, Math.PI * 2); ctx.fill();
    // 입
    ctx.strokeStyle = '#7a3b3b'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(hx + ex, hy + 5, 1.8, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();

    if (look.accessory === 'glasses') {
      ctx.strokeStyle = '#1d1d24'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(hx - 4 + ex, hy + 1, 3.3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(hx + 4 + ex, hy + 1, 3.3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx - 0.7 + ex, hy + 1); ctx.lineTo(hx + 0.7 + ex, hy + 1); ctx.stroke();
    }
  }

  if (look.accessory === 'popcorn' && !back) {
    const px = side >= 0 ? 11 : -11, py = -16 - swing * 2;
    ctx.fillStyle = '#fff6d8';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(px - 3 + i * 2, py - 6 - (i % 2), 2.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath(); ctx.moveTo(px - 5, py - 6); ctx.lineTo(px + 5, py - 6); ctx.lineTo(px + 3.5, py + 3); ctx.lineTo(px - 3.5, py + 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(px - 1, py - 6, 2, 9);
  }

  ctx.restore();
}

function drawHair(ctx, look, hx, hy, back, side) {
  const c = look.hair;
  const style = look.hairStyle;
  ctx.fillStyle = c;

  if (style === 'cap') {
    ctx.fillStyle = c;
    if (back) { ctx.beginPath(); ctx.arc(hx, hy + 1, 11.8, Math.PI * 0.05, Math.PI * 0.95, false); ctx.fill(); }
    ctx.fillStyle = look.capColor;
    ctx.beginPath(); ctx.arc(hx, hy - 1, 12.3, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(look.capColor, -0.15);
    if (!back) {
      ctx.beginPath(); ctx.ellipse(hx + side * 6, hy - 1, 10, 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(hx, hy - 13, 1.8, 0, Math.PI * 2); ctx.fill();
    return;
  }

  if (back) {
    ctx.beginPath(); ctx.arc(hx, hy - 0.5, 12.3, 0, Math.PI * 2); ctx.fill();
    if (style === 'long') { rr(ctx, hx - 12, hy, 24, 17, 6); ctx.fill(); }
    if (style === 'bob') { rr(ctx, hx - 12.5, hy, 25, 9, 5); ctx.fill(); }
  } else {
    // 윗머리
    ctx.beginPath();
    ctx.arc(hx, hy - 1, 12.4, Math.PI * 0.95, Math.PI * 2.05);
    ctx.quadraticCurveTo(hx + 6, hy - 6, hx + side * 2, hy - 5);
    ctx.quadraticCurveTo(hx - 6, hy - 6, hx - 12.3, hy + 1);
    ctx.closePath();
    ctx.fill();

    if (style === 'long') {
      rr(ctx, hx - 13, hy - 4, 5, 20, 2.5); ctx.fill();
      rr(ctx, hx + 8, hy - 4, 5, 20, 2.5); ctx.fill();
    } else if (style === 'bob') {
      rr(ctx, hx - 13, hy - 4, 5, 12, 2.5); ctx.fill();
      rr(ctx, hx + 8, hy - 4, 5, 12, 2.5); ctx.fill();
    }
  }

  if (style === 'bun') {
    ctx.beginPath(); ctx.arc(hx, hy - 13.5, 5.2, 0, Math.PI * 2); ctx.fill();
  } else if (style === 'spiky') {
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      const bx = hx + i * 4.6;
      ctx.moveTo(bx - 3.5, hy - 9);
      ctx.lineTo(bx + side, hy - 17 + Math.abs(i));
      ctx.lineTo(bx + 3.5, hy - 9);
    }
    ctx.fill();
  }

  // 하이라이트
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.ellipse(hx - 4, hy - 8, 4, 1.8, -0.4, 0, Math.PI * 2); ctx.fill();
}

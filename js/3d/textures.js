// 절차적(코드로 그리는) 텍스처 모음 - 이미지 파일 없이 재질 질감을 만듭니다.
import * as THREE from 'three';

export const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let maxAniso = 8;
export function setMaxAnisotropy(v) { maxAniso = Math.min(16, v || 1); }

export function canvasTexture(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0xc0392b;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shadeHex(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function grain(ctx, w, h, amount, r) {
  for (let i = 0; i < amount; i++) {
    ctx.fillStyle = r() > 0.5 ? `rgba(255,255,255,${r() * 0.05})` : `rgba(0,0,0,${r() * 0.07})`;
    ctx.fillRect(r() * w, r() * h, 1.5, 1.5);
  }
}

// 대리석 바닥 — 밝은 아이보리 대형 타일 (텍스처 1장 = 2x2 타일)
function marbleVeins(ctx, x, y, size, r, color, count) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
  for (let v = 0; v < count; v++) {
    ctx.strokeStyle = color(r());
    ctx.lineWidth = 0.4 + r() * 1.6;
    ctx.beginPath();
    // 대각선 방향으로 흐르는 부드러운 결
    let px = x - 40 + r() * size * 0.6, py = y + r() * size;
    ctx.moveTo(px, py);
    for (let s = 0; s < 7; s++) {
      const nx = px + size / 6 + r() * 30, ny = py - size / 10 + (r() - 0.5) * 60;
      ctx.quadraticCurveTo(px + (nx - px) / 2 + (r() - 0.5) * 40, py + (ny - py) / 2 + (r() - 0.5) * 40, nx, ny);
      px = nx; py = ny;
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function marbleTexture() {
  return canvasTexture(1024, 1024, (ctx, w) => {
    const r = rand(11);
    const half = w / 2;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const x = i * half, y = j * half;
        // 타일마다 아주 약간씩 다른 톤 (눈에 거슬리지 않을 정도)
        const t = r() * 0.03;
        const g = ctx.createLinearGradient(x, y, x + half, y + half);
        g.addColorStop(0, `rgb(${Math.round(244 - t * 120)},${Math.round(238 - t * 120)},${Math.round(228 - t * 120)})`);
        g.addColorStop(1, `rgb(${Math.round(236 - t * 120)},${Math.round(229 - t * 120)},${Math.round(218 - t * 120)})`);
        ctx.fillStyle = g;
        ctx.fillRect(x, y, half, half);
        // 은은한 구름 무늬
        for (let c = 0; c < 18; c++) {
          const cx = x + r() * half, cy = y + r() * half, rad = 40 + r() * 120;
          const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
          cg.addColorStop(0, `rgba(205,192,172,${0.05 + r() * 0.05})`);
          cg.addColorStop(1, 'rgba(205,192,172,0)');
          ctx.fillStyle = cg;
          ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
        }
        marbleVeins(ctx, x, y, half, r, (k) => `rgba(170,152,128,${0.06 + k * 0.1})`, 5);
        marbleVeins(ctx, x, y, half, r, (k) => `rgba(196,170,120,${0.05 + k * 0.08})`, 2);
        for (let sp = 0; sp < 900; sp++) {
          ctx.fillStyle = `rgba(120,100,80,${r() * 0.025})`;
          ctx.fillRect(x + r() * half, y + r() * half, 1.5, 1.5);
        }
        // 얇은 줄눈
        ctx.strokeStyle = 'rgba(170,155,135,0.55)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, half - 2, half - 2);
      }
    }
  });
}

// 벽 쪽 테두리용 짙은 대리석 (에스프레소 톤 + 금색 줄)
export function borderMarbleTexture() {
  return canvasTexture(1024, 128, (ctx, w, h) => {
    const r = rand(77);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#3b2d2a'); g.addColorStop(1, '#2f2422');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let v = 0; v < 14; v++) {
      ctx.strokeStyle = `rgba(214,190,160,${0.05 + r() * 0.08})`;
      ctx.lineWidth = 0.5 + r() * 1.2;
      ctx.beginPath();
      let px = r() * w, py = 0;
      ctx.moveTo(px, py);
      for (let s = 0; s < 4; s++) { px += (r() - 0.3) * 120; py += h / 4; ctx.lineTo(px, py); }
      ctx.stroke();
    }
    ctx.fillStyle = '#c9a14a';
    ctx.fillRect(0, 10, w, 4);
    ctx.fillRect(0, h - 14, w, 4);
  });
}

// 레드카펫 (벨벳 결)
export function carpetTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const r = rand(5);
    ctx.fillStyle = '#8f1424';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      const v = r();
      ctx.fillStyle = v > 0.5 ? `rgba(255,80,90,${r() * 0.06})` : `rgba(30,0,5,${r() * 0.12})`;
      ctx.fillRect(r() * w, r() * h, 1, 2);
    }
  });
}

// 벽지 (다마스크 패턴)
export function wallpaperTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const r = rand(3);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3d1a2e'); g.addColorStop(1, '#351627');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // 세로 줄무늬
    for (let x = 0; x < w; x += 64) {
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      ctx.fillRect(x, 0, 32, h);
    }
    // 다마스크 모티프
    const motif = (cx, cy, s) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = 'rgba(214,170,90,0.16)';
      ctx.fillStyle = 'rgba(214,170,90,0.07)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(s * 0.7, -s * 0.6, s * 0.7, s * 0.2, 0, s);
      ctx.bezierCurveTo(-s * 0.7, s * 0.2, -s * 0.7, -s * 0.6, 0, -s);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -s * 0.15, s * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, s * 0.3);
        ctx.quadraticCurveTo(sx * s * 0.9, s * 0.1, sx * s * 0.6, -s * 0.5);
        ctx.stroke();
      }
      ctx.restore();
    };
    motif(128, 128, 70); motif(384, 128, 70);
    motif(0, 384, 70); motif(256, 384, 70); motif(512, 384, 70);
    grain(ctx, w, h, 3000, r);
  });
}

// 짙은 호두나무 결
export function woodTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const r = rand(9);
    ctx.fillStyle = '#3a2216';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      const v = Math.sin(y * 0.05 + Math.sin(y * 0.013) * 3) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(${90 + v * 40},${50 + v * 25},${30 + v * 12},${0.25 + r() * 0.2})`;
      ctx.fillRect(0, y, w, 2);
    }
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = `rgba(20,10,5,${0.1 + r() * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const y = r() * h;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 20, w * 0.7, y + (r() - 0.5) * 20, w, y + (r() - 0.5) * 10);
      ctx.stroke();
    }
  });
}

// 라운지 러그
export function rugTexture() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    const r = rand(21);
    ctx.fillStyle = '#1d2a44';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c9a14a'; ctx.lineWidth = 14;
    ctx.strokeRect(40, 40, w - 80, h - 80);
    ctx.lineWidth = 4;
    ctx.strokeRect(80, 80, w - 160, h - 160);
    ctx.strokeStyle = 'rgba(201,161,74,0.55)'; ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 60 + i * 55, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(w / 2, h / 2);
    for (let i = 0; i < 16; i++) {
      ctx.rotate(Math.PI / 8);
      ctx.beginPath(); ctx.moveTo(60, 0); ctx.lineTo(340, 0); ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < 20000; i++) {
      ctx.fillStyle = r() > 0.5 ? `rgba(255,255,255,${r() * 0.05})` : `rgba(0,0,0,${r() * 0.12})`;
      ctx.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
  });
}

// 줄무늬 (팝콘 통 / 매대 전면)
export function stripeTexture(a = '#c8102e', b = '#f7f1e3', count = 10) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const sw = w / count;
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = i % 2 ? b : a;
      ctx.fillRect(i * sw, 0, sw, h);
    }
  });
}

function fitFont(ctx, text, weight, maxSize, maxWidth) {
  let size = maxSize;
  do {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  } while (size > 10);
  return size;
}

function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  // 너무 긴 단어는 글자 단위로 자르기
  const out = [];
  for (const l of lines) {
    if (ctx.measureText(l).width <= maxWidth) { out.push(l); continue; }
    let part = '';
    for (const ch of Array.from(l)) {
      if (ctx.measureText(part + ch).width > maxWidth && part) { out.push(part); part = ch; }
      else part += ch;
    }
    if (part) out.push(part);
  }
  if (out.length > maxLines) {
    const kept = out.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (ctx.measureText(last + '…').width > maxWidth && last.length) last = last.slice(0, -1);
    kept[maxLines - 1] = last + '…';
    return kept;
  }
  return out;
}

// 영화 포스터 (라이트박스에 들어갈 이미지)
// img(썸네일)가 있으면 썸네일을 꽉 채우고 아래에 제목을 얹고, 없으면 자동으로 포스터를 그립니다.
const POSTER_SCALE = 1.5; // 600x900 기준 좌표로 그리고 1.5배 해상도로 저장

function coverImage(ctx, img, w, h) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const sc = Math.max(w / iw, h / ih);
  const dw = iw * sc, dh = ih * sc;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawThumbnailPoster(ctx, w, h, film, index, eventTitle, img) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  coverImage(ctx, img, w, h);
  // 위·아래 그라데이션 (글자 가독성)
  const top = ctx.createLinearGradient(0, 0, 0, 120);
  top.addColorStop(0, 'rgba(0,0,0,0.55)'); top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top; ctx.fillRect(0, 0, w, 120);
  const bot = ctx.createLinearGradient(0, h * 0.55, 0, h);
  bot.addColorStop(0, 'rgba(0,0,0,0)'); bot.addColorStop(0.45, 'rgba(0,0,0,0.6)'); bot.addColorStop(1, 'rgba(0,0,0,0.88)');
  ctx.fillStyle = bot; ctx.fillRect(0, h * 0.55, w, h * 0.45);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText(`NO.${String(index + 1).padStart(2, '0')}  ·  WORLD PREMIERE`, w / 2, 52);

  ctx.font = `800 62px ${FONT}`;
  let size = 62;
  let lines = wrapLines(ctx, film.title || '', w - 70, 2);
  while (size > 38 && lines.some((l) => ctx.measureText(l).width > w - 70)) {
    size -= 4; ctx.font = `800 ${size}px ${FONT}`; lines = wrapLines(ctx, film.title || '', w - 70, 2);
  }
  const lineH = size * 1.15;
  let ty = h - 130 - (lines.length - 1) * lineH;
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 16;
  ctx.fillStyle = '#fff';
  for (const l of lines) { ctx.fillText(l, w / 2, ty); ty += lineH; }
  ctx.shadowBlur = 0;
  const meta = [film.director ? `감독 ${film.director}` : '', film.runtime || ''].filter(Boolean).join('   |   ');
  if (meta) {
    fitFont(ctx, meta, 600, 26, w - 70);
    ctx.fillStyle = 'rgba(255,236,200,0.95)';
    ctx.fillText(meta, w / 2, h - 72);
  }
  ctx.font = `700 15px ${FONT}`;
  ctx.fillStyle = 'rgba(255,226,140,0.85)';
  ctx.fillText('NOW SHOWING', w / 2, h - 34);
}

function drawGeneratedPoster(ctx, w, h, film, index, eventTitle) {
  const color = film.poster_color || '#c0392b';
    const r = rand(1000 + index * 77);
    // 배경
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, shadeHex(color, 0.12));
    g.addColorStop(0.55, color);
    g.addColorStop(1, shadeHex(color, -0.38));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // 빛줄기
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 5; i++) {
      const x = r() * w;
      const lg = ctx.createLinearGradient(x, 0, x + 120, h * 0.7);
      lg.addColorStop(0, 'rgba(255,255,255,0.20)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + 30 + r() * 40, 0);
      ctx.lineTo(x + 260, h * 0.75); ctx.lineTo(x + 160, h * 0.75);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // 중앙 그래픽: 겹친 원 + 실루엣 지평선
    const cx = w * (0.35 + r() * 0.3), cy = h * 0.36;
    const rg = ctx.createRadialGradient(cx, cy, 10, cx, cy, 230);
    rg.addColorStop(0, 'rgba(255,240,210,0.85)');
    rg.addColorStop(0.35, 'rgba(255,220,170,0.35)');
    rg.addColorStop(1, 'rgba(255,220,170,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(cx, cy, 230, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,248,235,0.92)';
    ctx.beginPath(); ctx.arc(cx, cy, 70 + r() * 30, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = shadeHex(color, -0.5);
    ctx.beginPath();
    ctx.moveTo(0, h * 0.58);
    let x = 0;
    while (x < w) {
      const nx = x + 30 + r() * 60;
      ctx.lineTo(nx, h * (0.47 + r() * 0.1));
      x = nx;
    }
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    // 작은 인물 실루엣
    const fx = w * (0.3 + r() * 0.4), fy = h * 0.6;
    ctx.fillStyle = 'rgba(10,5,10,0.9)';
    ctx.beginPath(); ctx.arc(fx, fy - 46, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(fx - 8, fy - 36, 16, 36);

    // 하단 어둡게
    const bg = ctx.createLinearGradient(0, h * 0.55, 0, h);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);

    // 텍스트
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(`NO.${String(index + 1).padStart(2, '0')}  ·  WORLD PREMIERE`, w / 2, 58);

    const title = film.title || '';
    ctx.font = `800 64px ${FONT}`;
    let size = 64;
    let lines = wrapLines(ctx, title, w - 80, 2);
    while (lines.length > 1 && size > 40 && lines.some((l) => ctx.measureText(l).width > w - 80)) {
      size -= 4; ctx.font = `800 ${size}px ${FONT}`; lines = wrapLines(ctx, title, w - 80, 2);
    }
    const lineH = size * 1.15;
    let ty = h - 190 - (lines.length - 1) * lineH;
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffffff';
    for (const l of lines) { ctx.fillText(l, w / 2, ty); ty += lineH; }
    ctx.shadowBlur = 0;

    const meta = [film.director ? `감독 ${film.director}` : '', film.runtime || ''].filter(Boolean).join('   |   ');
    if (meta) {
      fitFont(ctx, meta, 600, 26, w - 80);
      ctx.fillStyle = 'rgba(255,236,200,0.9)';
      ctx.fillText(meta, w / 2, h - 130);
    }

    // 빌링 블록 느낌의 크레딧 라인
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `500 13px ${FONT}`;
    const credit = `${eventTitle || 'ONLINE PREMIERE'} PRESENTS  ·  A FILM BY ${film.director || 'DIRECTOR'}  ·  SCREENING SELECTION`;
    fitFont(ctx, credit, 500, 14, w - 70);
    ctx.fillText(credit, w / 2, h - 74);
    ctx.fillRect(w / 2 - 120, h - 58, 240, 1);
    ctx.font = `700 15px ${FONT}`;
    ctx.fillStyle = 'rgba(255,226,140,0.8)';
    ctx.fillText('NOW SHOWING', w / 2, h - 34);

    grain(ctx, w, h, 9000, r);
  }

// 포스터 비율: 썸네일이 있으면 썸네일 비율(세로 1:2 ~ 가로 2:1 사이), 없으면 세로 2:3
export function posterAspect(img) {
  if (!img) return 2 / 3;
  const a = (img.naturalWidth || img.width) / (img.naturalHeight || img.height);
  return Math.max(0.5, Math.min(2, a || 2 / 3));
}

function drawPoster(ctx, film, index, eventTitle, img, w, h) {
  ctx.save();
  ctx.setTransform(POSTER_SCALE, 0, 0, POSTER_SCALE, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (img) drawThumbnailPoster(ctx, w, h, film, index, eventTitle, img);
  else drawGeneratedPoster(ctx, w, h, film, index, eventTitle);
  ctx.restore();
}

// 짧은 변을 600 으로 두고 비율에 맞춘 포스터 캔버스
export function posterTexture(film, index, eventTitle, img = null) {
  const aspect = posterAspect(img);
  const w = aspect <= 1 ? 600 : Math.round(600 * aspect);
  const h = aspect <= 1 ? Math.round(600 / aspect) : 600;
  return canvasTexture(w * POSTER_SCALE, h * POSTER_SCALE, (ctx) => drawPoster(ctx, film, index, eventTitle, img, w, h));
}

// 썸네일 이미지 불러오기 (CORS 허용 안 되거나 실패하면 null → 자동 포스터)
export function loadThumbnail(url, timeoutMs = 6000) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u) && !u.startsWith('blob:')) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { img.src = ''; resolve(null); }, timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => {
      clearTimeout(timer);
      console.warn('[premiere] 썸네일을 불러오지 못했습니다 (주소 또는 CORS 문제):', u);
      resolve(null);
    };
    img.src = u;
  });
}

// 전광판(마키) 텍스트
export function marqueeTexture(title) {
  return canvasTexture(1024, 192, (ctx, w, h) => {
    ctx.fillStyle = '#0c0610';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,214,120,0.75)';
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText('★  NOW SHOWING  ★', w / 2, 34);
    const t = title || 'ONLINE PREMIERE';
    fitFont(ctx, t, 800, 84, w - 80);
    ctx.shadowColor = '#ffcf5a'; ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffeec2';
    ctx.fillText(t, w / 2, h / 2 + 22);
  });
}

// 포토월 (스텝 앤 리피트)
export function photoWallTexture(title) {
  return canvasTexture(1024, 560, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f8f4ee'); g.addColorStop(1, '#ece4d8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const t = (title || 'ONLINE PREMIERE').toUpperCase();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cols = 4, rows = 6;
    for (let row = 0; row < rows; row++) {
      for (let col = -1; col <= cols; col++) {
        const x = (col + 0.5 + (row % 2 ? 0.5 : 0)) * (w / cols);
        const y = (row + 0.5) * (h / rows);
        if (row % 2) {
          ctx.fillStyle = '#b08a3e';
          ctx.font = `800 20px ${FONT}`;
          ctx.fillText('★ PREMIERE ★', x, y);
        } else {
          ctx.fillStyle = '#2a1430';
          fitFont(ctx, t, 800, 24, w / cols - 30);
          ctx.fillText(t, x, y);
        }
      }
    }
  });
}

export function signTexture(text, { bg = '#5a0f1c', fg = '#ffe3a0', w = 512, h = 128 } = {}) {
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d4a548'; ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitFont(ctx, text, 800, Math.round(h * 0.52), w - 60);
    ctx.shadowColor = fg; ctx.shadowBlur = 16;
    ctx.fillStyle = fg;
    ctx.fillText(text, w / 2, h / 2 + 3);
  });
}

// 바닥 접지 그림자용 부드러운 원
export function softShadowTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { srgb: false });
}

// 바닥 빛웅덩이(스포트라이트 느낌 보강)
export function glowTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,220,150,0.9)');
    g.addColorStop(0.4, 'rgba(255,200,120,0.35)');
    g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

// 명예의 거리 별 타일
export function starTileTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#3a2430'); g.addColorStop(1, '#2a1822');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#b8893a'; ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    const star = (cx, cy, R, r) => {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 ? r : R;
        ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      ctx.closePath();
    };
    star(w / 2, h / 2 + 6, 100, 42);
    ctx.fillStyle = '#e8a6b4'; ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = '#d4a548'; ctx.stroke();
    star(w / 2, h / 2 + 6, 70, 29);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(212,165,72,0.6)'; ctx.stroke();
  });
}

// 벽에 거는 빈티지 영화 포스터
const VINTAGE = [
  { t: 'SILVER SCREEN', s: '은막의 밤', bg: '#1f3b5c', fg: '#f3d9a4' },
  { t: 'MIDNIGHT REEL', s: '자정의 필름', bg: '#4a1a2a', fg: '#ffd27a' },
  { t: 'THE FINAL CUT', s: '마지막 장면', bg: '#20332a', fg: '#f0e6c8' },
  { t: 'STARLIGHT', s: '별빛 극장', bg: '#3a2a52', fg: '#ffe9b0' },
  { t: 'OPENING NIGHT', s: '개봉 첫날', bg: '#5a2e16', fg: '#ffe2a6' },
  { t: 'CINEMA PARADISE', s: '시네마 천국', bg: '#17323a', fg: '#f6d38a' },
  { t: 'GOLDEN ERA', s: '황금시대', bg: '#2d2418', fg: '#e9c46a' },
  { t: 'LIGHTS · CAMERA', s: '조명, 카메라', bg: '#3b1d3f', fg: '#ffd6e0' },
];
export function vintagePosterTexture(i) {
  const v = VINTAGE[i % VINTAGE.length];
  return canvasTexture(400, 600, (ctx, w, h) => {
    const r = rand(500 + i * 13);
    ctx.fillStyle = v.bg;
    ctx.fillRect(0, 0, w, h);
    // 선버스트
    ctx.save();
    ctx.translate(w / 2, h * 0.42);
    for (let k = 0; k < 24; k++) {
      ctx.rotate((Math.PI * 2) / 24);
      ctx.fillStyle = k % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(420, -55); ctx.lineTo(420, 55); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // 원형 엠블럼
    ctx.strokeStyle = v.fg; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(w / 2, h * 0.42, 95, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(w / 2, h * 0.42, 80, 0, Math.PI * 2); ctx.stroke();
    // 필름 릴
    ctx.fillStyle = v.fg;
    ctx.beginPath(); ctx.arc(w / 2, h * 0.42, 52, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = v.bg;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + r();
      ctx.beginPath(); ctx.arc(w / 2 + Math.cos(a) * 30, h * 0.42 + Math.sin(a) * 30, 11, 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(w / 2, h * 0.42, 8, 0, Math.PI * 2); ctx.fill();
    // 텍스트
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = v.fg;
    ctx.font = `800 20px ${FONT}`;
    ctx.fillText('★ ★ ★', w / 2, 52);
    fitFont(ctx, v.t, 800, 44, w - 50);
    ctx.fillText(v.t, w / 2, h * 0.73);
    ctx.font = `600 22px ${FONT}`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(v.s, w / 2, h * 0.8);
    ctx.globalAlpha = 1;
    ctx.fillRect(w / 2 - 80, h * 0.86, 160, 2);
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText('A CLASSIC PICTURE · NOW PLAYING', w / 2, h * 0.9);
    ctx.strokeStyle = v.fg; ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    grain(ctx, w, h, 6000, r);
  });
}

// 입구 환영 입간판
export function welcomeTexture(title) {
  return canvasTexture(512, 720, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2a1434'); g.addColorStop(1, '#14091c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d4a548'; ctx.lineWidth = 10;
    ctx.strokeRect(18, 18, w - 36, h - 36);
    ctx.lineWidth = 2;
    ctx.strokeRect(34, 34, w - 68, h - 68);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e5b95c';
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText('WELCOME', w / 2, 110);
    ctx.fillStyle = '#ffffff';
    fitFont(ctx, title || 'ONLINE PREMIERE', 800, 54, w - 100);
    ctx.fillText(title || 'ONLINE PREMIERE', w / 2, 200);
    ctx.fillStyle = '#e5b95c';
    ctx.fillRect(w / 2 - 70, 250, 140, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText('시사회에 오신 것을', w / 2, 340);
    ctx.fillText('환영합니다', w / 2, 385);
    ctx.font = `500 22px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('팜플렛 앞에서 시청하기를 눌러', w / 2, 480);
    ctx.fillText('작품을 감상하세요', w / 2, 515);
    ctx.fillStyle = '#e5b95c';
    ctx.font = `800 40px ${FONT}`;
    ctx.fillText('★', w / 2, 620);
  });
}

// 상영관 출입문 위 표지판
export function doorSignTexture(label) {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#0d0710';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitFont(ctx, label, 800, 60, w - 40);
    ctx.shadowColor = '#7fd8ff'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#d8f3ff';
    ctx.fillText(label, w / 2, h / 2 + 3);
  });
}

export function exitSignTexture() {
  return canvasTexture(256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#0e7a3e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#eafff1';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 44px ${FONT}`;
    ctx.fillText('EXIT 비상구', w / 2, h / 2 + 2);
  });
}

// 바닥 원 안에 표시할 인기투표 번호 (빨간 숫자만)
export function voteNumberTexture(num) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = String(num);
    fitFont(ctx, text, 900, 300, w * 0.78);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeText(text, w / 2, h / 2 + 10);
    ctx.fillStyle = '#e0202e';
    ctx.fillText(text, w / 2, h / 2 + 10);
  });
}

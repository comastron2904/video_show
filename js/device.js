// 기기 식별
// 1) 기기 고유 ID: 처음 접속할 때 무작위로 만들고 localStorage · 쿠키 · IndexedDB 세 곳에 저장합니다.
//    한 곳이 지워져도 나머지에서 되살려서 같은 기기로 인식합니다. (투표 1회 제한의 기준)
// 2) 기기 정보 지문: 브라우저·화면·그래픽카드 정보로 만든 요약값. 관리자 화면에서 중복 의심 참고용입니다.
//    같은 기종 휴대폰은 지문이 같을 수 있어 이것만으로 막지는 않습니다.

const KEY = 'premiere.device.v1';
const COOKIE = 'premiere_device';

function readCookie() {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function writeCookie(v) {
  try { document.cookie = `${COOKIE}=${encodeURIComponent(v)}; max-age=${60 * 60 * 24 * 400}; path=/; SameSite=Lax; Secure`; } catch { /* 무시 */ }
}

function idb() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('premiere', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function idbGet(key) {
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const r = db.transaction('kv').objectStore('kv').get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function idbSet(key, value) {
  const db = await idb();
  if (!db) return;
  try { db.transaction('kv', 'readwrite').objectStore('kv').put(value, key); } catch { /* 무시 */ }
}

function newId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return 'dv_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

let idPromise = null;
export function getDeviceId() {
  if (idPromise) return idPromise;
  idPromise = (async () => {
    let fromLs = null;
    try { fromLs = localStorage.getItem(KEY); } catch { /* 무시 */ }
    const found = fromLs || readCookie() || (await idbGet(KEY));
    const id = found && /^dv_[0-9a-f]{32}$/.test(found) ? found : newId();
    try { localStorage.setItem(KEY, id); } catch { /* 무시 */ }
    writeCookie(id);
    idbSet(KEY, id);
    return id;
  })();
  return idPromise;
}

export async function getFingerprint() {
  const parts = [
    navigator.userAgent, navigator.language, navigator.platform,
    navigator.hardwareConcurrency, navigator.deviceMemory, navigator.maxTouchPoints,
    screen.width, screen.height, screen.colorDepth, window.devicePixelRatio,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) parts.push(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL), gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch { /* 무시 */ }
  const text = parts.map((p) => String(p ?? '')).join('|');
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  } catch {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
    return 'h' + (h >>> 0).toString(16);
  }
}

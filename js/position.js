// 기기별 마지막 위치 저장/복원 (localStorage)
export function loadPosition(key) {
  try {
    const p = JSON.parse(localStorage.getItem(key) || 'null');
    if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) return p;
  } catch { /* 저장소 사용 불가 */ }
  return null;
}

// getter() 가 돌려주는 위치를 주기적으로, 그리고 페이지를 떠날 때 저장
export function autoSavePosition(key, getter, intervalMs = 1500) {
  let lastSaved = '';
  const save = () => {
    try {
      const p = getter();
      if (!p) return;
      const json = JSON.stringify({ x: +p.x.toFixed(3), z: +p.z.toFixed(3), yaw: +(p.yaw || 0).toFixed(3) });
      if (json !== lastSaved) { localStorage.setItem(key, json); lastSaved = json; }
    } catch { /* 무시 */ }
  };
  const timer = setInterval(save, intervalMs);
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  return { save, stop() { clearInterval(timer); } };
}

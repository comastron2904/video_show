// 격자 기반 A* 길찾기 (클릭/터치 이동용). 장애물은 AABB 목록으로 받습니다.

export function createNavGrid(width, depth, colliders, { cell = 0.25, radius = 0.3, margin = 0.4 } = {}) {
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(depth / cell);
  const blocked = new Uint8Array(cols * rows);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * cell, z = (r + 0.5) * cell;
      let b = x < margin || z < margin || x > width - margin || z > depth - margin;
      if (!b) {
        for (const o of colliders) {
          if (x > o.x0 - radius && x < o.x1 + radius && z > o.z0 - radius && z < o.z1 + radius) { b = true; break; }
        }
      }
      blocked[r * cols + c] = b ? 1 : 0;
    }
  }

  const toCell = (x, z) => [Math.min(cols - 1, Math.max(0, Math.floor(x / cell))), Math.min(rows - 1, Math.max(0, Math.floor(z / cell)))];
  const isFree = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && !blocked[r * cols + c];

  function nearestFree(c, r) {
    if (isFree(c, r)) return [c, r];
    for (let rad = 1; rad < Math.max(cols, rows); rad++) {
      let best = null, bestD = Infinity;
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
          if (isFree(c + dc, r + dr)) {
            const d = dc * dc + dr * dr;
            if (d < bestD) { bestD = d; best = [c + dc, r + dr]; }
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  function lineFree(x0, z0, x1, z1) {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(dist / (cell * 0.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / Math.max(1, steps);
      const [c, r] = toCell(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
      if (!isFree(c, r)) return false;
    }
    return true;
  }

  function findPath(sx, sz, tx, tz) {
    const start = nearestFree(...toCell(sx, sz));
    const goal = nearestFree(...toCell(tx, tz));
    if (!start || !goal) return null;
    const gx = goal[0], gr = goal[1];
    const goalPoint = isFree(...toCell(tx, tz)) ? [tx, tz] : [(gx + 0.5) * cell, (gr + 0.5) * cell];
    if (lineFree(sx, sz, goalPoint[0], goalPoint[1])) return [{ x: goalPoint[0], z: goalPoint[1] }];

    const N = cols * rows;
    const gScore = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = [];
    const push = (i, f) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]]; k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
        }
      }
      return top;
    };
    const h = (c, r) => {
      const dx = Math.abs(c - gx), dy = Math.abs(r - gr);
      return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };

    const si = start[1] * cols + start[0];
    gScore[si] = 0;
    push(si, h(start[0], start[1]));
    const goalI = gr * cols + gx;
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

    let found = false;
    while (heap.length) {
      const [, i] = pop();
      if (closed[i]) continue;
      if (i === goalI) { found = true; break; }
      closed[i] = 1;
      const c = i % cols, r = (i / cols) | 0;
      for (const [dc, dr, cost] of DIRS) {
        const nc = c + dc, nr = r + dr;
        if (!isFree(nc, nr)) continue;
        if (dc && dr && (!isFree(c + dc, r) || !isFree(c, r + dr))) continue; // 모서리 끼임 방지
        const ni = nr * cols + nc;
        const ng = gScore[i] + cost;
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = i;
          push(ni, ng + h(nc, nr));
        }
      }
    }
    if (!found) return null;

    const cells = [];
    for (let i = goalI; i !== -1; i = came[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map((i) => ({ x: ((i % cols) + 0.5) * cell, z: (((i / cols) | 0) + 0.5) * cell }));
    pts[pts.length - 1] = { x: goalPoint[0], z: goalPoint[1] };

    // 시야가 트인 지점은 건너뛰어 경로를 매끄럽게
    const smooth = [];
    let ax = sx, az = sz, k = 0;
    while (k < pts.length) {
      let far = k;
      for (let j = pts.length - 1; j > k; j--) {
        if (lineFree(ax, az, pts[j].x, pts[j].z)) { far = j; break; }
      }
      smooth.push(pts[far]);
      ax = pts[far].x; az = pts[far].z;
      k = far + 1;
    }
    return smooth;
  }

  return { findPath, cols, rows, cell };
}

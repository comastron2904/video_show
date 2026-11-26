// 움직이지 않는 물체들을 재질별로 하나의 메시로 합칩니다.
// 수백 개의 작은 부품(잎, 의자, 장식 등)을 몇십 개로 줄여 그리기 횟수를 크게 줄입니다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP = ['position', 'normal', 'uv'];

function isExcluded(obj, exclude) {
  for (let o = obj; o; o = o.parent) if (exclude.has(o)) return true;
  return false;
}

export function bakeStatic(scene, exclude = new Set()) {
  scene.updateMatrixWorld(true);
  const buckets = new Map();

  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
    if (Array.isArray(o.material) || o.material.transparent) return; // 투명/다중 재질은 그대로 둠
    if (isExcluded(o, exclude)) return;
    if (o.matrixWorld.determinant() < 0) return;
    const src = o.geometry;
    if (!src.attributes.position || !src.attributes.normal || !src.attributes.uv) return;
    const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
    let b = buckets.get(key);
    if (!b) { b = { material: o.material, cast: o.castShadow, receive: o.receiveShadow, geos: [], meshes: [] }; buckets.set(key, b); }
    b.meshes.push(o);
  });

  let before = 0, after = 0;
  for (const b of buckets.values()) {
    before += b.meshes.length;
    if (b.meshes.length < 2) { after += b.meshes.length; continue; }
    const geos = b.meshes.map((m) => {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
      g.morphAttributes = {};
      g.clearGroups();
      g.applyMatrix4(m.matrixWorld);
      return g;
    });
    let merged = null;
    try { merged = mergeGeometries(geos, false); } catch { merged = null; }
    geos.forEach((g) => g.dispose());
    if (!merged) { after += b.meshes.length; continue; }
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    for (const m of b.meshes) m.parent?.remove(m);
    after += 1;
  }
  return { before, after };
}

// 장식용 조명(포인트/스포트)을 모두 제거 → 픽셀마다 계산할 조명 수를 크게 줄임
export function stripDecorLights(scene) {
  const lights = [];
  scene.traverse((o) => { if (o.isPointLight || o.isSpotLight) lights.push(o); });
  for (const l of lights) {
    if (l.target && l.target.parent) l.target.parent.remove(l.target);
    l.parent?.remove(l);
  }
  return lights.length;
}

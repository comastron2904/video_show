// 시사회장 소품 (매표소, 팝콘 매대, 차단봉, 라운지, 포토월, 팜플렛 라이트박스 등)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  woodTexture, stripeTexture, signTexture, photoWallTexture, rugTexture, glowTexture, posterTexture, posterAspect,
  starTileTexture, vintagePosterTexture, welcomeTexture, doorSignTexture, exitSignTexture,
} from './textures.js';

export function createMaterials() {
  const wood = woodTexture();
  return {
    gold: new THREE.MeshStandardMaterial({ color: 0xd4a548, metalness: 1, roughness: 0.28 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8893a, metalness: 1, roughness: 0.4 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.15 }),
    black: new THREE.MeshStandardMaterial({ color: 0x141016, metalness: 0.3, roughness: 0.35 }),
    blackMatte: new THREE.MeshStandardMaterial({ color: 0x1b161d, roughness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.45, metalness: 0 }),
    woodDark: new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.5 }),
    velvetRed: new THREE.MeshPhysicalMaterial({ color: 0x8a1022, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(0xff5a6e), sheenRoughness: 0.4 }),
    velvetGreen: new THREE.MeshPhysicalMaterial({ color: 0x0f4a3e, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(0x5ad6b0), sheenRoughness: 0.45 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.18, clearcoat: 1 }),
    marbleWhite: new THREE.MeshStandardMaterial({ color: 0xf1ebe2, roughness: 0.18 }),
    cream: new THREE.MeshStandardMaterial({ color: 0xf3e9d6, roughness: 0.6 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x2f7d4f, roughness: 0.6, side: THREE.DoubleSide }),
    leafLight: new THREE.MeshStandardMaterial({ color: 0x4a9d62, roughness: 0.6, side: THREE.DoubleSide }),
    pot: new THREE.MeshStandardMaterial({ color: 0x1e1a1c, roughness: 0.3, metalness: 0.2 }),
    soil: new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 1 }),
    bulb: new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffd27a, emissiveIntensity: 4 }),
    bulbDim: new THREE.MeshStandardMaterial({ color: 0xc9a979, emissive: 0xffb84a, emissiveIntensity: 0.6 }),
    popcorn: new THREE.MeshStandardMaterial({ color: 0xffe7a3, roughness: 0.8, emissive: 0x3a2a00, emissiveIntensity: 0.4 }),
    stripes: new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.5 }),
    white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
    softbox: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 1.6 }),
    glow: new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 }),
  };
}

function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// ---------------- 팜플렛 라이트박스 ----------------
export function buildStand(film, index, eventTitle, M, { withLight = true, scale = 1.6, img = null } = {}) {
  const g = new THREE.Group();
  const accent = new THREE.Color(film.poster_color || '#c0392b');

  // 프레임 크기: 썸네일 비율에 맞춤 (세로형은 높이 2.4, 가로형은 너비 2.8 기준)
  const aspect = posterAspect(img);
  const inner = aspect <= 1 ? { w: 2.26 * aspect, h: 2.26 } : { w: 2.66, h: 2.66 / aspect };
  const fw = inner.w + 0.14, fh = inner.h + 0.14, fd = 0.12;
  const lift = 0.32;
  const baseW = fw + 0.2;

  // 받침
  const base = mesh(new RoundedBoxGeometry(baseW, 0.09, 0.72, 3, 0.035), M.black);
  base.position.y = 0.045;
  g.add(base);
  for (const sx of [-baseW * 0.33, baseW * 0.33]) {
    const leg = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 12), M.chrome);
    leg.position.set(sx, 0.2, 0);
    g.add(leg);
  }

  // 프레임
  const frame = mesh(new RoundedBoxGeometry(fw, fh, fd, 3, 0.025), M.gold);
  frame.position.y = lift + fh / 2;
  g.add(frame);
  const back = mesh(new THREE.BoxGeometry(fw - 0.07, fh - 0.07, fd + 0.002), M.black);
  back.position.copy(frame.position);
  g.add(back);

  // 포스터 (라이트박스: 스스로 빛나는 면)
  const tex = posterTexture(film, index, eventTitle, img);
  const posterMat = new THREE.MeshStandardMaterial({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.6, roughness: 0.3,
  });
  const poster = mesh(new THREE.PlaneGeometry(fw - 0.14, fh - 0.14), posterMat, { cast: false });
  poster.position.set(0, frame.position.y, fd / 2 + 0.003);
  g.add(poster);

  // 위쪽 조명 바
  const lampArm = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.4, 8), M.brass);
  lampArm.rotation.x = Math.PI / 2;
  lampArm.position.set(0, lift + fh + 0.05, 0.2);
  g.add(lampArm);
  const lampHead = mesh(new THREE.CylinderGeometry(0.06, 0.085, 0.14, 16), M.brass);
  lampHead.position.set(0, lift + fh + 0.03, 0.4);
  lampHead.rotation.x = -0.6;
  g.add(lampHead);

  // 바닥 빛웅덩이 + 상호작용 링
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.0), M.glow.clone());
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(0, 0.03, 0.95);
  glow.renderOrder = 2;
  g.add(glow);

  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.68, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.04, 1.2);
  g.add(ring);

  // 포인트 컬러 띠 (받침 앞)
  const band = mesh(new THREE.BoxGeometry(baseW - 0.2, 0.022, 0.01), new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.6 }), { cast: false });
  band.position.set(0, 0.068, 0.365);
  g.add(band);

  let spot = null;
  if (withLight) {
    spot = new THREE.SpotLight(0xffe2b0, 22, 0, 0.5, 0.65, 2);
    spot.position.set(0, 4.2, 2.2);
    spot.target.position.set(0, 1.4, 0);
    g.add(spot, spot.target);
  }

  // 전체 크기 배율 (1.6 → 세로 포스터 약 2.6m × 3.8m, 가로 포스터 약 4.5m × 2.6m)
  g.scale.setScalar(scale);

  const pickables = [frame, poster, back];
  return { group: g, size: { w: (baseW + 0.05) * scale, d: 0.78 * scale }, frontOffset: 1.2 * scale, poster: posterMat, ring: ringMat, glow: glow.material, spot, pickables };
}

// ---------------- 벨벳 차단봉 ----------------
export function buildStanchion(M) {
  const g = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 32), M.gold);
  base.position.y = 0.02;
  const pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.88, 16), M.gold);
  pole.position.y = 0.48;
  const top = mesh(new THREE.SphereGeometry(0.055, 20, 14), M.gold);
  top.position.y = 0.95;
  g.add(base, pole, top);
  return g;
}

export function buildRope(a, b, M) {
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  mid.y -= 0.22;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  return mesh(new THREE.TubeGeometry(curve, 24, 0.028, 10, false), M.velvetRed);
}

// ---------------- 화분 ----------------
export function buildPlant(M, scale = 1) {
  const g = new THREE.Group();
  const pot = mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.5, 24), M.pot);
  pot.position.y = 0.25;
  const rim = mesh(new THREE.TorusGeometry(0.235, 0.018, 8, 32), M.gold);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.5;
  const soil = mesh(new THREE.CircleGeometry(0.22, 24), M.soil, { cast: false });
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.47;
  g.add(pot, rim, soil);

  const trunk = mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.9, 8), M.woodDark);
  trunk.position.y = 0.9;
  g.add(trunk);
  const leafGeo = new THREE.SphereGeometry(0.13, 12, 8);
  leafGeo.scale(1, 0.18, 0.62);
  let seed = 3;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < 26; i++) {
    const leaf = mesh(leafGeo, rnd() > 0.5 ? M.leaf : M.leafLight);
    const h = 0.75 + rnd() * 0.85;
    const ang = rnd() * Math.PI * 2;
    const rad = 0.12 + (1 - Math.abs(h - 1.25) / 0.6) * 0.22 * rnd() + 0.05;
    leaf.position.set(Math.cos(ang) * rad, h, Math.sin(ang) * rad);
    leaf.rotation.set(rnd() * 0.8 - 0.4, -ang, -0.5 - rnd() * 0.5);
    g.add(leaf);
  }
  g.scale.setScalar(scale);
  return { group: g, size: { w: 0.55 * scale, d: 0.55 * scale } };
}

// ---------------- 매표소 ----------------
export function buildTicketBooth(M) {
  const g = new THREE.Group();
  const W = 2.4, D = 1.3;
  const counter = mesh(new RoundedBoxGeometry(W, 1.05, D, 3, 0.04), M.wood);
  counter.position.y = 0.525;
  g.add(counter);
  // 전면 패널 장식
  for (const x of [-0.8, 0, 0.8]) {
    const panel = mesh(new THREE.BoxGeometry(0.66, 0.7, 0.02), M.woodDark);
    panel.position.set(x, 0.5, D / 2 + 0.005);
    const trim = mesh(new THREE.BoxGeometry(0.7, 0.74, 0.012), M.gold);
    trim.position.set(x, 0.5, D / 2 + 0.002);
    g.add(trim, panel);
  }
  const top = mesh(new THREE.BoxGeometry(W + 0.1, 0.05, D + 0.1), M.marbleWhite);
  top.position.y = 1.075;
  g.add(top);
  // 유리 칸막이
  const glass = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.95, 0.02), M.glass);
  glass.position.set(0, 1.6, 0.25);
  g.add(glass);
  for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) {
    const post = mesh(new THREE.BoxGeometry(0.06, 1.5, 0.06), M.gold);
    post.position.set(x, 1.85, 0.25);
    g.add(post);
  }
  // 캐노피 + 간판
  const canopy = mesh(new RoundedBoxGeometry(W + 0.3, 0.42, D + 0.25, 3, 0.04), M.velvetRed);
  canopy.position.set(0, 2.78, 0.05);
  g.add(canopy);
  const signTex = signTexture('TICKETS · 매표소');
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.9 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.36), signMat);
  sign.position.set(0, 2.78, D / 2 + 0.185);
  g.add(sign);
  // 캐노피 전구
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 10, 8), M.bulb, 13);
  for (let i = 0; i < 13; i++) {
    const m = new THREE.Matrix4().makeTranslation(-W / 2 + (i / 12) * W, 2.54, D / 2 + 0.2);
    bulbs.setMatrixAt(i, m);
  }
  g.add(bulbs);
  // 계산대 소품
  const register = mesh(new RoundedBoxGeometry(0.42, 0.22, 0.34, 2, 0.03), M.black);
  register.position.set(-0.55, 1.21, -0.2);
  const screen = mesh(new THREE.BoxGeometry(0.3, 0.2, 0.02), new THREE.MeshStandardMaterial({ color: 0x0b1a2a, emissive: 0x2a6fd6, emissiveIntensity: 0.8 }));
  screen.position.set(-0.55, 1.42, -0.25);
  screen.rotation.x = -0.3;
  const tickets = mesh(new THREE.BoxGeometry(0.2, 0.05, 0.12), new THREE.MeshStandardMaterial({ color: 0xffd27a }));
  tickets.position.set(0.5, 1.125, 0.3);
  tickets.rotation.y = 0.3;
  g.add(register, screen, tickets);
  return { group: g, size: { w: W + 0.2, d: D + 0.2 } };
}

// ---------------- 팝콘 매대 ----------------
export function buildPopcornStand(M) {
  const g = new THREE.Group();
  const W = 2.4, D = 0.95;
  const counter = mesh(new RoundedBoxGeometry(W, 1.0, D, 3, 0.04), M.black);
  counter.position.y = 0.5;
  g.add(counter);
  const front = mesh(new THREE.PlaneGeometry(W - 0.12, 0.8), M.stripes, { cast: false });
  front.position.set(0, 0.5, D / 2 + 0.004);
  g.add(front);
  const top = mesh(new THREE.BoxGeometry(W + 0.08, 0.05, D + 0.08), M.marbleWhite);
  top.position.y = 1.025;
  g.add(top);

  // 팝콘 기계
  const mx = -0.5;
  const machineBase = mesh(new RoundedBoxGeometry(0.72, 0.18, 0.6, 2, 0.03), new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.35, metalness: 0.2 }));
  machineBase.position.set(mx, 1.14, 0);
  const machineGlass = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.62, 0.56), M.glass);
  machineGlass.position.set(mx, 1.54, 0);
  const machineTop = mesh(new RoundedBoxGeometry(0.76, 0.14, 0.64, 2, 0.04), new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.35, metalness: 0.2 }));
  machineTop.position.set(mx, 1.92, 0);
  g.add(machineBase, machineGlass, machineTop);
  for (const [x, z] of [[-0.34, -0.28], [0.34, -0.28], [-0.34, 0.28], [0.34, 0.28]]) {
    const edge = mesh(new THREE.BoxGeometry(0.03, 0.62, 0.03), M.chrome);
    edge.position.set(mx + x, 1.54, z);
    g.add(edge);
  }
  // 기계 안 팝콘
  const kernel = new THREE.IcosahedronGeometry(0.035, 0);
  const pile = new THREE.InstancedMesh(kernel, M.popcorn, 160);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < 160; i++) {
    const x = (Math.random() - 0.5) * 0.6, z = (Math.random() - 0.5) * 0.48;
    const y = 1.26 + Math.random() * 0.18 * (1 - Math.abs(x) * 1.2);
    mtx.makeRotationFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, 0));
    mtx.setPosition(mx + x, y, z);
    pile.setMatrixAt(i, mtx);
  }
  g.add(pile);
  const lamp = new THREE.PointLight(0xffc66b, 1.2, 1.6, 2);
  lamp.position.set(mx, 1.75, 0);
  g.add(lamp);

  // 팝콘 통들
  const bucketGeo = new THREE.CylinderGeometry(0.11, 0.08, 0.24, 20, 1, true);
  const bucketMat = M.stripes.clone();
  bucketMat.side = THREE.DoubleSide;
  for (const [x, z] of [[0.35, 0.15], [0.62, 0.05], [0.88, 0.2], [0.5, -0.2]]) {
    const b = mesh(bucketGeo, bucketMat);
    b.position.set(x, 1.17, z);
    g.add(b);
    const fill = new THREE.InstancedMesh(kernel, M.popcorn, 14);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.08;
      mtx.makeRotationFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, 0));
      mtx.setPosition(x + Math.cos(a) * r, 1.29 + Math.random() * 0.06, z + Math.sin(a) * r);
      fill.setMatrixAt(i, mtx);
    }
    g.add(fill);
  }
  // 간판
  const tex = signTexture('POPCORN · 팝콘', { bg: '#c8102e', fg: '#fff3c8' });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9 }));
  const signBack = mesh(new THREE.BoxGeometry(1.7, 0.5, 0.06), M.gold);
  signBack.position.set(0.3, 2.55, -0.25);
  sign.position.set(0.3, 2.55, -0.215);
  for (const x of [-0.4, 1.0]) {
    const rod = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 8), M.brass);
    rod.position.set(x, 1.8, -0.3);
    g.add(rod);
  }
  g.add(signBack, sign);
  return { group: g, size: { w: W + 0.1, d: D + 0.1 } };
}

// ---------------- 소파 라운지 ----------------
export function buildSofa(M, mat, width = 2.2) {
  const g = new THREE.Group();
  const D = 0.9;
  const base = mesh(new RoundedBoxGeometry(width, 0.26, D, 3, 0.05), mat);
  base.position.y = 0.23;
  g.add(base);
  const cushionW = (width - 0.44) / 2;
  for (const s of [-1, 1]) {
    const c = mesh(new RoundedBoxGeometry(cushionW - 0.02, 0.16, D - 0.22, 4, 0.06), mat);
    c.position.set(s * (cushionW / 2), 0.43, 0.08);
    g.add(c);
    const bc = mesh(new RoundedBoxGeometry(cushionW - 0.04, 0.42, 0.18, 4, 0.07), mat);
    bc.position.set(s * (cushionW / 2), 0.68, -0.26);
    bc.rotation.x = -0.12;
    g.add(bc);
  }
  const back = mesh(new RoundedBoxGeometry(width, 0.62, 0.2, 3, 0.06), mat);
  back.position.set(0, 0.56, -D / 2 + 0.1);
  g.add(back);
  for (const s of [-1, 1]) {
    const arm = mesh(new RoundedBoxGeometry(0.22, 0.52, D, 3, 0.08), mat);
    arm.position.set(s * (width / 2 - 0.11), 0.42, 0);
    g.add(arm);
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.1, 10), M.gold);
    leg.position.set(x * (width / 2 - 0.08), 0.05, z * (D / 2 - 0.08));
    g.add(leg);
  }
  return { group: g, size: { w: width, d: D } };
}

export function buildCoffeeTable(M) {
  const g = new THREE.Group();
  const top = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 48), M.marbleWhite);
  top.position.y = 0.44;
  const rim = mesh(new THREE.TorusGeometry(0.5, 0.015, 8, 48), M.gold);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.44;
  g.add(top, rim);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.44, 8), M.gold);
    leg.position.set(Math.cos(a) * 0.32, 0.22, Math.sin(a) * 0.32);
    leg.rotation.z = Math.cos(a) * 0.15;
    leg.rotation.x = -Math.sin(a) * 0.15;
    g.add(leg);
  }
  // 테이블 위 소품: 책, 꽃병
  const book = mesh(new THREE.BoxGeometry(0.28, 0.04, 0.2), new THREE.MeshStandardMaterial({ color: 0x7d1a2a }));
  book.position.set(-0.12, 0.48, 0.05);
  book.rotation.y = 0.4;
  const vase = mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.2, 16), M.gold);
  vase.position.set(0.18, 0.56, -0.08);
  g.add(book, vase);
  return { group: g, size: { w: 1.0, d: 1.0 } };
}

export function buildFloorLamp(M) {
  const g = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.04, 24), M.brass);
  base.position.y = 0.02;
  const pole = mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.5, 10), M.brass);
  pole.position.y = 0.78;
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0xf3e2c0, emissive: 0xffcf8a, emissiveIntensity: 1.1, side: THREE.DoubleSide, roughness: 0.9 });
  const shade = mesh(new THREE.CylinderGeometry(0.17, 0.25, 0.32, 32, 1, true), shadeMat, { cast: false });
  shade.position.y = 1.6;
  const light = new THREE.PointLight(0xffc27a, 4, 0, 2);
  light.position.y = 1.5;
  g.add(base, pole, shade, light);
  return { group: g, size: { w: 0.4, d: 0.4 } };
}

export function buildRug(M, w, d) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.receiveShadow = true;
  return m;
}

// ---------------- 포토월 ----------------
export function buildPhotoWall(M, title, width = 5) {
  const g = new THREE.Group();
  const h = 2.7;
  const tex = photoWallTexture(title);
  const board = mesh(new THREE.BoxGeometry(width, h, 0.08), [
    M.black, M.black, M.black, M.black,
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }),
    M.black,
  ]);
  board.position.set(0, 0.12 + h / 2, 0.06);
  g.add(board);
  const frameTop = mesh(new THREE.BoxGeometry(width + 0.1, 0.06, 0.12), M.gold);
  frameTop.position.set(0, 0.12 + h + 0.03, 0.06);
  g.add(frameTop);
  // 무대
  const stage = mesh(new RoundedBoxGeometry(width, 0.12, 1.5, 2, 0.02), M.blackMatte);
  stage.position.set(0, 0.06, 0.85);
  g.add(stage);
  const edge = mesh(new THREE.BoxGeometry(width, 0.02, 0.02), M.gold);
  edge.position.set(0, 0.11, 1.6);
  g.add(edge);
  // 소프트박스 조명 2개
  const softboxes = [];
  for (const s of [-1, 1]) {
    const sb = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.7, 6), M.black);
      leg.position.set(Math.cos(a) * 0.22, 0.8, Math.sin(a) * 0.22);
      leg.rotation.set(Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15);
      sb.add(leg);
    }
    const pole = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 8), M.black);
    pole.position.y = 1.85;
    const box = mesh(new THREE.BoxGeometry(0.6, 0.6, 0.3), M.black);
    box.position.y = 2.15;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.54), M.softbox);
    face.position.set(0, 2.15, 0.151);
    sb.add(pole, box, face);
    sb.position.set(s * (width / 2 + 0.2), 0, 2.0);
    sb.lookAt(0, 0, 0.9); // 무대 쪽을 향하도록 (아직 부모가 없어 로컬 좌표 = 월드 좌표)
    softboxes.push(sb);
    g.add(sb);
  }
  const fill = new THREE.PointLight(0xfff2e0, 3, 0, 2);
  fill.position.set(0, 2.2, 2.0);
  g.add(fill);
  return { group: g, softboxes, size: { w: width, d: 1.6 } };
}

// ---------------- 마키(전광판) ----------------
export function buildMarquee(M, tex, width = 6.4) {
  const g = new THREE.Group();
  const h = 1.3;
  const box = mesh(new RoundedBoxGeometry(width, h, 0.26, 3, 0.05), M.black);
  g.add(box);
  const trim = mesh(new RoundedBoxGeometry(width + 0.12, h + 0.12, 0.2, 3, 0.06), M.gold);
  trim.position.z = -0.04;
  g.add(trim);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.5, h - 0.36), new THREE.MeshStandardMaterial({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.25, roughness: 0.5,
  }));
  face.position.z = 0.131;
  g.add(face);

  // 둘레 전구 (2그룹으로 나눠 번갈아 점멸)
  const per = [];
  const stepX = 0.22;
  for (let x = -width / 2 + 0.12; x <= width / 2 - 0.1; x += stepX) {
    per.push([x, h / 2 - 0.09], [x, -h / 2 + 0.09]);
  }
  for (let y = -h / 2 + 0.3; y <= h / 2 - 0.25; y += stepX) {
    per.push([-width / 2 + 0.12, y], [width / 2 - 0.12, y]);
  }
  const geo = new THREE.SphereGeometry(0.035, 10, 8);
  const matA = M.bulb.clone(), matB = M.bulb.clone();
  const A = new THREE.InstancedMesh(geo, matA, Math.ceil(per.length / 2));
  const B = new THREE.InstancedMesh(geo, matB, Math.floor(per.length / 2));
  const mtx = new THREE.Matrix4();
  let ia = 0, ib = 0;
  per.forEach(([x, y], i) => {
    mtx.makeTranslation(x, y, 0.14);
    if (i % 2 === 0) A.setMatrixAt(ia++, mtx); else B.setMatrixAt(ib++, mtx);
  });
  g.add(A, B);
  const light = new THREE.PointLight(0xffd690, 5, 0, 2);
  light.position.set(0, 0, 1.2);
  g.add(light);
  return { group: g, bulbsA: matA, bulbsB: matB };
}

// ---------------- 벽등 ----------------
export function buildSconce(M) {
  const g = new THREE.Group();
  const plate = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 20), M.gold);
  plate.rotation.x = Math.PI / 2;
  const arm = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), M.gold);
  arm.rotation.x = Math.PI / 2;
  arm.position.z = 0.08;
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.11, 0.18, 24, 1, true), new THREE.MeshStandardMaterial({
    color: 0xf6e3c0, emissive: 0xffc77a, emissiveIntensity: 1.6, side: THREE.DoubleSide,
  }));
  shade.position.set(0, 0.06, 0.17);
  g.add(plate, arm, shade);
  return g;
}


// ---------------- 상영관 출입문 (벽에 붙임, +z 방향을 향함) ----------------
export function buildTheaterDoors(M, label) {
  const g = new THREE.Group();
  const W = 3.0, H = 2.6;
  const frame = mesh(new THREE.BoxGeometry(W + 0.3, H + 0.2, 0.14), M.gold);
  frame.position.set(0, (H + 0.2) / 2, 0.07);
  g.add(frame);
  const leatherMat = new THREE.MeshPhysicalMaterial({ color: 0x5a0f1c, roughness: 0.55, clearcoat: 0.3 });
  for (const s of [-1, 1]) {
    const door = mesh(new RoundedBoxGeometry(W / 2 - 0.06, H - 0.06, 0.1, 3, 0.03), leatherMat);
    door.position.set(s * (W / 4), H / 2, 0.15);
    g.add(door);
    // 단추 장식(체스터필드)
    const studs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 8, 6), M.gold, 30);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 5; c++) {
        m4.makeTranslation(s * (W / 4) + (c - 2) * 0.24 + (r % 2 ? 0.12 : 0) * 0, 0.35 + r * 0.38, 0.205);
        studs.setMatrixAt(k++, m4);
      }
    }
    g.add(studs);
    // 손잡이
    const handle = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 10), M.gold);
    handle.position.set(s * 0.12, 1.15, 0.24);
    g.add(handle);
    // 동그란 창
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), new THREE.MeshStandardMaterial({ color: 0x221a10, emissive: 0xffb860, emissiveIntensity: 0.6 }));
    win.position.set(s * (W / 4), 1.9, 0.205);
    g.add(win);
  }
  const signTex = doorSignTexture(label);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 1.1 }));
  sign.position.set(0, H + 0.55, 0.16);
  const signBox = mesh(new THREE.BoxGeometry(1.9, 0.55, 0.12), M.black);
  signBox.position.set(0, H + 0.55, 0.09);
  g.add(signBox, sign);
  const exTex = exitSignTexture();
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshStandardMaterial({ map: exTex, emissive: 0xffffff, emissiveMap: exTex, emissiveIntensity: 1.2 }));
  exit.position.set(W / 2 + 0.5, H + 0.3, 0.05);
  g.add(exit);
  const light = new THREE.PointLight(0x9fdcff, 1.5, 0, 2);
  light.position.set(0, H + 0.4, 0.9);
  g.add(light);
  return { group: g, size: { w: W + 0.3, d: 0.3 } };
}

// ---------------- 벽 액자 (+z 방향을 향함) ----------------
export function buildWallFrame(M, index, w = 0.9, h = 1.3) {
  const g = new THREE.Group();
  const frame = mesh(new RoundedBoxGeometry(w + 0.12, h + 0.12, 0.06, 2, 0.02), M.gold);
  frame.position.z = 0.03;
  const tex = vintagePosterTexture(index);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
  pic.position.z = 0.062;
  g.add(frame, pic);
  // 액자 조명
  const lamp = mesh(new THREE.CylinderGeometry(0.02, 0.02, w * 0.7, 10), M.brass);
  lamp.rotation.z = Math.PI / 2;
  lamp.position.set(0, h / 2 + 0.14, 0.14);
  const arm = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), M.brass);
  arm.rotation.x = Math.PI / 2;
  arm.position.set(0, h / 2 + 0.14, 0.07);
  const glowLine = new THREE.Mesh(new THREE.BoxGeometry(w * 0.66, 0.012, 0.012), M.bulb);
  glowLine.position.set(0, h / 2 + 0.12, 0.16);
  g.add(lamp, arm, glowLine);
  return g;
}

// ---------------- 극장 의자 한 줄 (+z 방향을 향함) ----------------
export function buildSeatRow(M, count = 4) {
  const g = new THREE.Group();
  const pitch = 0.62;
  const seatMat = M.velvetRed;
  const total = count * pitch;
  const beam = mesh(new THREE.BoxGeometry(total, 0.05, 0.08), M.black);
  beam.position.set(0, 0.18, -0.1);
  g.add(beam);
  for (let i = 0; i <= count; i++) {
    const x = -total / 2 + i * pitch;
    const arm = mesh(new RoundedBoxGeometry(0.07, 0.62, 0.55, 2, 0.025), M.black);
    arm.position.set(x, 0.31, -0.02);
    const armTop = mesh(new RoundedBoxGeometry(0.09, 0.03, 0.5, 2, 0.012), M.wood);
    armTop.position.set(x, 0.63, 0.0);
    g.add(arm, armTop);
  }
  for (let i = 0; i < count; i++) {
    const x = -total / 2 + pitch / 2 + i * pitch;
    const cushion = mesh(new RoundedBoxGeometry(pitch - 0.1, 0.12, 0.48, 3, 0.04), seatMat);
    cushion.position.set(x, 0.42, 0.04);
    const back = mesh(new RoundedBoxGeometry(pitch - 0.1, 0.72, 0.12, 3, 0.05), seatMat);
    back.position.set(x, 0.82, -0.2);
    back.rotation.x = -0.12;
    const shell = mesh(new RoundedBoxGeometry(pitch - 0.08, 0.76, 0.06, 2, 0.025), M.black);
    shell.position.set(x, 0.8, -0.27);
    shell.rotation.x = -0.12;
    g.add(cushion, back, shell);
  }
  return { group: g, size: { w: total + 0.1, d: 0.7 } };
}

// ---------------- 빈티지 영화 카메라 소품 ----------------
export function buildFilmCamera(M) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const leg = mesh(new THREE.CylinderGeometry(0.025, 0.018, 1.35, 8), M.woodDark);
    leg.position.set(Math.cos(a) * 0.32, 0.62, Math.sin(a) * 0.32);
    leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
    g.add(leg);
  }
  const head = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 16), M.black);
  head.position.y = 1.3;
  const body = mesh(new RoundedBoxGeometry(0.34, 0.36, 0.58, 3, 0.04), M.black);
  body.position.set(0, 1.55, 0);
  g.add(head, body);
  const lens = mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 24), M.black);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 1.55, 0.43);
  const lensRing = mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 24), M.brass);
  lensRing.position.set(0, 1.55, 0.58);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), new THREE.MeshPhysicalMaterial({ color: 0x1a2a3a, roughness: 0.05, metalness: 0.3, clearcoat: 1 }));
  glass.position.set(0, 1.55, 0.581);
  g.add(lens, lensRing, glass);
  // 필름 릴 2개
  const reels = [];
  for (const z of [-0.18, 0.2]) {
    const reel = new THREE.Group();
    const disc = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 32), M.brass);
    disc.rotation.z = Math.PI / 2;
    reel.add(disc);
    for (let k = 0; k < 5; k++) {
      const hole = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 12), M.black);
      hole.rotation.z = Math.PI / 2;
      const a = (k / 5) * Math.PI * 2;
      hole.position.set(0, Math.cos(a) * 0.12, Math.sin(a) * 0.12);
      reel.add(hole);
    }
    reel.position.set(0, 1.93, z);
    g.add(reel);
    reels.push(reel);
  }
  const plate = mesh(new THREE.BoxGeometry(0.1, 0.06, 0.4), M.black);
  plate.position.set(0, 1.75, 0.01);
  g.add(plate);
  return { group: g, reels, size: { w: 0.8, d: 0.8 } };
}

// ---------------- 스탠딩 테이블 ----------------
export function buildCocktailTable(M) {
  const g = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.03, 32), M.black);
  base.position.y = 0.015;
  const pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.05, 12), M.brass);
  pole.position.y = 0.55;
  const top = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 40), M.marbleWhite);
  top.position.y = 1.08;
  const rim = mesh(new THREE.TorusGeometry(0.36, 0.012, 8, 40), M.gold);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.08;
  // 캔들 램프
  const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 16), new THREE.MeshStandardMaterial({ color: 0xfff2d6, emissive: 0xffb44a, emissiveIntensity: 1.4 }));
  candle.position.y = 1.145;
  const glassC = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.13, 16, 1, true), M.glass);
  glassC.position.y = 1.165;
  g.add(base, pole, top, rim, candle, glassC);
  return { group: g, size: { w: 0.75, d: 0.75 } };
}

// ---------------- 환영 입간판 (A형) ----------------
export function buildWelcomeSign(M, title) {
  const g = new THREE.Group();
  const tex = welcomeTexture(title);
  const board = mesh(new THREE.BoxGeometry(0.72, 1.0, 0.04), [
    M.woodDark, M.woodDark, M.woodDark, M.woodDark,
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 }),
    M.woodDark,
  ]);
  board.position.set(0, 0.95, 0.12);
  board.rotation.x = -0.18;
  const frame = mesh(new THREE.BoxGeometry(0.8, 1.08, 0.03), M.gold);
  frame.position.set(0, 0.95, 0.1);
  frame.rotation.x = -0.18;
  const back = mesh(new THREE.BoxGeometry(0.76, 1.04, 0.03), M.woodDark);
  back.position.set(0, 0.95, -0.12);
  back.rotation.x = 0.18;
  for (const s of [-1, 1]) {
    for (const z of [0.2, -0.2]) {
      const leg = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), M.brass);
      leg.position.set(s * 0.36, 0.23, z);
      leg.rotation.x = z > 0 ? -0.18 : 0.18;
      g.add(leg);
    }
  }
  g.add(frame, board, back);
  return { group: g, size: { w: 0.85, d: 0.6 } };
}

// ---------------- 명예의 거리 별 타일 ----------------
let starTex = null;
export function buildStarTile() {
  if (!starTex) starTex = starTileTexture();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshStandardMaterial({ map: starTex, roughness: 0.35, metalness: 0.1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.015;
  m.receiveShadow = true;
  return m;
}

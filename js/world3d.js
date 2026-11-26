// 3D 시사회장 (Three.js)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createAvatar } from './3d/avatar.js';
import { loadCharacterLibrary, instantiateCharacter, createCharacterPreview } from './3d/characters.js';
import { createNavGrid } from './3d/pathfind.js';
import * as P from './3d/props.js';
import { loadPosition, autoSavePosition } from './position.js';
import { bakeStatic, stripDecorLights } from './3d/bake.js';

const POS_KEY = 'premiere.pos3d.v1';
import {
  marbleTexture, borderMarbleTexture, carpetTexture, wallpaperTexture, marqueeTexture, softShadowTexture, setMaxAnisotropy,
} from './3d/textures.js';

const WALL_H = 4.2;
const WALK_SPEED = 2.0;     // m/s
const RUN_SPEED = 4.4;      // m/s (달리기)
const NEAR_DIST = 1.35;     // 팜플렛 앞 지점과의 거리
const P_RADIUS = 0.28;
const CAM_AZ = 0.62;        // 카메라 방위각 (약 35°)
const CAM_EL = 0.74;        // 카메라 고도각 (약 42°)
const MAX_SPOTS = 12;

// ---------------- 레이아웃 ----------------
// 홀 크기는 상영작 수와 상관없이 고정 (작품이 아주 많을 때만 세로로 늘어남)
export const HALL_W = 40;
export const HALL_D = 32;

export function computeLayout(n) {
  const count = Math.max(0, n);
  const cols = 4;
  const slots = [-10.5, -5, 5, 10.5];          // 레드카펫 기준 팜플렛 가로 위치
  const partialOrder = [1, 2, 0, 3];           // 한 줄이 덜 찼을 때 카펫 가까운 쪽부터
  const rows = Math.max(1, Math.ceil(count / cols));
  const ax = 23;                               // 레드카펫 중심
  const W = HALL_W;
  const z0 = 5, rowGap = 5;
  const standEnd = z0 + (rows - 1) * rowGap;
  const D = Math.max(HALL_D, standEnd + 11);

  const stands = [];
  for (let r = 0; r < rows; r++) {
    const start = r * cols;
    const inRow = Math.min(cols, count - start);
    if (inRow <= 0) break;
    const idx = inRow === cols ? slots.map((_, i) => i) : partialOrder.slice(0, inRow).sort((a, b) => a - b);
    for (let k = 0; k < inRow; k++) {
      stands.push({ index: start + k, x: ax + slots[idx[k]], z: z0 + r * rowGap });
    }
  }
  return { W, D, ax, stands, standEnd, spawn: { x: ax, z: D - 1.6 } };
}

async function loadFonts(texts) {
  if (!document.fonts || !document.fonts.load) return;
  const sample = texts.filter(Boolean).join(' ').slice(0, 2000) || 'A';
  const loads = ['500', '600', '700', '800'].map((w) => document.fonts.load(`${w} 40px "Pretendard Variable"`, sample).catch(() => null));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 2500))]);
}

// ---------------- 월드 생성 ----------------
export async function createWorld(canvas, options) {
  const films = options.films || [];
  const isTouch = matchMedia('(pointer: coarse)').matches;

  const [, charLib] = await Promise.all([
    loadFonts([options.title, ...films.map((f) => `${f.title} ${f.director} ${f.runtime}`), '매표소 팝콘 감독 1관 2관 비상구 시사회에 오신 것을 환영합니다 팜플렛 앞에서 시청하기를 눌러 작품을 감상하세요 은막의 밤 자정의 필름 마지막 장면 별빛 극장 개봉 첫날 시네마 천국 황금시대 조명 카메라']),
    loadCharacterLibrary(),
  ]);
  const makeAvatar = (look) => {
    const a = charLib ? instantiateCharacter(charLib, look.seed || 0) : createAvatar(look);
    a.root.traverse((o) => { if (o.isMesh) o.castShadow = false; }); // 그림자는 발밑 원형 그림자로
    return a;
  };
  let preview = null;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, isTouch ? 1.25 : 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0712);
  scene.fog = new THREE.Fog(0x0d0712, 34, 70);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();

  const M = P.createMaterials();
  const L = computeLayout(films.length);
  const { W, D, ax } = L;
  const colliders = [];
  const addBox = (cx, cz, w, d) => colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });

  // 물체를 놓고 충돌 영역 등록 (rot 은 0 또는 ±π/2)
  function place(item, x, z, rot = 0, collide = true) {
    item.group.position.set(x, 0, z);
    item.group.rotation.y = rot;
    scene.add(item.group);
    if (collide && item.size) {
      const quarter = Math.abs(Math.round(rot / (Math.PI / 2))) % 2 === 1;
      addBox(x, z, quarter ? item.size.d : item.size.w, quarter ? item.size.w : item.size.d);
    }
    return item;
  }

  // ---------------- 조명 ----------------
  const hemi = new THREE.HemisphereLight(0xffe6cc, 0x2a1530, 0.95);
  scene.add(hemi);

  const center = new THREE.Vector3(W / 2, 0, D / 2);
  const key = new THREE.DirectionalLight(0xffdcb8, 2.1);
  key.position.set(center.x - 7, 15, center.z + 9);
  key.target.position.copy(center);
  key.castShadow = true;
  const SHADOW_MAP = isTouch ? 2048 : 4096;
  key.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  const ext = Math.max(W, D) * 0.75; // 홀 전체 (그림자는 처음에 한 번만 계산)
  Object.assign(key.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 50 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.04;
  const keyOffset = new THREE.Vector3(-7, 15, 9);
  const lightRot = new THREE.Matrix4().lookAt(keyOffset, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
  const lightRotInv = lightRot.clone().invert();
  const texel = (ext * 2) / SHADOW_MAP;
  const snapV = new THREE.Vector3();
  function followShadow(target) {
    // 빛 좌표계에서 텍셀 단위로 맞춰 움직여야 그림자 가장자리가 지글거리지 않음
    snapV.copy(target).applyMatrix4(lightRotInv);
    snapV.x = Math.round(snapV.x / texel) * texel;
    snapV.y = Math.round(snapV.y / texel) * texel;
    snapV.applyMatrix4(lightRot);
    key.target.position.copy(snapV);
    key.position.copy(snapV).add(keyOffset);
  }
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(0x9fb4ff, 0.3);
  rim.position.set(center.x + 10, 8, center.z - 6);
  scene.add(rim);

  // ---------------- 바닥 / 벽 ----------------
  const marble = marbleTexture();
  marble.wrapS = marble.wrapT = THREE.RepeatWrapping;
  marble.repeat.set(W / 3, D / 3); // 타일 한 장 = 1.5m
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: marble, roughness: 0.32, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, D / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // 벽을 따라 두르는 짙은 대리석 띠 (뒷벽 · 왼쪽 벽)
  const borderMat = (len) => {
    const t = borderMarbleTexture();
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(len / 6, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.25 });
  };
  const bandW = 0.6, inset = 0.25;
  const backBand = new THREE.Mesh(new THREE.PlaneGeometry(W - inset, bandW), borderMat(W));
  backBand.rotation.x = -Math.PI / 2;
  backBand.position.set(inset + (W - inset) / 2, 0.006, inset + bandW / 2);
  const leftBand = new THREE.Mesh(new THREE.PlaneGeometry(D - inset - bandW - inset, bandW), borderMat(D));
  leftBand.rotation.x = -Math.PI / 2;
  leftBand.rotation.z = Math.PI / 2;
  leftBand.position.set(inset + bandW / 2, 0.006, inset + bandW + (D - inset - bandW - inset) / 2);
  backBand.receiveShadow = leftBand.receiveShadow = true;
  scene.add(backBand, leftBand);

  const slab = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, D), new THREE.MeshStandardMaterial({ color: 0x1a1016, roughness: 0.8 }));
  slab.position.set(W / 2, -0.201, D / 2);
  scene.add(slab);
  const edgeA = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, 0.04), M.gold);
  edgeA.position.set(W / 2, -0.02, D);
  const edgeB = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, D), M.gold);
  edgeB.position.set(W, -0.02, D / 2);
  scene.add(edgeA, edgeB);

  // 레드카펫
  const cTex = carpetTexture();
  cTex.wrapS = cTex.wrapT = THREE.RepeatWrapping;
  const carpetLen = D - 0.9;
  cTex.repeat.set(2, carpetLen / 2);
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(2.0, carpetLen), new THREE.MeshStandardMaterial({ map: cTex, roughness: 1 }));
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(ax, 0.008, 0.9 + carpetLen / 2);
  carpet.receiveShadow = true;
  scene.add(carpet);
  for (const s of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, carpetLen), M.gold);
    stripe.position.set(ax + s * 0.96, 0.01, 0.9 + carpetLen / 2);
    stripe.receiveShadow = true;
    scene.add(stripe);
  }

  // 벽
  const wpBack = wallpaperTexture();
  wpBack.repeat.set(W / 2, WALL_H / 2);
  wpBack.wrapS = wpBack.wrapT = THREE.RepeatWrapping;
  const wpLeft = wallpaperTexture();
  wpLeft.repeat.set(D / 2, WALL_H / 2);
  wpLeft.wrapS = wpLeft.wrapT = THREE.RepeatWrapping;
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(W + 0.25, WALL_H, 0.25), new THREE.MeshStandardMaterial({ map: wpBack, roughness: 0.85 }));
  backWall.position.set(W / 2 - 0.125, WALL_H / 2, -0.125);
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.25, WALL_H, D), new THREE.MeshStandardMaterial({ map: wpLeft, roughness: 0.85 }));
  leftWall.position.set(-0.125, WALL_H / 2, D / 2);
  backWall.receiveShadow = leftWall.receiveShadow = true;
  scene.add(backWall, leftWall);

  function trim(geoArgs, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...geoArgs), mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.castShadow = true;
    scene.add(m);
  }
  // 웨인스코팅(하단 나무 패널) + 몰딩
  trim([W, 1.05, 0.06], M.wood, W / 2, 0.525, 0.03);
  trim([0.06, 1.05, D], M.wood, 0.03, 0.525, D / 2);
  trim([W, 0.05, 0.1], M.gold, W / 2, 1.07, 0.05);
  trim([0.1, 0.05, D], M.gold, 0.05, 1.07, D / 2);
  trim([W, 0.14, 0.09], M.black, W / 2, 0.07, 0.045);
  trim([0.09, 0.14, D], M.black, 0.045, 0.07, D / 2);
  trim([W + 0.25, 0.14, 0.16], M.gold, W / 2 - 0.125, WALL_H - 0.07, 0.02);
  trim([0.16, 0.14, D], M.gold, 0.02, WALL_H - 0.07, D / 2);
  // 웨인스코팅 패널 장식
  for (let x = 0.9; x < W - 0.6; x += 1.4) trim([1.1, 0.62, 0.012], M.woodDark, x, 0.55, 0.066);
  for (let z = 0.9; z < D - 0.6; z += 1.4) trim([0.012, 0.62, 1.1], M.woodDark, 0.066, 0.55, z);

  // 벽기둥
  const pilasterXs = [ax - 4.3, ax + 4.3].filter((x) => x > 7 && x < W - 0.6);
  for (const x of pilasterXs) {
    trim([0.42, WALL_H, 0.16], M.woodDark, x, WALL_H / 2, 0.08);
    trim([0.5, 0.12, 0.22], M.gold, x, WALL_H - 0.25, 0.11);
    trim([0.5, 0.12, 0.22], M.gold, x, 0.12, 0.11);
    const sc = P.buildSconce(M);
    sc.position.set(x, 2.5, 0.16);
    scene.add(sc);
    const pl = new THREE.PointLight(0xffc27a, 2.2, 0, 2);
    pl.position.set(x, 2.6, 0.5);
    scene.add(pl);
  }

  // ---------------- 마키 / 포토월 ----------------
  const marquee = P.buildMarquee(M, marqueeTexture(options.title), 6.4);
  marquee.group.position.set(ax, 3.0, 0.16);
  scene.add(marquee.group);

  place(P.buildPhotoWall(M, options.title, 5), 3.5, 0, 0, false);
  addBox(3.5 - 2.7, 2.0, 0.6, 0.6);
  addBox(3.5 + 2.7, 2.0, 0.6, 0.6);

  // ---------------- 매표소 / 팝콘 ----------------
  place(P.buildTicketBooth(M), 0.95, 4.5, Math.PI / 2);
  place(P.buildPopcornStand(M), 0.75, 8.3, Math.PI / 2);
  const leftSconce = P.buildSconce(M);
  leftSconce.position.set(0.16, 2.4, 6.4);
  leftSconce.rotation.y = Math.PI / 2;
  scene.add(leftSconce);

  // ---------------- 라운지 ----------------
  const lz = D - 3.4;
  const rug = P.buildRug(M, 5.0, 4.6);
  rug.position.set(3.4, 0.012, lz);
  scene.add(rug);
  place(P.buildSofa(M, M.velvetGreen, 2.4), 0.72, lz, Math.PI / 2);
  place(P.buildSofa(M, M.velvetGreen, 2.2), 3.6, lz - 1.85, 0);
  place(P.buildCoffeeTable(M), 3.3, lz + 0.1, 0);
  place(P.buildFloorLamp(M), 0.6, lz - 1.95, 0);
  place(P.buildPlant(M, 1.0), 0.65, D - 0.75, 0);
  place(P.buildPlant(M, 0.85), 5.6, lz - 1.9, 0);

  // ---------------- 벨벳 차단봉 (입구 런웨이) ----------------
  // 차단봉은 입구 쪽에만 짧게 (약 4m)
  const ROPE_LEN = 4.0;
  const zR1 = D - 0.6, zR0 = Math.max(L.standEnd + 2.1, zR1 - ROPE_LEN);
  if (zR1 - zR0 > 1.5) {
    const n = Math.max(2, Math.round((zR1 - zR0) / 2.0) + 1);
    for (const s of [-1, 1]) {
      const x = ax + s * 1.3;
      let prev = null;
      for (let i = 0; i < n; i++) {
        const z = zR0 + ((zR1 - zR0) * i) / (n - 1);
        const post = P.buildStanchion(M);
        post.position.set(x, 0, z);
        scene.add(post);
        const top = new THREE.Vector3(x, 0.9, z);
        if (prev) scene.add(P.buildRope(prev, top, M));
        prev = top;
      }
      addBox(x, (zR0 + zR1) / 2, 0.36, zR1 - zR0 + 0.36);
    }
  }

  // 화분
  for (const [x, z] of [[ax - 3.9, 0.75], [ax + 3.9, 0.75], [ax - 2.2, D - 0.7], [ax + 2.2, D - 0.7], [W - 0.7, 0.75]]) {
    if (x > 6.8 && x < W - 0.5) place(P.buildPlant(M, 0.9), x, z, 0);
  }

  // ---------------- 추가 장식 ----------------
  // 상영관 출입문 (뒷벽)
  for (const [x, label] of [[W - 4.2, 'SCREEN 1 · 1관'], [9.8, 'SCREEN 2 · 2관']]) {
    place(P.buildTheaterDoors(M, label), x, 0, 0, false);
    addBox(x, 0.16, 3.3, 0.32);
  }

  // 빈티지 포스터 액자 (뒷벽 / 왼쪽 벽)
  let frameIdx = 0;
  for (const x of [13.6, 16.3, ax + 6.8, ax + 9.2]) {
    if (x > W - 6) continue;
    const f = P.buildWallFrame(M, frameIdx++);
    f.position.set(x, 2.25, 0.02);
    scene.add(f);
  }
  for (const z of [12, 15, 18, 21]) {
    if (z > D - 9) continue;
    const f = P.buildWallFrame(M, frameIdx++);
    f.position.set(0.02, 2.3, z);
    f.rotation.y = Math.PI / 2;
    scene.add(f);
  }

  // 극장 의자 대기석 (왼쪽 벽 앞)
  const seatZ = Math.min(16.5, D - 13);
  place(P.buildSeatRow(M, 6), 1.55, seatZ, Math.PI / 2);
  place(P.buildSeatRow(M, 6), 2.95, seatZ, Math.PI / 2);
  place(P.buildFloorLamp(M), 0.7, seatZ - 2.6, 0);
  place(P.buildFloorLamp(M), 0.7, seatZ + 2.6, 0);

  // 스탠딩 테이블
  for (const [x, z] of [[W - 2.8, 9], [W - 2.8, 15], [6.8, 12.5], [7.2, 20.5]]) {
    if (z < D - 8) place(P.buildCocktailTable(M), x, z, 0);
  }

  // 빈티지 영화 카메라
  const filmCam = place(P.buildFilmCamera(M), W - 3, D - 7.5, 0);
  filmCam.group.rotation.y = -0.8;

  // 환영 입간판
  const welcome = place(P.buildWelcomeSign(M, options.title), ax + 2.8, D - 2.6, 0);
  welcome.group.rotation.y = -0.25;

  // 명예의 거리 별 타일 (레드카펫 양옆)
  for (let z = 2.5; z < D - 5.5; z += 3) {
    for (const sx of [-1, 1]) {
      const st = P.buildStarTile();
      st.position.x = ax + sx * 1.75;
      st.position.z = z;
      scene.add(st);
    }
  }

  // 가장자리 화분
  for (const z of [4, 12, 20]) place(P.buildPlant(M, 1.0), W - 0.8, z, 0);
  for (const x of [10, 15.5, ax + 7.5, W - 4]) {
    if (Math.abs(x - ax) > 3) place(P.buildPlant(M, 0.95), x, D - 0.8, 0);
  }

  // ---------------- 팜플렛 ----------------
  const stands = L.stands.map((s) => {
    const film = films[s.index];
    const built = P.buildStand(film, s.index, options.title, M, { withLight: false });
    place(built, s.x, s.z, 0);
    built.pickables.forEach((m) => { m.userData.stand = s.index; });
    return { ...s, film, built, front: { x: s.x, z: s.z + 0.95 }, glowT: 0 };
  });
  const pickables = stands.flatMap((s) => s.built.pickables);

  // ---------------- 성능 최적화 ----------------
  // 1) 장식용 조명 제거 (조명이 많을수록 화면 전체가 느려짐 → 발광 재질과 기본 조명으로 대체)
  const removedLights = stripDecorLights(scene);
  // 2) 움직이지 않는 물체를 재질별로 합치기 (팜플렛·회전하는 릴은 제외)
  const baked = bakeStatic(scene, new Set([...stands.map((s) => s.built.group), ...filmCam.reels]));
  console.info(`[premiere] 최적화: 조명 ${removedLights}개 제거, 메시 ${baked.before}개 → ${baked.after}개`);
  // 3) 그림자는 처음 한 번만 계산 (캐릭터는 발밑 그림자 사용)
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const nav = createNavGrid(W, D, colliders, { radius: P_RADIUS + 0.05 });

  // ---------------- 캐릭터 ----------------
  let avatar = makeAvatar(options.look);
  scene.add(avatar.root);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: softShadowTexture(), transparent: true, depthWrite: false, opacity: 0.7 }));
  blob.rotation.x = -Math.PI / 2;
  blob.renderOrder = 1;
  scene.add(blob);

  const player = { x: L.spawn.x, z: L.spawn.z, yaw: Math.PI, moving: false };
  // 재접속 시 마지막 위치에서 시작 (홀 밖이거나 물체와 겹치면 입구에서 시작)
  const saved = loadPosition(POS_KEY);
  if (saved && !blocked(saved.x, saved.z)) {
    player.x = saved.x; player.z = saved.z;
    if (Number.isFinite(saved.yaw)) player.yaw = saved.yaw;
  }

  // 이름표 (HTML)
  const tag = document.createElement('div');
  tag.className = 'name-tag3d';
  tag.textContent = options.nickname || '';
  tag.hidden = !options.nickname;
  document.body.appendChild(tag);

  // ---------------- 카메라 / 후처리 ----------------
  const camera = new THREE.PerspectiveCamera(30, 1, 0.8, 160);
  const portrait = () => window.innerHeight > window.innerWidth;
  let dist = portrait() ? 19 : 14;
  let distTarget = dist;
  const camTarget = new THREE.Vector3(player.x, 0.9, player.z);
  const camDir = new THREE.Vector3(Math.sin(CAM_AZ) * Math.cos(CAM_EL), Math.sin(CAM_EL), Math.cos(CAM_AZ) * Math.cos(CAM_EL));

  const msaa = renderer.capabilities.isWebGL2 !== false && !isTouch ? 4 : 0;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: msaa }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.45, 1.0);
  composer.addPass(bloom);
  if (isTouch) bloom.enabled = false; // 모바일은 빛 번짐 효과 끔 (성능)
  composer.addPass(new OutputPass());

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ---------------- 충돌 / 이동 ----------------
  function blocked(x, z) {
    const m = P_RADIUS + 0.12;
    if (x < m || z < m || x > W - m || z > D - m) return true;
    for (const o of colliders) {
      const cx = Math.max(o.x0, Math.min(x, o.x1));
      const cz = Math.max(o.z0, Math.min(z, o.z1));
      if ((x - cx) ** 2 + (z - cz) ** 2 < P_RADIUS * P_RADIUS) return true;
    }
    return false;
  }
  function tryMove(dx, dz) {
    let moved = false;
    if (!blocked(player.x + dx, player.z)) { player.x += dx; moved = true; }
    if (!blocked(player.x, player.z + dz)) { player.z += dz; moved = true; }
    return moved;
  }

  // ---------------- 입력 ----------------
  const keys = new Set();
  let path = null;
  let pendingStand = null;
  let stuck = 0;
  let paused = false;
  let near = null;
  let runToggle = false;   // 달리기 버튼
  let shiftDown = false;   // Shift 를 누르고 있는 동안 달리기

  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  };
  const isTyping = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };

  function onKeyDown(e) {
    if (e.key === 'Shift') shiftDown = true;
    if (paused || isTyping(e)) return;
    if (KEYMAP[e.code]) {
      keys.add(KEYMAP[e.code]);
      path = null; pendingStand = null;
      e.preventDefault();
    } else if ((e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') && near) {
      e.preventDefault();
      options.onActivate?.(near.film);
    } else if (e.code === 'Equal' || e.code === 'NumpadAdd') {
      distTarget = Math.max(8, distTarget - 2);
    } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
      distTarget = Math.min(30, distTarget + 2);
    }
  }
  function onKeyUp(e) {
    if (e.key === 'Shift') shiftDown = false;
    if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]);
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  function walkTo(x, z) {
    const p = nav.findPath(player.x, player.z, x, z);
    path = p && p.length ? p : null;
    stuck = 0;
  }

  // 화면 좌표 → 팜플렛 또는 바닥 지점
  function pickAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (hits.length) {
      const s = stands.find((st) => st.index === hits[0].object.userData.stand);
      if (s) return { stand: s };
    }
    if (!raycaster.ray.intersectPlane(floorPlane, hit)) return null;
    // 손가락은 정확하지 않으니 팜플렛 근처 바닥을 눌러도 팜플렛으로 인정
    for (const s of stands) {
      if (Math.hypot(hit.x - s.front.x, hit.z - s.front.z) < 0.75 || (Math.abs(hit.x - s.x) < 0.9 && Math.abs(hit.z - s.z) < 0.6)) {
        return { stand: s };
      }
    }
    return { x: Math.max(0.5, Math.min(W - 0.5, hit.x)), z: Math.max(0.5, Math.min(D - 0.5, hit.z)) };
  }

  // 터치 지점 표시 (물결 링)
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 40), new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0, depthWrite: false }));
  ripple.rotation.x = -Math.PI / 2;
  ripple.renderOrder = 3;
  scene.add(ripple);
  let rippleT = 1;
  function showRipple(x, z) {
    ripple.position.set(x, 0.05, z);
    rippleT = 0;
  }

  let tripRun = false;     // 두 번 탭 → 그 지점까지 달리기
  let steer = null;        // 누른 채로 끌면 손가락 방향으로 계속 이동
  let lastTap = { t: 0, x: 0, y: 0 };

  function handleTap(clientX, clientY, run) {
    if (paused) return;
    const target = pickAt(clientX, clientY);
    if (!target) return;
    tripRun = !!run;
    if (target.stand) {
      const s = target.stand;
      if (near === s) { options.onActivate?.(s.film); return; }
      pendingStand = s;
      walkTo(s.front.x, s.front.z);
      showRipple(s.front.x, s.front.z);
      return;
    }
    pendingStand = null;
    walkTo(target.x, target.z);
    showRipple(target.x, target.z);
  }

  const pointers = new Map();
  let pinchStart = 0, pinchDist0 = 0, downInfo = null, lastSteer = 0;
  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      const now = performance.now();
      const dbl = now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 45;
      lastTap = { t: now, x: e.clientX, y: e.clientY };
      downInfo = { x: e.clientX, y: e.clientY, t: now, dragging: false };
      // 손을 떼기를 기다리지 않고 바로 이동 시작
      handleTap(e.clientX, e.clientY, dbl);
    }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      pinchDist0 = distTarget;
      downInfo = null;
      steer = null;
    }
  }
  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinchStart > 0) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      distTarget = Math.max(8, Math.min(30, pinchDist0 * (pinchStart / Math.max(20, d))));
      return;
    }
    if (pointers.size === 1 && downInfo && !paused) {
      if (!downInfo.dragging && Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y) > 14) downInfo.dragging = true;
      const now = performance.now();
      if (downInfo.dragging && now - lastSteer > 50) {
        lastSteer = now;
        const t = pickAt(e.clientX, e.clientY);
        if (t) {
          steer = t.stand ? { x: t.stand.front.x, z: t.stand.front.z } : { x: t.x, z: t.z };
          pendingStand = t.stand || null;
          path = null;
        }
      }
    }
  }
  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = 0;
    if (pointers.size === 0) {
      if (steer) { walkTo(steer.x, steer.z); showRipple(steer.x, steer.z); }
      steer = null;
      downInfo = null;
    }
  }
  function onWheel(e) {
    e.preventDefault();
    distTarget = Math.max(8, Math.min(30, distTarget * (1 + Math.sign(e.deltaY) * 0.1)));
  }

  // ---------------- 업데이트 ----------------
  const fwd = { x: -Math.sin(CAM_AZ), z: -Math.cos(CAM_AZ) };
  const right = { x: Math.cos(CAM_AZ), z: -Math.sin(CAM_AZ) };
  let time = 0;
  const tagPos = new THREE.Vector3();

  function angleLerp(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  function update(dt) {
    let dx = 0, dz = 0;
    if (!paused) {
      if (keys.has('up')) { dx += fwd.x; dz += fwd.z; }
      if (keys.has('down')) { dx -= fwd.x; dz -= fwd.z; }
      if (keys.has('right')) { dx += right.x; dz += right.z; }
      if (keys.has('left')) { dx -= right.x; dz -= right.z; }
      if (keys.size) { tripRun = false; steer = null; }
      if (!dx && !dz && steer) {
        const tx = steer.x - player.x, tz = steer.z - player.z;
        const d = Math.hypot(tx, tz);
        if (d > 0.12) { dx = tx / d; dz = tz / d; }
      }
      if (!dx && !dz && path) {
        const wp = path[0];
        const tx = wp.x - player.x, tz = wp.z - player.z;
        const d = Math.hypot(tx, tz);
        if (d < 0.08) {
          path.shift();
          if (!path.length) path = null;
        } else { dx = tx / d; dz = tz / d; }
      }
    }

    player.moving = false;
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      let step = (runToggle || shiftDown || tripRun ? RUN_SPEED : WALK_SPEED) * dt;
      if (path && !keys.size) step = Math.min(step, Math.hypot(path[0].x - player.x, path[0].z - player.z));
      const moved = tryMove((dx / len) * step, (dz / len) * step);
      player.yaw = angleLerp(player.yaw, Math.atan2(dx, dz), Math.min(1, dt * 12));
      if (moved) { player.moving = true; stuck = 0; }
      else if (path) { stuck += dt; if (stuck > 0.3) path = null; }
    }

    // 가장 가까운 팜플렛
    let best = null, bestD = NEAR_DIST;
    for (const s of stands) {
      const d = Math.hypot(player.x - s.front.x, player.z - s.front.z);
      if (d < bestD) { best = s; bestD = d; }
    }
    if (best !== near) {
      near = best;
      options.onNear?.(best ? best.film : null);
    }
    if (pendingStand && !path && !steer) {
      if (near === pendingStand) player.yaw = angleLerp(player.yaw, Math.PI, 1);
      pendingStand = null;
    }

    // 팜플렛 하이라이트
    for (const s of stands) {
      const on = s === near;
      s.glowT += ((on ? 1 : 0) - s.glowT) * Math.min(1, dt * 6);
      const pulse = 0.75 + Math.sin(time * 4) * 0.25;
      s.built.ring.opacity = s.glowT * pulse * 0.9;
      s.built.poster.emissiveIntensity = 0.55 + s.glowT * 0.35;
      s.built.glow.opacity = 0.3 + s.glowT * 0.35;
      if (s.built.spot) s.built.spot.intensity = 22 + s.glowT * 16;
    }

    for (const r of filmCam.reels) r.rotation.x += dt * 1.2;

    // 마키 전구 점멸
    const phase = Math.floor(time * 2.5) % 2;
    marquee.bulbsA.emissiveIntensity = phase ? 3.2 : 0.6;
    marquee.bulbsB.emissiveIntensity = phase ? 0.6 : 3.2;

    // 캐릭터
    avatar.root.position.set(player.x, 0, player.z);
    avatar.root.rotation.y = player.yaw;
    avatar.update(dt, player.moving, time, player.moving && (runToggle || shiftDown || tripRun));
    if (!path && !steer) tripRun = false;
    if (rippleT < 1) {
      rippleT = Math.min(1, rippleT + dt * 2.2);
      ripple.scale.setScalar(0.6 + rippleT * 1.4);
      ripple.material.opacity = (1 - rippleT) * 0.9;
    }
    blob.position.set(player.x, 0.035, player.z);

    // 카메라
    dist += (distTarget - dist) * Math.min(1, dt * 6);
    const k = Math.min(1, dt * 5);
    camTarget.x += (player.x - camTarget.x) * k;
    camTarget.z += (player.z - camTarget.z) * k;
    camera.position.copy(camTarget).addScaledVector(camDir, dist);
    camera.lookAt(camTarget);
  }

  function updateTag() {
    if (tag.hidden) return;
    tagPos.set(player.x, avatar.height + 0.3, player.z).project(camera);
    const rect = canvas.getBoundingClientRect();
    const x = rect.left + (tagPos.x * 0.5 + 0.5) * rect.width;
    const y = rect.top + (-tagPos.y * 0.5 + 0.5) * rect.height;
    tag.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }

  // ---------------- 루프 ----------------
  resize();
  update(0);
  try {
    composer.render(); // 첫 프레임에서 오류가 나면 2D로 전환
  } catch (err) {
    tag.remove();
    renderer.dispose();
    throw err;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { keys.clear(); shiftDown = false; });
  window.addEventListener('resize', resize);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); downInfo = null; });
  canvas.addEventListener('wheel', onWheel, { passive: false });


  let last = performance.now();
  let slowTime = 0, degraded = false;
  let raf = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    update(dt);
    composer.render();
    updateTag();

    // 느린 기기 자동 품질 조절
    if (!degraded && time > 3) {
      slowTime = dt > 0.028 ? slowTime + dt : Math.max(0, slowTime - dt * 0.5);
      if (slowTime > 1.5) {
        degraded = true;
        pixelRatio = 1;
        renderer.setPixelRatio(1);
        bloom.enabled = false;
        resize();
      }
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  autoSavePosition(POS_KEY, () => player);

  if (new URLSearchParams(location.search).has('debug')) {
    window.__premiereDebug = { layout: L, colliders, nav, stands, player, blocked };
  }

  return {
    mode: '3d',
    setLook(look, nickname) {
      scene.remove(avatar.root);
      avatar = makeAvatar(look);
      scene.add(avatar.root);
      tag.textContent = nickname || '';
      tag.hidden = !nickname;
    },
    setPaused(p) {
      paused = p;
      keys.clear();
      if (p) path = null;
    },
    activateNear() { if (near) options.onActivate?.(near.film); },
    setRunning(v) { runToggle = !!v; },
    // 3D 캐릭터 모델이 있을 때만 미리보기 제공 (없으면 null → 2D 미리보기 사용)
    getPreview() {
      if (!charLib) return null;
      if (!preview) preview = createCharacterPreview(charLib);
      return preview;
    },
    destroy() {
      cancelAnimationFrame(raf);
      tag.remove();
      renderer.dispose();
    },
  };
}

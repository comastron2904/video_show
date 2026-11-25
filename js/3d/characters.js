// 게임용 3D 캐릭터 모델(.glb) 불러오기
//
// /models/characters/ 폴더에 캐릭터 .glb 파일을 넣어 두면 사용합니다.
// 사용할 파일 목록은 아래 순서로 찾습니다.
//   1) js/config.js 의 window.__CHARACTERS__ = { files: ['a.glb', ...] }
//   2) /models/characters/list.json  (["a.glb", "b.glb"] 형태)
//   3) Kenney "Mini Characters" 기본 파일 이름
// 하나도 불러오지 못하면 null 을 돌려주고, 기본 캐릭터로 대신합니다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const BASE = '/models/characters/';
const KENNEY_DEFAULT = [
  ...['a', 'b', 'c', 'd', 'e', 'f'].map((k) => `character-female-${k}.glb`),
  ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((k) => `character-male-${k}.glb`),
];
const TARGET_HEIGHT = 1.35;

let libraryPromise = null;

// list.json 은 ["a.glb", ...] 또는 { "files": [...], "scale": 2, "width": 0.85 } 형태
//  scale : 전체 크기 배율
//  width : 몸집(가로·앞뒤 두께) 배율. 1보다 작으면 날씬해집니다.
let modelScale = null;
let widthScale = 1;
async function resolveFileList() {
  const cfg = window.__CHARACTERS__ || {};
  if (cfg.scale) modelScale = Number(cfg.scale) || null;
  if (cfg.width) widthScale = Number(cfg.width) || 1;
  if (Array.isArray(cfg.files) && cfg.files.length) return cfg.files;
  try {
    const r = await fetch(`${BASE}list.json`, { cache: 'no-cache' });
    if (r.ok) {
      const data = await r.json();
      const list = Array.isArray(data) ? data : data.files;
      if (!Array.isArray(data) && data.scale && !modelScale) modelScale = Number(data.scale) || null;
      if (!Array.isArray(data) && data.width) widthScale = Number(data.width) || 1;
      if (Array.isArray(list) && list.length) return list;
    }
  } catch { /* 목록 파일 없음 */ }
  return KENNEY_DEFAULT;
}

export function loadCharacterLibrary() {
  if (libraryPromise) return libraryPromise;
  libraryPromise = (async () => {
    const files = await resolveFileList();
    const loader = new GLTFLoader();
    const settled = await Promise.all(files.map((file) =>
      loader.loadAsync(BASE + file).then((gltf) => ({ file, gltf })).catch(() => null)));
    const list = settled.filter(Boolean);
    if (!list.length) {
      console.info('[premiere] /models/characters/ 에서 캐릭터 모델을 찾지 못해 기본 캐릭터를 사용합니다.');
      return null;
    }
    console.info(`[premiere] 캐릭터 모델 ${list.length}개 불러옴:`, list.map((e) => e.file).join(', '));
    return { list };
  })();
  return libraryPromise;
}

function findClip(clips, patterns, avoid = /wheelchair|chair|sit/i) {
  for (const re of patterns) {
    const c = clips.find((clip) => re.test(clip.name) && !avoid.test(clip.name));
    if (c) return c;
  }
  return null;
}

// 닉네임으로 정해진 seed 로 모델 하나를 골라 새 인스턴스를 만듭니다.
export function instantiateCharacter(lib, seed) {
  const entry = lib.list[Math.abs(seed | 0) % lib.list.length];
  const model = SkeletonUtils.clone(entry.gltf.scene);

  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // 스키닝 애니메이션 중 사라지는 문제 방지
    }
  });

  // 크기와 바닥 높이 맞추기 (고정 배율이 있으면 모든 캐릭터를 같은 비율로)
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = modelScale || (size.y > 0 ? TARGET_HEIGHT / size.y : 1);
  model.scale.set(scale * widthScale, scale, scale * widthScale);
  model.position.y = -box.min.y * scale;
  const rotY = Number((window.__CHARACTERS__ || {}).rotationY) || 0;
  model.rotation.y = rotY;

  const root = new THREE.Group();
  root.add(model);

  const clips = entry.gltf.animations || [];
  const mixer = clips.length ? new THREE.AnimationMixer(model) : null;
  const idleClip = findClip(clips, [/^idle$/i, /idle/i, /static/i, /stand/i]) || clips[0] || null;
  const walkClip = findClip(clips, [/^walk$/i, /walk/i, /jog/i]);
  const runClip = findClip(clips, [/^sprint$/i, /^run$/i, /sprint/i, /run/i]);
  const actions = {
    idle: mixer && idleClip ? mixer.clipAction(idleClip) : null,
    walk: mixer && walkClip ? mixer.clipAction(walkClip) : null,
    run: mixer && runClip ? mixer.clipAction(runClip) : null,
  };
  // 달리기 동작이 없으면 걷기 동작을 빠르게 재생
  if (!actions.run && actions.walk) actions.run = actions.walk;
  let state = 'idle';
  let current = actions.idle;
  current?.play();

  let bobPhase = 0;
  const baseY = -box.min.y * scale;

  function update(dt, moving, _time, running) {
    const next = !moving ? 'idle' : running ? 'run' : 'walk';
    if (next !== state && actions[next]) {
      const to = actions[next];
      to.reset();
      to.setEffectiveTimeScale(next === 'run' && to === actions.walk ? 1.7 : 1);
      to.setEffectiveWeight(1);
      to.play();
      if (current && current !== to) current.crossFadeTo(to, 0.2, false);
      current = to;
      state = next;
    } else if (next !== state) {
      state = next;
    }
    if (!actions.walk) {
      // 걷기 동작이 없는 모델: 통통 튀는 걸음으로 대신
      bobPhase = moving ? bobPhase + dt * (running ? 20 : 12) : 0;
      model.position.y = baseY + Math.abs(Math.sin(bobPhase)) * 0.05;
    }
    mixer?.update(dt);
  }

  return { root, update, height: Math.max(1, size.y * scale), file: entry.file };
}

// 온보딩/프로필용 미리보기 렌더러
export function createCharacterPreview(lib) {
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 320;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(320, 320, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff2e6, 0x3a2448, 2.2));
  const key = new THREE.DirectionalLight(0xffe2c0, 2.4);
  key.position.set(1.5, 2.5, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xb9a6ff, 1.2);
  rim.position.set(-2, 1.5, -2);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
  let current = null;
  let seed = null;

  function frame(mode) {
    const h = current ? current.height : TARGET_HEIGHT;
    if (mode === 'face') {
      camera.position.set(0, h * 0.78, h * 1.15);
      camera.lookAt(0, h * 0.72, 0);
    } else {
      camera.position.set(0, h * 0.62, h * 2.65);
      camera.lookAt(0, h * 0.5, 0);
    }
  }

  function setSeed(s) {
    if (s === seed && current) return;
    seed = s;
    if (current) scene.remove(current.root);
    current = instantiateCharacter(lib, s);
    current.root.rotation.y = -0.35;
    scene.add(current.root);
  }

  return {
    canvas,
    render(s, dt = 0, mode = 'full', spin = 0) {
      setSeed(s);
      current.update(dt, false);
      current.root.rotation.y = -0.35 + spin;
      frame(mode);
      renderer.render(scene, camera);
    },
    snapshot(s) {
      setSeed(s);
      current.update(0.016, false);
      current.root.rotation.y = -0.25;
      frame('face');
      renderer.render(scene, camera);
      return canvas.toDataURL('image/png');
    },
  };
}

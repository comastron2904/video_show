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

// list.json 은 ["a.glb", ...] 또는 { "files": [...], "scale": 2 } 형태
let modelScale = null;
async function resolveFileList() {
  const cfg = window.__CHARACTERS__ || {};
  if (cfg.scale) modelScale = Number(cfg.scale) || null;
  if (Array.isArray(cfg.files) && cfg.files.length) return cfg.files;
  try {
    const r = await fetch(`${BASE}list.json`, { cache: 'no-cache' });
    if (r.ok) {
      const data = await r.json();
      const list = Array.isArray(data) ? data : data.files;
      if (!Array.isArray(data) && data.scale && !modelScale) modelScale = Number(data.scale) || null;
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
  model.scale.setScalar(scale);
  model.position.y = -box.min.y * scale;
  const rotY = Number((window.__CHARACTERS__ || {}).rotationY) || 0;
  model.rotation.y = rotY;

  const root = new THREE.Group();
  root.add(model);

  const clips = entry.gltf.animations || [];
  const mixer = clips.length ? new THREE.AnimationMixer(model) : null;
  const idleClip = findClip(clips, [/^idle$/i, /idle/i, /static/i, /stand/i]) || clips[0] || null;
  const walkClip = findClip(clips, [/^walk$/i, /walk/i, /jog/i, /run/i, /sprint/i]);
  const idle = mixer && idleClip ? mixer.clipAction(idleClip) : null;
  const walk = mixer && walkClip ? mixer.clipAction(walkClip) : null;
  if (idle) idle.play();
  if (walk) { walk.play(); walk.setEffectiveWeight(0); }

  let walking = false;
  let bobPhase = 0;

  function update(dt, moving) {
    if (walk && idle) {
      if (moving !== walking) {
        walking = moving;
        const from = moving ? idle : walk;
        const to = moving ? walk : idle;
        to.enabled = true;
        to.setEffectiveTimeScale(1);
        to.setEffectiveWeight(1);
        from.crossFadeTo(to, 0.22, false);
      }
    } else if (!walk) {
      // 걷기 동작이 없는 모델: 살짝 통통 튀는 걸음으로 대신
      bobPhase = moving ? bobPhase + dt * 12 : 0;
      model.position.y = -box.min.y * scale + Math.abs(Math.sin(bobPhase)) * 0.05;
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
    if (mode === 'face') {
      camera.position.set(0, TARGET_HEIGHT * 0.78, 1.55);
      camera.lookAt(0, TARGET_HEIGHT * 0.72, 0);
    } else {
      camera.position.set(0, TARGET_HEIGHT * 0.62, 3.6);
      camera.lookAt(0, TARGET_HEIGHT * 0.5, 0);
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

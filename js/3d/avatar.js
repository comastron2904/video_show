// 3D 캐릭터 (닉네임으로 만든 look 값을 그대로 사용)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

function std(color, roughness = 0.7, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, ...extra });
}

function part(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function createAvatar(look) {
  const root = new THREE.Group();   // 위치/회전
  const body = new THREE.Group();   // 걷기 출렁임
  root.add(body);

  const skin = std(look.skin, 0.6);
  const shirt = std(look.shirt, 0.85);
  const pants = std(look.pants, 0.9);
  const hair = std(look.hair, 0.5);
  const dark = std('#1b1420', 0.25);
  const shoe = std('#221a1a', 0.4);
  const cap = std(look.capColor, 0.7);

  // 다리
  const legs = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.085, 0.38, 0);
    part(new THREE.CapsuleGeometry(0.07, 0.2, 6, 14), pants, pivot, 0, -0.17, 0);
    part(new RoundedBoxGeometry(0.13, 0.08, 0.2, 2, 0.035), shoe, pivot, 0, -0.335, 0.03);
    body.add(pivot);
    legs.push(pivot);
  }
  // 골반 + 몸통
  const hip = part(new THREE.CylinderGeometry(0.165, 0.16, 0.14, 24), pants, body, 0, 0.44, 0);
  hip.scale.z = 0.8;
  const torso = part(new THREE.CapsuleGeometry(0.17, 0.16, 8, 24), shirt, body, 0, 0.62, 0);
  torso.scale.z = 0.8;

  // 팔
  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.215, 0.74, 0);
    pivot.rotation.z = s * 0.12;
    part(new THREE.CapsuleGeometry(0.055, 0.17, 6, 12), shirt, pivot, 0, -0.12, 0);
    part(new THREE.SphereGeometry(0.06, 16, 12), skin, pivot, 0, -0.26, 0);
    body.add(pivot);
    arms.push(pivot);
  }

  // 머리
  const head = new THREE.Group();
  head.position.y = 1.0;
  body.add(head);
  part(new THREE.SphereGeometry(0.27, 40, 28), skin, head);

  // 얼굴
  for (const s of [-1, 1]) {
    const eye = part(new THREE.SphereGeometry(0.036, 16, 12), dark, head, s * 0.09, 0.0, 0.245);
    eye.scale.set(1, 1.3, 0.5);
    eye.castShadow = false;
    const hl = part(new THREE.SphereGeometry(0.011, 8, 6), std('#ffffff', 0.2, { emissive: 0xffffff, emissiveIntensity: 0.4 }), head, s * 0.09 + 0.012, 0.018, 0.262);
    hl.castShadow = false;
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.042, 20), new THREE.MeshBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.35, depthWrite: false }));
    blush.position.set(s * 0.16, -0.055, 0.21);
    blush.rotation.y = s * 0.6;
    head.add(blush);
  }
  const mouth = part(new THREE.TorusGeometry(0.028, 0.0075, 6, 18, Math.PI), std('#7a3434', 0.5), head, 0, -0.07, 0.258);
  mouth.rotation.z = Math.PI;
  mouth.castShadow = false;

  // 헤어
  const style = look.hairStyle;
  if (style === 'cap') {
    const dome = part(new THREE.SphereGeometry(0.29, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2), cap, head, 0, 0.03, 0);
    dome.rotation.x = -0.12;
    const brim = part(new THREE.CylinderGeometry(0.22, 0.22, 0.025, 32, 1, false, -Math.PI / 2, Math.PI), cap, head, 0, 0.05, 0.16);
    brim.rotation.x = 0.12;
    part(new THREE.SphereGeometry(0.03, 10, 8), cap, head, 0, 0.32, -0.03);
    const back = part(new THREE.SphereGeometry(0.275, 28, 14, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.25), hair, head);
    back.rotation.x = 0.5;
  } else {
    const top = part(new THREE.SphereGeometry(0.287, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.52), hair, head);
    top.rotation.x = -0.38;
    // 앞머리
    const fringe = part(new THREE.SphereGeometry(0.15, 20, 12), hair, head, 0.06, 0.17, 0.17);
    fringe.scale.set(1.5, 0.55, 0.7);
    fringe.rotation.z = -0.25;

    if (style === 'long') {
      const backHair = part(new THREE.CapsuleGeometry(0.23, 0.3, 8, 20), hair, head, 0, -0.16, -0.12);
      backHair.scale.set(1.15, 1, 0.55);
    } else if (style === 'bob') {
      const backHair = part(new THREE.CapsuleGeometry(0.24, 0.1, 8, 20), hair, head, 0, -0.08, -0.1);
      backHair.scale.set(1.2, 1, 0.65);
    } else if (style === 'bun') {
      part(new THREE.SphereGeometry(0.11, 20, 14), hair, head, 0, 0.3, -0.08);
    } else if (style === 'spiky') {
      const up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const el = i % 2 ? 0.55 : 0.85;
        const n = new THREE.Vector3(Math.cos(a) * Math.sin(el), Math.cos(el), Math.sin(a) * Math.sin(el) - 0.15).normalize();
        const cone = part(new THREE.ConeGeometry(0.075, 0.2, 10), hair, head);
        cone.position.copy(n.clone().multiplyScalar(0.27));
        cone.quaternion.setFromUnitVectors(up, n);
      }
    }
  }

  // 액세서리
  if (look.accessory === 'glasses') {
    const frameMat = std('#151018', 0.3);
    for (const s of [-1, 1]) {
      const lens = part(new THREE.TorusGeometry(0.058, 0.009, 8, 24), frameMat, head, s * 0.09, 0.0, 0.262);
      lens.castShadow = false;
    }
    const bridge = part(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 6), frameMat, head, 0, 0.005, 0.27);
    bridge.rotation.z = Math.PI / 2;
  } else if (look.accessory === 'scarf') {
    const scarf = part(new THREE.TorusGeometry(0.15, 0.055, 12, 28), cap, body, 0, 0.8, 0);
    scarf.rotation.x = Math.PI / 2;
    part(new RoundedBoxGeometry(0.09, 0.2, 0.045, 2, 0.015), cap, body, 0.07, 0.68, 0.15);
  } else if (look.accessory === 'popcorn') {
    const hand = arms[1];
    const bucketMat = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.5 });
    const bucket = part(new THREE.CylinderGeometry(0.085, 0.065, 0.16, 16), bucketMat, hand, 0, -0.3, 0.08);
    bucket.rotation.x = 0.2;
    const pop = part(new THREE.SphereGeometry(0.085, 12, 8), std('#ffe7a3', 0.8), hand, 0, -0.22, 0.1);
    pop.scale.y = 0.5;
  }

  // 발밑 부드러운 접지 그림자 (실시간 그림자 보강)
  let phase = 0;
  let speedSmooth = 0;

  function update(dt, moving, time, running = false) {
    speedSmooth += ((moving ? 1 : 0) - speedSmooth) * Math.min(1, dt * 10);
    if (moving) phase += dt * (running ? 18 : 11);
    const s = Math.sin(phase) * speedSmooth;
    legs[0].rotation.x = s * 0.7;
    legs[1].rotation.x = -s * 0.7;
    arms[0].rotation.x = -s * 0.6;
    arms[1].rotation.x = s * 0.6 + (look.accessory === 'popcorn' ? -0.5 : 0);
    body.position.y = Math.abs(Math.sin(phase)) * 0.045 * speedSmooth;
    const breathe = Math.sin(time * 2.2) * 0.012 * (1 - speedSmooth);
    torso.scale.y = 1 + breathe;
    head.position.y = 1.0 + breathe * 0.8;
    head.rotation.z = Math.sin(phase * 0.5) * 0.04 * speedSmooth;
  }

  return { root, update, height: 1.32 };
}

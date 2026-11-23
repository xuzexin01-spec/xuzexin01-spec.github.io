import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const ASSET_ROOT = new URL('../', import.meta.url);
const MODEL_URL = new URL('models/aether_x4_draco.glb?v=1', ASSET_ROOT).href;
const DRACO_PATH = new URL('vendor/three/draco/', ASSET_ROOT).href;
const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const EXPLODE = { L1: 0.135, L2: 0.052, L3: 0.0, L4: -0.085 };
const LAYER_ORDER = ['L1', 'L2', 'L3', 'L4'];

const canvas = document.getElementById('tdCanvas');
const statEl = document.getElementById('tdStat');
const loadingEl = document.getElementById('tdLoading');
const host = document.getElementById('tdView');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
} catch (err) {
  host.classList.add('is-failed');
  if (loadingEl) loadingEl.textContent = 'WEBGL UNAVAILABLE';
  throw err;
}

renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 20);
camera.position.set(0.30, 0.17, 0.32);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;
scene.environmentIntensity = 0.95;

const key = new THREE.DirectionalLight(0xffffff, 2.6);
key.position.set(1.2, 1.8, 1.0);
scene.add(key);

const rim = new THREE.DirectionalLight(0xbcd6ea, 1.1);
rim.position.set(-1.4, 0.6, -1.2);
scene.add(rim);

const fill = new THREE.HemisphereLight(0xdcecf7, 0x4a5a66, 0.55);
scene.add(fill);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.enablePan = false;
controls.minDistance = 0.55;
controls.maxDistance = 1.5;
controls.minPolarAngle = Math.PI * 0.12;
controls.maxPolarAngle = Math.PI * 0.52;
controls.autoRotate = !REDUCE;
controls.autoRotateSpeed = 0.55;
controls.target.set(0, 0.015, 0);

const group = new THREE.Group();
scene.add(group);

const pivots = {};
const originalEmissive = new Map();
let modelReady = false;
let explodeTarget = 0;
let explodeCurrent = 0;
let activeLayer = null;
let highlightUntil = 0;
let rafId = 0;
let visible = true;

function setupMaterials(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    const list = Array.isArray(node.material) ? node.material : [node.material];
    list.forEach((mat) => {
      if (!mat) return;
      mat.envMapIntensity = 0.85;
      if (originalEmissive.has(mat)) return;
      originalEmissive.set(mat, {
        color: mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000),
        intensity: mat.emissiveIntensity ?? 1,
      });
    });
  });
}

function layerOf(node) {
  let cur = node;
  while (cur && cur !== group) {
    if (/^L[1-4]_/.test(cur.name)) return cur.name.slice(0, 2);
    cur = cur.parent;
  }
  return null;
}

function highlight(layer, ms = 1600) {
  activeLayer = layer;
  highlightUntil = performance.now() + ms;
}

function applyHighlight() {
  const now = performance.now();
  const on = activeLayer && now < highlightUntil;
  group.traverse((node) => {
    if (!node.isMesh) return;
    const list = Array.isArray(node.material) ? node.material : [node.material];
    const isLayer = on && layerOf(node) === activeLayer;
    list.forEach((mat) => {
      const base = originalEmissive.get(mat);
      if (!base || !mat.emissive) return;
      if (isLayer) {
        mat.emissive.setHex(0xe8571f);
        mat.emissiveIntensity = 0.35;
      } else {
        mat.emissive.copy(base.color);
        mat.emissiveIntensity = base.intensity;
      }
    });
  });
}

function fitModel() {
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  group.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z);
  const target = 0.52;
  group.scale.setScalar(target / maxDim);
  group.position.multiplyScalar(target / maxDim);
  controls.target.set(0, 0, 0);
}

const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath(DRACO_PATH);
loader.setDRACOLoader(draco);

const t0 = performance.now();
loader
  .loadAsync(MODEL_URL)
  .then((gltf) => {
    const root = gltf.scene;
    root.traverse((node) => {
      const m = /^(L[1-4]_.+?)_Pivot$/.exec(node.name);
      if (m) pivots[m[1].slice(0, 2)] = node;
    });
    setupMaterials(root);
    group.add(root);
    fitModel();
    modelReady = true;
    if (loadingEl) loadingEl.remove();
    frameCamera();
    lastAspect = camera.aspect;
    const range = document.getElementById('explodeRange');
    if (range) explodeTarget = THREE.MathUtils.clamp(Number(range.value) || 0, 0, 100) / 100;
    applyExplode(explodeTarget * 100);
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
    let tris = 0;
    root.traverse((n) => {
      if (!n.isMesh || !n.geometry) return;
      const g = n.geometry;
      tris += Math.round((g.index ? g.index.count : g.attributes.position.count) / 3);
    });
    const entry = performance
      .getEntriesByName(MODEL_URL)
      .pop();
    const kb = entry ? Math.round(entry.transferSize / 1024) : null;
    if (statEl) {
      statEl.textContent = `${tris.toLocaleString()} TRI · ${kb ? kb + ' KB · ' : ''}${elapsed}s · DRACO`;
    }
  })
  .catch(() => {
    host.classList.add('is-failed');
    if (loadingEl) loadingEl.querySelector('span').textContent = 'GEOMETRY LOAD FAILED';
  });

function applyExplode(percent) {
  explodeTarget = THREE.MathUtils.clamp(Number(percent) || 0, 0, 100) / 100;
}

function tick() {
  rafId = requestAnimationFrame(tick);
  if (modelReady) {
    explodeCurrent += (explodeTarget - explodeCurrent) * 0.12;
    if (Math.abs(explodeTarget - explodeCurrent) < 0.0005) explodeCurrent = explodeTarget;
    LAYER_ORDER.forEach((key) => {
      const pivot = pivots[key];
      if (!pivot) return;
      pivot.position.y = EXPLODE[key] * explodeCurrent;
    });
    applyHighlight();
  }
  controls.update();
  renderer.render(scene, camera);
}

let lastAspect = 0;

function frameCamera() {
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const horizontal = Math.max(size.x, size.z);
  const vertical = size.y;
  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const distV = vertical / 2 / Math.tan(vFov / 2);
  const distH = horizontal / 2 / Math.tan(hFov / 2);
  const dist = Math.max(distV, distH) * 1.35;
  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(controls.target).add(dir.multiplyScalar(dist));
  controls.minDistance = dist * 0.75;
  controls.maxDistance = dist * 2.4;
}

function resize() {
  const rect = host.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  renderer.setSize(rect.width, rect.height, false);
  const aspect = rect.width / rect.height;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  if (modelReady && Math.abs(aspect - lastAspect) > 0.08) {
    frameCamera();
    lastAspect = aspect;
  }
}

const ro = new ResizeObserver(resize);
ro.observe(host);
resize();
tick();

const section = document.getElementById('teardown');
if (section && 'IntersectionObserver' in window) {
  new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      visible = entry.isIntersecting;
      if (visible && !rafId) tick();
      if (!visible && rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    });
  }, { rootMargin: '150px 0px' }).observe(section);
}

let resumeTimer = 0;
controls.addEventListener('start', () => {
  controls.autoRotate = false;
  clearTimeout(resumeTimer);
});
controls.addEventListener('end', () => {
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => {
    if (!REDUCE) controls.autoRotate = true;
  }, 2600);
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downPoint = null;

canvas.addEventListener('pointerdown', (e) => {
  downPoint = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('pointerup', (e) => {
  if (!downPoint) return;
  const moved = Math.hypot(e.clientX - downPoint.x, e.clientY - downPoint.y);
  downPoint = null;
  if (moved > 6 || !modelReady) return;

  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(group.children, true);
  if (!hits.length) return;
  const layer = layerOf(hits[0].object);
  if (!layer) return;
  highlight(layer);
  window.dispatchEvent(new CustomEvent('aether:layer', { detail: { layer } }));
});

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
});

window.AETHER3D = {
  setExplode(percent) {
    applyExplode(percent);
  },
  highlight,
  isReady: () => modelReady,
};

window.__aether = {
  pivots,
  group,
  scene,
  state: () => ({ explodeTarget, explodeCurrent, modelReady }),
};

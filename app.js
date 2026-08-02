import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const APP_VERSION = "KW_SYS_V.1.1";
console.log(APP_VERSION);

window.__THREE_DEBUG__ = { THREE };

const canvas = document.getElementById("scene");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1035);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 1, 4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 2;
controls.maxDistance = 8;

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const key = new THREE.DirectionalLight(0xffffff, 0.9);
key.position.set(3, 4, 2);
scene.add(key);
const rim = new THREE.DirectionalLight(0x6bc7ff, 0.4);
rim.position.set(-3, -1, -2);
scene.add(rim);

// Mirror/symmetry plane, shown at x=0 while "Mirror" is checked.
const mirrorPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 3),
  new THREE.MeshBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false, // it sits inside the shape's center, so draw it on
                       // top like a guide overlay instead of letting the
                       // shape's front surface occlude it via z-buffer
  })
);
mirrorPlane.rotation.y = Math.PI / 2; // face +X, spans Y/Z at x=0
mirrorPlane.renderOrder = 1; // after the main mesh (renderOrder 0)
mirrorPlane.visible = false;
scene.add(mirrorPlane);

let mirrorEnabled = false;

const material = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.6,
  metalness: 0.05,
  flatShading: true,
});

// --- Color & pattern ---

const COLORS = [
  "#ff6b6b", // coral
  "#ffa94d", // orange
  "#ffd43b", // sunny yellow
  "#69db7c", // grass green
  "#4dabf7", // sky blue
  "#5c7cfa", // periwinkle
  "#b197fc", // purple
  "#f783ac", // bubblegum
];

let selectedColor = COLORS[0];
let selectedPattern = "solid";

function shade(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.min(255, Math.max(0, v));
  const r = clamp((num >> 16) + Math.round(2.55 * percent));
  const g = clamp(((num >> 8) & 0xff) + Math.round(2.55 * percent));
  const b = clamp((num & 0xff) + Math.round(2.55 * percent));
  return `rgb(${r},${g},${b})`;
}

function makeTexture(colorHex, pattern) {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, size, size);

  if (pattern === "dots") {
    ctx.fillStyle = shade(colorHex, -30);
    const cols = 4;
    const spacing = size / cols;
    const r = spacing * 0.28;
    for (let gy = 0; gy < cols; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        ctx.beginPath();
        ctx.arc(spacing * gx + spacing / 2, spacing * gy + spacing / 2, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (pattern === "stripes") {
    ctx.fillStyle = shade(colorHex, -30);
    const stripeCount = 6;
    const stripeWidth = size / stripeCount;
    for (let i = 0; i < stripeCount; i += 2) {
      ctx.fillRect(i * stripeWidth, 0, stripeWidth, size);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function applyTexture() {
  if (material.map) material.map.dispose();
  material.map = makeTexture(selectedColor, selectedPattern);
  material.needsUpdate = true;
}
applyTexture();

let mesh = null;
let basePositions = null; // Float32Array snapshot of the un-sculpted shape
let currentShapeKind = "ball";
const MAX_DISPLACE = 0.9;
const BRUSH_RADIUS = 0.85;

function buildGeometry(kind) {
  let geo;
  if (kind === "ball") {
    geo = new THREE.IcosahedronGeometry(1, 1);
  } else {
    geo = new THREE.BoxGeometry(1.4, 1.4, 1.4, 2, 2, 2);
  }
  // Drop uv/normal before welding so merge hashes on POSITION only.
  // (uvs differ per-face even at shared corners/edges, e.g. on a box,
  // so leaving them in means mergeVertices silently fails to weld those
  // seams -- verts look coincident but are separate buffer entries, so
  // sculpting near an edge would crack instead of moving both sides.)
  geo.deleteAttribute("uv");
  geo.deleteAttribute("normal");
  geo = mergeVertices(geo, 1e-4);
  geo.computeVertexNormals();
  addSphericalUVs(geo);

  window.__lastVertexCount = geo.attributes.position.count;
  return geo;
}

// Simple spherical projection from each vertex's direction off center.
// Good enough for a low-poly toy pattern -- not seamless (there's a
// pinch at the poles and a seam where longitude wraps), but that's an
// acceptable cosmetic tradeoff for dots/stripes on a faceted shape.
function addSphericalUVs(geo) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const dir = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    dir.fromBufferAttribute(pos, i).normalize();
    uv[i * 2] = 0.5 + Math.atan2(dir.z, dir.x) / (2 * Math.PI);
    uv[i * 2 + 1] = 0.5 - Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) / Math.PI;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

function setShape(kind) {
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
  }
  const geo = buildGeometry(kind);
  mesh = new THREE.Mesh(geo, material);
  scene.add(mesh);
  basePositions = geo.attributes.position.array.slice();
  currentShapeKind = kind;
  window.__mesh = mesh;
}

function resetSculpt() {
  if (!mesh || !basePositions) return;
  const pos = mesh.geometry.attributes.position;
  pos.array.set(basePositions);
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

setShape("ball");

// --- Sculpt interaction ---

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

const SCULPT_SENSITIVITY = 0.006; // screen pixels of vertical drag -> world units of push

let dragging = false;
let centerIndex = -1;
let centerNormal = new THREE.Vector3();
let lastClientY = 0;

function updatePointerNDC(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
}

function nearestVertexIndex(localPoint) {
  const pos = mesh.geometry.attributes.position;
  let best = -1;
  let bestDist = Infinity;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = v.distanceToSquared(localPoint);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function onPointerDown(clientX, clientY) {
  updatePointerNDC(clientX, clientY);
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObject(mesh, false);
  if (hits.length === 0) return; // let OrbitControls handle rotation

  const hitPoint = hits[0].point.clone(); // mesh has identity transform, local === world
  centerIndex = nearestVertexIndex(hitPoint);

  const normalAttr = mesh.geometry.attributes.normal;
  centerNormal.fromBufferAttribute(normalAttr, centerIndex).normalize();

  lastClientY = clientY;

  dragging = true;
  controls.enabled = false;
}

function onPointerMove(clientX, clientY) {
  if (!dragging) return;

  // Dragging up puffs the grabbed point out, dragging down pushes it in.
  // Driven by screen-space delta (not a 3D projection) so it works
  // consistently no matter which angle the camera is looking from.
  const dy = lastClientY - clientY;
  lastClientY = clientY;
  const pushAmount = dy * SCULPT_SENSITIVITY;
  if (pushAmount === 0) return;

  const pos = mesh.geometry.attributes.position;
  const centerBase = new THREE.Vector3(
    basePositions[centerIndex * 3],
    basePositions[centerIndex * 3 + 1],
    basePositions[centerIndex * 3 + 2]
  );

  const v = new THREE.Vector3();
  const basePt = new THREE.Vector3();

  function applyBrush(refCenter, refNormal) {
    for (let i = 0; i < pos.count; i++) {
      basePt.set(
        basePositions[i * 3],
        basePositions[i * 3 + 1],
        basePositions[i * 3 + 2]
      );
      const dist = basePt.distanceTo(refCenter);
      if (dist > BRUSH_RADIUS) continue;
      const weight = Math.pow(1 - dist / BRUSH_RADIUS, 2);

      v.fromBufferAttribute(pos, i);
      v.addScaledVector(refNormal, pushAmount * weight);

      const diff = v.clone().sub(basePt);
      if (diff.length() > MAX_DISPLACE) {
        diff.setLength(MAX_DISPLACE);
        v.copy(basePt).add(diff);
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }

  applyBrush(centerBase, centerNormal);

  if (mirrorEnabled) {
    const mirrorCenter = centerBase.clone();
    mirrorCenter.x *= -1;
    const mirrorNormal = centerNormal.clone();
    mirrorNormal.x *= -1;
    applyBrush(mirrorCenter, mirrorNormal);
  }

  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

function onPointerUp() {
  dragging = false;
  centerIndex = -1;
  controls.enabled = true;
}

canvas.addEventListener("pointerdown", (e) => onPointerDown(e.clientX, e.clientY));
canvas.addEventListener("pointermove", (e) => onPointerMove(e.clientX, e.clientY));
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", onPointerUp);

// --- UI ---

const btnBall = document.getElementById("btn-ball");
const btnBlock = document.getElementById("btn-block");
const btnReset = document.getElementById("btn-reset");
const chkMirror = document.getElementById("chk-mirror");

chkMirror.addEventListener("change", () => {
  mirrorEnabled = chkMirror.checked;
  mirrorPlane.visible = mirrorEnabled;
});

// Shared select-helpers so both direct UI clicks and loading a saved
// character (further down) update state + button highlighting the same way.

function selectShape(kind) {
  setShape(kind);
  btnBall.classList.toggle("active", kind === "ball");
  btnBlock.classList.toggle("active", kind === "block");
}

function selectColor(hex) {
  selectedColor = hex;
  applyTexture();
  swatchContainer.querySelectorAll(".swatch").forEach((s) => {
    s.classList.toggle("active", s.dataset.color === hex);
  });
}

function selectPattern(pattern) {
  selectedPattern = pattern;
  applyTexture();
  document.querySelectorAll(".pattern-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.pattern === pattern);
  });
}

btnBall.addEventListener("click", () => selectShape("ball"));
btnBlock.addEventListener("click", () => selectShape("block"));
btnReset.addEventListener("click", resetSculpt);

const swatchContainer = document.getElementById("color-swatches");
COLORS.forEach((hex) => {
  const btn = document.createElement("button");
  btn.className = "swatch" + (hex === selectedColor ? " active" : "");
  btn.style.background = hex;
  btn.dataset.color = hex;
  btn.setAttribute("aria-label", hex);
  btn.addEventListener("click", () => selectColor(hex));
  swatchContainer.appendChild(btn);
});

document.querySelectorAll(".pattern-btn").forEach((btn) => {
  btn.addEventListener("click", () => selectPattern(btn.dataset.pattern));
});

// --- Save / load characters (localStorage gallery) ---

const STORAGE_KEY = "kdemaworld.characters";
const galleryEl = document.getElementById("character-gallery");
const btnSave = document.getElementById("btn-save");

function loadCharacters() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveCharacters(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function makeThumbnail() {
  renderer.render(scene, camera); // make sure the canvas reflects the latest sculpt/color
  const THUMB_SIZE = 96;
  const off = document.createElement("canvas");
  off.width = THUMB_SIZE;
  off.height = THUMB_SIZE;
  const ctx = off.getContext("2d");
  const cw = renderer.domElement.width;
  const ch = renderer.domElement.height;
  const s = Math.min(cw, ch); // centered square crop, avoids stretching
  ctx.drawImage(renderer.domElement, (cw - s) / 2, (ch - s) / 2, s, s, 0, 0, THUMB_SIZE, THUMB_SIZE);
  return off.toDataURL("image/png");
}

function captureCharacter() {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    shapeKind: currentShapeKind,
    positions: Array.from(mesh.geometry.attributes.position.array),
    color: selectedColor,
    pattern: selectedPattern,
    thumb: makeThumbnail(),
  };
}

function loadCharacter(char) {
  selectShape(char.shapeKind);
  const pos = mesh.geometry.attributes.position;
  pos.array.set(new Float32Array(char.positions));
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  selectColor(char.color);
  selectPattern(char.pattern);
}

function renderGallery() {
  const list = loadCharacters();
  galleryEl.innerHTML = "";
  list.forEach((char) => {
    const item = document.createElement("button");
    item.className = "gallery-item";

    const img = document.createElement("img");
    img.src = char.thumb;
    img.alt = "Saved character";
    item.appendChild(img);

    const del = document.createElement("button");
    del.className = "delete-btn";
    del.textContent = "×";
    del.setAttribute("aria-label", "Delete this character");
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      saveCharacters(loadCharacters().filter((c) => c.id !== char.id));
      renderGallery();
    });
    item.appendChild(del);

    item.addEventListener("click", () => loadCharacter(char));
    galleryEl.appendChild(item);
  });
}

btnSave.addEventListener("click", () => {
  const list = loadCharacters();
  list.push(captureCharacter());
  saveCharacters(list);
  renderGallery();
});

renderGallery();

// --- Resize + render loop ---

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

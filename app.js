import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const APP_VERSION = "KW_SYS_V.1.2";
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

// --- Shape / resolution ---

// Four resolution tiers, roughly matched in vertex-count order-of-magnitude
// between the two base shapes. Capped at icosahedron detail 15 (2562 verts,
// 5120 tris) / box 20 segments (~2400 verts) rather than going higher -- a
// plain linear per-frame scan over a few thousand verts is comfortably
// cheap on any modern JS engine (measured, not guessed, during this
// build), so the ceiling here is a deliberate safety margin for
// older/budget Android rather than a measured hard limit.
//
// Note: three.js's IcosahedronGeometry "detail" is a subdivision-frequency
// parameter, not an exponential recursion depth -- unique vertex count
// after welding is 10*(detail+1)^2 + 2, so hitting ~42/162/642/2562 verts
// needs detail = 1/3/7/15 (not 1/2/3/4, which only reaches 42/92/162/252).
const DETAIL_LEVELS = [
  { icosahedronDetail: 1, boxSegments: 2 },
  { icosahedronDetail: 3, boxSegments: 4 },
  { icosahedronDetail: 7, boxSegments: 8 },
  { icosahedronDetail: 15, boxSegments: 20 },
];

let mesh = null;
let basePositions = null; // Float32Array snapshot of the un-sculpted shape
let currentShapeKind = "ball";
let currentDetailLevel = 1;
const MAX_DISPLACE = 0.9;

function buildGeometry(kind, level) {
  const tier = DETAIL_LEVELS[level];
  let geo;
  if (kind === "ball") {
    geo = new THREE.IcosahedronGeometry(1, tier.icosahedronDetail);
  } else {
    geo = new THREE.BoxGeometry(1.4, 1.4, 1.4, tier.boxSegments, tier.boxSegments, tier.boxSegments);
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

// Carries the current sculpt over onto a rebuilt (higher/lower-res)
// geometry: for each vertex in the new base shape, find the nearest
// vertex in the old base shape and copy its current displacement
// (oldLive - oldBase) onto the new vertex. Grid-bucketed so this stays
// fast even at a couple thousand verts on each side -- this runs once
// per detail-slider change (not per frame), but a naive O(N*M) brute
// force at max resolution (~2500x2500) would still be a visible stall,
// so it's worth the extra bit of code.
function resampleDisplacements(oldBase, oldLive, newBase) {
  const oldCount = oldBase.length / 3;
  const newCount = newBase.length / 3;
  const cellSize = 0.15;
  const key = (x, y, z) => `${Math.floor(x / cellSize)}_${Math.floor(y / cellSize)}_${Math.floor(z / cellSize)}`;

  const grid = new Map();
  for (let i = 0; i < oldCount; i++) {
    const k = key(oldBase[i * 3], oldBase[i * 3 + 1], oldBase[i * 3 + 2]);
    let bucket = grid.get(k);
    if (!bucket) {
      bucket = [];
      grid.set(k, bucket);
    }
    bucket.push(i);
  }

  function findNearest(x, y, z) {
    const ix = Math.floor(x / cellSize);
    const iy = Math.floor(y / cellSize);
    const iz = Math.floor(z / cellSize);
    let best = -1;
    let bestD = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(`${ix + dx}_${iy + dy}_${iz + dz}`);
          if (!bucket) continue;
          for (const idx of bucket) {
            const ddx = oldBase[idx * 3] - x;
            const ddy = oldBase[idx * 3 + 1] - y;
            const ddz = oldBase[idx * 3 + 2] - z;
            const d = ddx * ddx + ddy * ddy + ddz * ddz;
            if (d < bestD) {
              bestD = d;
              best = idx;
            }
          }
        }
      }
    }
    if (best !== -1) return best;
    // Rare fallback (only if the 3x3x3 neighborhood was empty): brute
    // force over the old mesh, which is always modest in size (<=2562).
    for (let idx = 0; idx < oldCount; idx++) {
      const ddx = oldBase[idx * 3] - x;
      const ddy = oldBase[idx * 3 + 1] - y;
      const ddz = oldBase[idx * 3 + 2] - z;
      const d = ddx * ddx + ddy * ddy + ddz * ddz;
      if (d < bestD) {
        bestD = d;
        best = idx;
      }
    }
    return best;
  }

  const newLive = new Float32Array(newBase.length);
  for (let j = 0; j < newCount; j++) {
    const nx = newBase[j * 3];
    const ny = newBase[j * 3 + 1];
    const nz = newBase[j * 3 + 2];
    const nearest = findNearest(nx, ny, nz);
    const dx = oldLive[nearest * 3] - oldBase[nearest * 3];
    const dy = oldLive[nearest * 3 + 1] - oldBase[nearest * 3 + 1];
    const dz = oldLive[nearest * 3 + 2] - oldBase[nearest * 3 + 2];
    newLive[j * 3] = nx + dx;
    newLive[j * 3 + 1] = ny + dy;
    newLive[j * 3 + 2] = nz + dz;
  }
  return newLive;
}

function setShape(kind, level, preserveSculpt) {
  const newGeo = buildGeometry(kind, level);
  const freshBase = newGeo.attributes.position.array.slice();

  if (preserveSculpt && mesh && basePositions) {
    const oldLive = mesh.geometry.attributes.position.array;
    const resampled = resampleDisplacements(basePositions, oldLive, freshBase);
    newGeo.attributes.position.array.set(resampled);
    newGeo.attributes.position.needsUpdate = true;
    newGeo.computeVertexNormals();
  }

  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
  }
  mesh = new THREE.Mesh(newGeo, material);
  scene.add(mesh);

  basePositions = freshBase;
  currentShapeKind = kind;
  currentDetailLevel = level;
  window.__mesh = mesh;
}

function resetSculpt() {
  if (!mesh || !basePositions) return;
  const pos = mesh.geometry.attributes.position;
  pos.array.set(basePositions);
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

setShape("ball", currentDetailLevel, false);

// --- Sculpt interaction ---

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

const SCULPT_SENSITIVITY = 0.006; // screen pixels of vertical drag -> world units of push
const BRUSH_LONG = 1.6; // elongation multiplier for the long axis of rectangle/oval tips
const BRUSH_SHORT = 0.6;

let brushRadius = 0.85;
let brushHardness = 0; // 0 = soft falloff across the whole radius, 1 = flat "hard" top with a sharp rim
let brushShape = "circle"; // circle | square | rectangle | oval

let dragging = false;
let centerIndex = -1;
let centerNormal = new THREE.Vector3();
let centerTangentU = new THREE.Vector3();
let centerTangentV = new THREE.Vector3();
let lastClientY = 0;

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_RIGHT = new THREE.Vector3(1, 0, 0);

function buildTangentBasis(normal, outU, outV) {
  const ref = Math.abs(normal.y) < 0.99 ? WORLD_UP : WORLD_RIGHT;
  outU.crossVectors(ref, normal).normalize();
  outV.crossVectors(normal, outU).normalize();
}

// t <= 1 means "inside the brush footprint"; the footprint's shape in the
// (u, v) tangent plane is what makes the tip read as circle/square/etc.
function brushFootprint(u, v, radius, shapeName) {
  switch (shapeName) {
    case "square":
      return Math.max(Math.abs(u), Math.abs(v)) / radius;
    case "rectangle":
      return Math.max(Math.abs(u) / (radius * BRUSH_LONG), Math.abs(v) / (radius * BRUSH_SHORT));
    case "oval": {
      const a = radius * BRUSH_LONG;
      const b = radius * BRUSH_SHORT;
      return Math.sqrt((u / a) * (u / a) + (v / b) * (v / b));
    }
    case "circle":
    default:
      return Math.sqrt(u * u + v * v) / radius;
  }
}

// hardness 0 -> soft gradual falloff across the whole radius (matches the
// original fixed brush feel); hardness 1 -> flat full-strength plateau out
// to 90% of the radius, then a sharp-ish falloff in the last 10%.
function brushWeight(t, hardness) {
  if (t > 1) return 0;
  const edge = hardness * 0.9;
  if (t <= edge) return 1;
  const localT = (t - edge) / (1 - edge);
  return (1 - localT) * (1 - localT);
}

// Scratch vectors reused across every vertex of every brush application so
// sculpting at a couple thousand verts doesn't allocate thousands of
// throwaway Vector3s per frame (that GC pressure is a real jank risk on
// weaker phones even though the plain math loop itself is cheap).
const scratchBasePt = new THREE.Vector3();
const scratchOffset = new THREE.Vector3();
const scratchV = new THREE.Vector3();
const scratchDiff = new THREE.Vector3();

function applyBrush(pos, refCenter, refNormal, tangentU, tangentV, pushAmount) {
  for (let i = 0; i < pos.count; i++) {
    scratchBasePt.set(basePositions[i * 3], basePositions[i * 3 + 1], basePositions[i * 3 + 2]);
    scratchOffset.copy(scratchBasePt).sub(refCenter);

    const u = scratchOffset.dot(tangentU);
    const v = scratchOffset.dot(tangentV);
    const t = brushFootprint(u, v, brushRadius, brushShape);
    const weight = brushWeight(t, brushHardness);
    if (weight <= 0) continue;

    scratchV.fromBufferAttribute(pos, i);
    scratchV.addScaledVector(refNormal, pushAmount * weight);

    scratchDiff.copy(scratchV).sub(scratchBasePt);
    if (scratchDiff.length() > MAX_DISPLACE) {
      scratchDiff.setLength(MAX_DISPLACE);
      scratchV.copy(scratchBasePt).add(scratchDiff);
    }
    pos.setXYZ(i, scratchV.x, scratchV.y, scratchV.z);
  }
}

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
  buildTangentBasis(centerNormal, centerTangentU, centerTangentV);

  lastClientY = clientY;

  dragging = true;
  controls.enabled = false;
}

const mirrorCenter = new THREE.Vector3();
const mirrorNormal = new THREE.Vector3();
const mirrorTangentU = new THREE.Vector3();
const mirrorTangentV = new THREE.Vector3();

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

  applyBrush(pos, centerBase, centerNormal, centerTangentU, centerTangentV, pushAmount);

  if (mirrorEnabled) {
    mirrorCenter.copy(centerBase);
    mirrorCenter.x *= -1;
    mirrorNormal.copy(centerNormal);
    mirrorNormal.x *= -1;
    buildTangentBasis(mirrorNormal, mirrorTangentU, mirrorTangentV);
    applyBrush(pos, mirrorCenter, mirrorNormal, mirrorTangentU, mirrorTangentV, pushAmount);
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
const detailSlider = document.getElementById("detail-slider");
const detailValueEl = document.getElementById("detail-value");
const brushSizeSlider = document.getElementById("brush-size");
const brushHardnessSlider = document.getElementById("brush-hardness");

chkMirror.addEventListener("change", () => {
  mirrorEnabled = chkMirror.checked;
  mirrorPlane.visible = mirrorEnabled;
});

function updateDetailLabel() {
  detailValueEl.textContent = `${window.__lastVertexCount} pts`;
}

// Shared select-helpers so both direct UI clicks and loading a saved
// character (further down) update state + button highlighting the same way.

function selectShape(kind, level = currentDetailLevel, preserveSculpt = false) {
  setShape(kind, level, preserveSculpt);
  btnBall.classList.toggle("active", kind === "ball");
  btnBlock.classList.toggle("active", kind === "block");
  detailSlider.value = String(level);
  updateDetailLabel();
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

function selectBrushShape(shapeName) {
  brushShape = shapeName;
  document.querySelectorAll(".shape-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.shape === shapeName);
  });
}

btnBall.addEventListener("click", () => selectShape("ball"));
btnBlock.addEventListener("click", () => selectShape("block"));
btnReset.addEventListener("click", resetSculpt);

detailSlider.addEventListener("input", () => {
  selectShape(currentShapeKind, Number(detailSlider.value), true);
});

brushSizeSlider.addEventListener("input", () => {
  brushRadius = Number(brushSizeSlider.value);
});
brushHardnessSlider.addEventListener("input", () => {
  brushHardness = Number(brushHardnessSlider.value);
});

document.querySelectorAll(".shape-btn").forEach((btn) => {
  btn.addEventListener("click", () => selectBrushShape(btn.dataset.shape));
});

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

updateDetailLabel(); // reflect the initial setShape() call above

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
    detailLevel: currentDetailLevel,
    positions: Array.from(mesh.geometry.attributes.position.array),
    color: selectedColor,
    pattern: selectedPattern,
    thumb: makeThumbnail(),
  };
}

function loadCharacter(char) {
  selectShape(char.shapeKind, char.detailLevel ?? 0, false);
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

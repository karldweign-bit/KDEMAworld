'use strict';

/* ===================== VIEW SWITCHING ===================== */
const screens = document.querySelectorAll('.screen');
let activeGame = null;

function showScreen(id) {
  screens.forEach(s => s.classList.toggle('active', s.id === id));
}

function goHome() {
  if (activeGame === 'paint') Paint.stop();
  activeGame = null;
  showScreen('home');
}

document.querySelectorAll('[data-home]').forEach(btn => btn.addEventListener('click', goHome));

document.querySelectorAll('.game-card').forEach(card => {
  card.addEventListener('click', () => {
    const game = card.dataset.game;
    activeGame = game;
    showScreen('game-' + game);
    if (game === 'pop') Pop.start();
    if (game === 'zoo') Zoo.start();
    if (game === 'paint') Paint.start();
    if (game === 'peekaboo') Peekaboo.start();
  });
});

/* ===================== AUDIO (synthesized, no assets) ===================== */
const AudioFX = (() => {
  let ctx = null;
  function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function chime(pitchFreq = 523.25) {
    try {
      const c = ensureCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(pitchFreq, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(pitchFreq * 1.5, c.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + 0.4);
    } catch (e) { /* autoplay blocked, ignore */ }
  }

  function giggle() {
    [660, 880, 990, 1200].forEach((f, i) => setTimeout(() => chime(f), i * 80));
  }

  return { chime, giggle, ensureCtx };
})();

document.addEventListener('pointerdown', () => AudioFX.ensureCtx(), { once: true });

/* ===================== POP & GIGGLE ===================== */
const Pop = (() => {
  const stage = document.getElementById('bubble-stage');
  const counterLabel = document.getElementById('pop-counter-label');
  const btnMore = document.getElementById('btn-more-bubbles');
  const btnWand = document.getElementById('btn-wand-stream');

  let popCount = 0;
  let inited = false;

  const words = ['POP!', 'GIGGLE!', 'PING!', 'WHEEE!', 'YAY!', 'SPARKLE!'];
  const bubbleColors = [
    { bg: 'from-secondary-container to-secondary-fixed', shadow: 'rgba(253,147,61,0.35)', iconColor: 'text-on-secondary-container', icon: 'sentiment_very_satisfied' },
    { bg: 'from-tertiary-container to-tertiary-fixed', shadow: 'rgba(255,140,197,0.35)', iconColor: 'text-on-tertiary-container', icon: 'face_4' },
    { bg: 'from-primary-container to-primary-fixed', shadow: 'rgba(56,189,248,0.35)', iconColor: 'text-on-primary-container', icon: 'star' },
    { bg: 'from-surface-container-highest to-surface-container', shadow: 'rgba(0,102,138,0.2)', iconColor: 'text-primary', icon: 'music_note' },
    { bg: 'from-primary-fixed to-surface-bright', shadow: 'rgba(123,208,255,0.25)', iconColor: 'text-on-primary-container', icon: 'sentiment_satisfied' }
  ];

  function triggerPopVisual(x, y, word) {
    popCount++;
    counterLabel.textContent = popCount + ' Popped!';

    const popSplash = document.createElement('div');
    popSplash.className = 'absolute pointer-events-none z-30 flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-1/2';
    popSplash.style.left = x + 'px';
    popSplash.style.top = y + 'px';

    const comicBadge = document.createElement('div');
    comicBadge.className = 'px-3 py-1 bg-tertiary text-on-tertiary font-headline-sm text-headline-sm rounded-full shadow-[0_4px_0_#811057] scale-125';
    comicBadge.textContent = word || words[Math.floor(Math.random() * words.length)];

    for (let i = 0; i < 6; i++) {
      const spark = document.createElement('div');
      const angle = (i * 60) * (Math.PI / 180);
      const dist = 40;
      spark.className = 'absolute w-3.5 h-3.5 rounded-full bg-secondary-container shadow-sm';
      spark.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`;
      popSplash.appendChild(spark);
    }
    popSplash.appendChild(comicBadge);
    stage.appendChild(popSplash);
    setTimeout(() => popSplash.remove(), 500);
  }

  function spawnBubble(customX, customY, sizeClass) {
    const theme = bubbleColors[Math.floor(Math.random() * bubbleColors.length)];
    const size = sizeClass || (Math.floor(Math.random() * 50) + 70);
    const b = document.createElement('div');
    b.className = `bubble-node absolute rounded-full bg-gradient-to-tr ${theme.bg} cursor-pointer flex items-center justify-center transition-transform active:scale-90`;
    b.style.width = size + 'px';
    b.style.height = size + 'px';
    b.style.boxShadow = `0 10px 20px ${theme.shadow}`;

    const stageWidth = stage.clientWidth || 360;
    const stageHeight = stage.clientHeight || 560;
    const posX = customX !== undefined ? Math.max(10, customX - size / 2) : Math.random() * (stageWidth - size - 20) + 10;
    const posY = customY !== undefined ? Math.max(10, customY - size / 2) : Math.random() * (stageHeight - size - 80) + 40;
    b.style.left = posX + 'px';
    b.style.top = posY + 'px';

    const glint = document.createElement('div');
    glint.className = 'absolute top-1.5 left-2 w-6 h-3 rounded-full bg-white/80 rotate-[-20deg] blur-[0.5px] pointer-events-none';
    b.appendChild(glint);

    const icon = document.createElement('span');
    icon.className = `material-symbols-outlined text-[32px] ${theme.iconColor} select-none pointer-events-none`;
    icon.textContent = theme.icon;
    b.appendChild(icon);

    stage.appendChild(b);
    attachBubbleListener(b);
  }

  function attachBubbleListener(bubbleEl) {
    bubbleEl.addEventListener('pointerdown', function handlePop(e) {
      e.stopPropagation();
      const rect = bubbleEl.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const clickX = rect.left - stageRect.left + rect.width / 2;
      const clickY = rect.top - stageRect.top + rect.height / 2;

      AudioFX.chime(500 + Math.random() * 400);
      triggerPopVisual(clickX, clickY, words[Math.floor(Math.random() * words.length)]);
      bubbleEl.remove();

      setTimeout(() => spawnBubble(), 1200);
    });
  }

  stage.addEventListener('pointerdown', e => {
    if (e.target === stage) {
      const stageRect = stage.getBoundingClientRect();
      const x = e.clientX - stageRect.left;
      const y = e.clientY - stageRect.top;
      AudioFX.chime(650);
      triggerPopVisual(x, y, 'PING!');
      spawnBubble(x, y, 64);
    }
  });

  btnMore.addEventListener('click', () => {
    AudioFX.chime(784);
    for (let i = 0; i < 4; i++) setTimeout(() => spawnBubble(), i * 140);
  });

  btnWand.addEventListener('click', () => {
    AudioFX.chime(880);
    let streamCount = 0;
    const wandInterval = setInterval(() => {
      spawnBubble();
      streamCount++;
      if (streamCount > 7) clearInterval(wandInterval);
    }, 180);
  });

  function start() {
    if (!inited) {
      inited = true;
      for (let i = 0; i < 5; i++) spawnBubble();
    }
  }

  return { start };
})();

/* ===================== GENERIC INDEXEDDB KEY-VALUE STORE (per-device) ===================== */
function IDBStore(dbName, storeName) {
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(storeName); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function set(id, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function remove(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const result = {};
      const req = tx.objectStore(storeName).openCursor();
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) { result[cursor.key] = cursor.value; cursor.continue(); }
        else resolve(result);
      };
      req.onerror = () => reject(req.error);
    });
  }

  return { set, remove, getAll };
}

const SoundStore = IDBStore('kdemaZooSounds', 'sounds');
const ImageStore = IDBStore('kdemaPeekabooImages', 'images');

/* ===================== ADMIN (shared passcode gate + panel modal) ===================== */
const Admin = (() => {
  const modal = document.getElementById('admin-modal');
  const gate = document.getElementById('admin-gate');
  const panel = document.getElementById('admin-panel');
  const passcodeInput = document.getElementById('admin-passcode-input');
  const passcodeSubmit = document.getElementById('admin-passcode-submit');
  const passcodeError = document.getElementById('admin-passcode-error');
  const gateCancel = document.getElementById('admin-gate-cancel');
  const closeBtn = document.getElementById('admin-close-btn');
  const titleEl = document.getElementById('admin-panel-title');
  const descEl = document.getElementById('admin-panel-desc');
  const listEl = document.getElementById('admin-list');

  const ADMIN_PASSCODE = '090515';
  let currentConfig = null;

  function open(config) {
    currentConfig = config;
    modal.style.display = 'flex';
    gate.style.display = 'flex';
    panel.style.display = 'none';
    passcodeError.classList.add('hidden');
    passcodeInput.value = '';
  }
  function close() {
    modal.style.display = 'none';
    if (currentConfig && currentConfig.onClose) currentConfig.onClose();
  }
  function unlock() {
    gate.style.display = 'none';
    panel.style.display = 'flex';
    titleEl.textContent = currentConfig.title;
    descEl.textContent = currentConfig.desc;
    listEl.innerHTML = '';
    currentConfig.render(listEl);
  }

  gateCancel.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  passcodeSubmit.addEventListener('click', () => {
    if (passcodeInput.value === ADMIN_PASSCODE) unlock();
    else {
      passcodeError.classList.remove('hidden');
      passcodeInput.value = '';
    }
  });
  passcodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') passcodeSubmit.click(); });

  return { open, close, get listEl() { return listEl; } };
})();

/* ===================== ANIMAL ZOO ===================== */
const Zoo = (() => {
  const grid = document.getElementById('animal-grid');
  const btnSing = document.getElementById('btn-sing-along');
  const btnSurprise = document.getElementById('btn-surprise');
  let built = false;

  const adminOpenBtn = document.getElementById('admin-open-btn');

  const customAudio = {}; // id -> { blob, url }

  const animals = [
    { id: 'cow', label: 'Cow', word: 'MOOO!', freq: 220, cardClass: 'bg-primary-container text-on-primary-container', shadow: '#004965',
      svg: `<circle cx="50" cy="54" fill="#ffffff" r="34"/><ellipse cx="40" cy="44" fill="#0d1c2e" rx="9" ry="12"/><ellipse cx="68" cy="50" fill="#0d1c2e" rx="7" ry="9"/><ellipse cx="28" cy="24" fill="#0d1c2e" rx="10" ry="6" transform="rotate(-30 28 24)"/><ellipse cx="72" cy="24" fill="#0d1c2e" rx="10" ry="6" transform="rotate(30 72 24)"/><ellipse cx="50" cy="64" fill="#ffafd3" rx="20" ry="14"/><circle cx="43" cy="62" fill="#811057" r="3"/><circle cx="57" cy="62" fill="#811057" r="3"/><circle cx="39" cy="44" fill="#00668a" r="3.5"/><circle cx="61" cy="44" fill="#00668a" r="3.5"/><circle cx="41" cy="42" fill="#ffffff" r="1.5"/><circle cx="63" cy="42" fill="#ffffff" r="1.5"/><path d="M44 70 C47 74 53 74 56 70" stroke="#811057" stroke-linecap="round" stroke-width="2"/>` },
    { id: 'lion', label: 'Lion', word: 'ROAAR!', freq: 130, cardClass: 'bg-secondary-container text-on-secondary-container', shadow: '#693300',
      svg: `<circle cx="50" cy="50" fill="#ffb783" r="38"/><circle cx="50" cy="50" fill="#944a00" r="34" stroke="#ffdcc5" stroke-dasharray="8 6" stroke-width="3"/><circle cx="50" cy="52" fill="#ffdcc5" r="24"/><circle cx="30" cy="30" fill="#ffdcc5" r="7"/><circle cx="70" cy="30" fill="#ffdcc5" r="7"/><circle cx="41" cy="48" fill="#301400" r="3"/><circle cx="59" cy="48" fill="#301400" r="3"/><polygon fill="#944a00" points="50,56 46,52 54,52"/><path d="M46 58 Q50 63 54 58" stroke="#301400" stroke-linecap="round" stroke-width="2"/>` },
    { id: 'duck', label: 'Duck', word: 'QUACK!', freq: 392, cardClass: 'bg-surface-container-highest text-on-surface', shadow: '#ccdbf3',
      svg: `<circle cx="46" cy="54" fill="#ffdcc5" r="28"/><circle cx="56" cy="40" fill="#ffdcc5" r="18"/><circle cx="58" cy="36" fill="#0d1c2e" r="3"/><ellipse cx="74" cy="42" fill="#fd933d" rx="10" ry="5"/><path d="M30 52 C30 62 42 66 50 66 C42 66 36 60 30 52 Z" fill="#ffb783"/>` },
    { id: 'frog', label: 'Frog', word: 'RIBBIT!', freq: 330, cardClass: 'bg-primary-fixed text-on-primary-fixed', shadow: '#7bd0ff',
      svg: `<circle cx="34" cy="36" fill="#7bd0ff" r="11"/><circle cx="66" cy="36" fill="#7bd0ff" r="11"/><circle cx="34" cy="35" fill="#ffffff" r="5"/><circle cx="66" cy="35" fill="#ffffff" r="5"/><circle cx="35" cy="35" fill="#004965" r="2.5"/><circle cx="67" cy="35" fill="#004965" r="2.5"/><ellipse cx="50" cy="56" fill="#7bd0ff" rx="30" ry="22"/><ellipse cx="50" cy="62" fill="#c4e7ff" rx="18" ry="12"/><path d="M38 56 Q50 66 62 56" stroke="#004965" stroke-linecap="round" stroke-width="2.5"/>` },
    { id: 'puppy', label: 'Puppy', word: 'WOOF!', freq: 260, cardClass: 'bg-secondary-fixed text-on-secondary-fixed', shadow: '#ffb783',
      svg: `<ellipse cx="28" cy="46" fill="#944a00" rx="8" ry="16" transform="rotate(-15 28 46)"/><ellipse cx="72" cy="46" fill="#944a00" rx="8" ry="16" transform="rotate(15 72 46)"/><circle cx="50" cy="52" fill="#ffffff" r="28"/><circle cx="41" cy="46" fill="#301400" r="3.5"/><circle cx="59" cy="46" fill="#301400" r="3.5"/><ellipse cx="50" cy="54" fill="#301400" rx="5" ry="3.5"/><path d="M46 58 Q50 63 54 58" stroke="#301400" stroke-linecap="round" stroke-width="2"/>` },
    { id: 'kitty', label: 'Kitty', word: 'MEOW!', freq: 523, cardClass: 'bg-tertiary-fixed text-on-tertiary-fixed', shadow: '#ffafd3',
      svg: `<polygon fill="#ffafd3" points="26,38 34,20 46,32"/><polygon fill="#ffafd3" points="74,38 66,20 54,32"/><circle cx="50" cy="54" fill="#ffafd3" r="28"/><circle cx="40" cy="50" fill="#3d0026" r="3"/><circle cx="60" cy="50" fill="#3d0026" r="3"/><polygon fill="#811057" points="50,56 47,53 53,53"/><path d="M47 58 Q50 61 53 58" stroke="#3d0026" stroke-linecap="round" stroke-width="1.5"/>` }
  ];

  function playAnimalSound(a) {
    const custom = customAudio[a.id];
    if (custom) {
      const audio = new Audio(custom.url);
      audio.play().catch(() => AudioFX.chime(a.freq));
    } else {
      AudioFX.chime(a.freq);
    }
  }

  function triggerAnimalJoy(el, a) {
    playAnimalSound(a);
    el.classList.add('scale-110');
    setTimeout(() => el.classList.remove('scale-110'), 350);

    const rect = el.getBoundingClientRect();
    const particle = document.createElement('div');
    particle.className = 'fixed pointer-events-none z-50 flex items-center gap-1 font-label-lg text-label-lg text-primary px-3 py-1 bg-surface-container-lowest rounded-full shadow-lg';
    particle.style.left = (rect.left + rect.width / 2 - 40) + 'px';
    particle.style.top = (rect.top + 10) + 'px';
    particle.innerHTML = `<span>${a.word}</span>`;
    document.body.appendChild(particle);

    let pos = 0;
    const anim = setInterval(() => {
      pos += 3;
      particle.style.transform = `translateY(-${pos}px) scale(${1 + pos / 100})`;
      particle.style.opacity = String(1 - pos / 70);
      if (pos >= 70) { clearInterval(anim); particle.remove(); }
    }, 16);
  }

  function build() {
    grid.innerHTML = '';
    animals.forEach(a => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `group relative flex flex-col items-center justify-between p-space-sm rounded-xl ${a.cardClass} shadow-[0_8px_0_${a.shadow}] active:translate-y-1.5 active:shadow-[0_2px_0_${a.shadow}] transition-all min-h-[190px] overflow-hidden`;
      btn.innerHTML = `
        <div class="relative w-24 h-24 my-auto flex items-center justify-center transition-transform group-active:scale-110">
          <svg class="w-24 h-24 drop-shadow-md" fill="none" viewBox="0 0 100 100">${a.svg}</svg>
        </div>
        <div class="w-full text-center">
          <span class="inline-block px-space-sm py-0.5 rounded-full bg-surface-container-lowest text-on-surface font-label-md text-label-md tracking-wider shadow-sm">${a.word}</span>
        </div>`;
      btn.addEventListener('click', () => triggerAnimalJoy(btn, a));
      grid.appendChild(btn);
    });
    built = true;
  }

  btnSing.addEventListener('click', () => {
    Array.from(grid.children).forEach((btn, i) => setTimeout(() => btn.click(), i * 220));
  });

  btnSurprise.addEventListener('click', () => {
    const cards = Array.from(grid.children);
    const lucky = cards[Math.floor(Math.random() * cards.length)];
    lucky.classList.add('animate-bounce');
    lucky.click();
    setTimeout(() => lucky.classList.remove('animate-bounce'), 1200);
  });

  /* ---- Admin: upload custom sounds per animal (stored in IndexedDB, this device only) ---- */
  async function loadCustomAudio() {
    const stored = await SoundStore.getAll();
    Object.keys(stored).forEach(id => {
      const blob = stored[id];
      if (customAudio[id]) URL.revokeObjectURL(customAudio[id].url);
      customAudio[id] = { blob, url: URL.createObjectURL(blob) };
    });
  }

  function renderAdminList(listEl) {
    animals.forEach(a => {
      const hasCustom = !!customAudio[a.id];
      const row = document.createElement('div');
      row.className = 'flex items-center gap-space-sm p-space-sm rounded-lg bg-surface-container';
      row.innerHTML = `
        <div class="flex-1 flex flex-col min-w-0">
          <span class="font-label-md text-label-md text-on-surface">${a.label}</span>
          <span class="font-body-sm text-body-sm text-on-surface-variant" data-status>${hasCustom ? 'Custom sound uploaded' : 'Using default chime'}</span>
        </div>
        <button class="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center flex-shrink-0" data-play type="button" aria-label="Preview sound"><span class="material-symbols-outlined text-[20px]">play_arrow</span></button>
        <label class="w-10 h-10 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center flex-shrink-0 cursor-pointer" aria-label="Upload sound">
          <span class="material-symbols-outlined text-[20px]">upload</span>
          <input accept="audio/*" class="hidden" data-upload type="file"/>
        </label>
        <button class="w-10 h-10 rounded-full bg-surface-container-highest text-on-surface-variant flex items-center justify-center flex-shrink-0" data-reset type="button" aria-label="Reset to default"><span class="material-symbols-outlined text-[20px]">restart_alt</span></button>`;

      row.querySelector('[data-play]').addEventListener('click', () => playAnimalSound(a));

      row.querySelector('[data-upload]').addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          await SoundStore.set(a.id, file);
          if (customAudio[a.id]) URL.revokeObjectURL(customAudio[a.id].url);
          customAudio[a.id] = { blob: file, url: URL.createObjectURL(file) };
          row.querySelector('[data-status]').textContent = 'Custom sound uploaded';
          AudioFX.chime(700);
        } catch (err) {
          console.error('Failed to save sound for', a.id, err);
          row.querySelector('[data-status]').textContent = 'Upload failed — try again';
        }
      });

      row.querySelector('[data-reset]').addEventListener('click', async () => {
        if (!customAudio[a.id]) return;
        await SoundStore.remove(a.id);
        URL.revokeObjectURL(customAudio[a.id].url);
        delete customAudio[a.id];
        row.querySelector('[data-status]').textContent = 'Using default chime';
        AudioFX.chime(400);
      });

      listEl.appendChild(row);
    });
  }

  adminOpenBtn.addEventListener('click', () => {
    Admin.open({
      title: 'Animal Sounds',
      desc: 'Upload a short sound clip per animal. Saved on this device only.',
      render: renderAdminList
    });
  });

  function start() {
    if (!built) build();
    loadCustomAudio();
  }

  return { start };
})();

/* ===================== FLUID SIMULATION (WebGL Navier-Stokes, "Fluid Flow" brush) ===================== */
const FluidSim = (() => {
  const SIM_RESOLUTION = 128;
  const DYE_RESOLUTION = 512;
  const PRESSURE_ITERATIONS = 20;
  const VELOCITY_DISSIPATION = 0.22;
  const DENSITY_DISSIPATION = 1.2;
  const PRESSURE_DISSIPATION = 0.8;
  const CURL_STRENGTH = 28;
  const SPLAT_RADIUS = 0.0022;
  const SPLAT_FORCE = 6000;

  let gl = null;
  let halfFloat = null;
  let supportLinear = false;
  let ready = false;
  let raf = null;
  let canvasEl = null;
  let lastTime = 0;
  let hue = 0;

  let programs = {};
  let velocity, dye, divergence, curlFbo, pressure;
  let quadBuffer;

  const baseVertexSrc = `
    precision highp float;
    attribute vec2 aPosition;
    varying vec2 vUv, vL, vR, vT, vB;
    uniform vec2 texelSize;
    void main () {
      vUv = aPosition * 0.5 + 0.5;
      vL = vUv - vec2(texelSize.x, 0.0);
      vR = vUv + vec2(texelSize.x, 0.0);
      vT = vUv + vec2(0.0, texelSize.y);
      vB = vUv - vec2(0.0, texelSize.y);
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }`;

  const fragShaders = {
    clear: `
      precision highp float; precision highp sampler2D;
      varying vec2 vUv; uniform sampler2D uTexture; uniform float value;
      void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`,
    splat: `
      precision highp float; precision highp sampler2D;
      varying vec2 vUv; uniform sampler2D uTarget; uniform float aspectRatio;
      uniform vec3 color; uniform vec2 point; uniform float radius;
      void main () {
        vec2 p = vUv - point.xy;
        p.x *= aspectRatio;
        vec3 splat = exp(-dot(p, p) / radius) * color;
        vec3 base = texture2D(uTarget, vUv).xyz;
        gl_FragColor = vec4(base + splat, 1.0);
      }`,
    advection: `
      precision highp float; precision highp sampler2D;
      varying vec2 vUv; uniform sampler2D uVelocity; uniform sampler2D uSource;
      uniform vec2 texelSize; uniform float dt; uniform float dissipation;
      void main () {
        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
        vec4 result = texture2D(uSource, coord);
        float decay = 1.0 + dissipation * dt;
        gl_FragColor = result / decay;
      }`,
    divergence: `
      precision highp float; precision highp sampler2D;
      varying vec2 vUv, vL, vR, vT, vB; uniform sampler2D uVelocity;
      void main () {
        float L = texture2D(uVelocity, vL).x;
        float R = texture2D(uVelocity, vR).x;
        float T = texture2D(uVelocity, vT).y;
        float B = texture2D(uVelocity, vB).y;
        vec2 C = texture2D(uVelocity, vUv).xy;
        if (vL.x < 0.0) { L = -C.x; }
        if (vR.x > 1.0) { R = -C.x; }
        if (vT.y > 1.0) { T = -C.y; }
        if (vB.y < 0.0) { B = -C.y; }
        gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
      }`,
    curl: `
      precision highp float; precision highp sampler2D;
      varying vec2 vUv, vL, vR, vT, vB; uniform sampler2D uVelocity;
      void main () {
        float L = texture2D(uVelocity, vL).y;
        float R = texture2D(uVelocity, vR).y;
        float T = texture2D(uVelocity, vT).x;
        float B = texture2D(uVelocity, vB).x;
        gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
      }`,
    vorticity: `
      precision highp float; precision highp sampler2D;
      varying vec2 vUv, vL, vR, vT, vB;
      uniform sampler2D uVelocity; uniform sampler2D uCurl;
      uniform float curlStrength; uniform float dt;
      void main () {
        float L = texture2D(uCurl, vL).x;
        float R = texture2D(uCurl, vR).x;
        float T = texture2D(uCurl, vT).x;
        float B = texture2D(uCurl, vB).x;
        float C = texture2D(uCurl, vUv).x;
        vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + 0.0001;
        force *= curlStrength * C;
        force.y *= -1.0;
        vec2 velocity = texture2D(uVelocity, vUv).xy + force * dt;
        gl_FragColor = vec4(clamp(velocity, -1000.0, 1000.0), 0.0, 1.0);
      }`,
    pressure: `
      precision highp float; precision highp sampler2D;
      varying vec2 vUv, vL, vR, vT, vB;
      uniform sampler2D uPressure; uniform sampler2D uDivergence;
      void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        float divergence = texture2D(uDivergence, vUv).x;
        float pressure = (L + R + B + T - divergence) * 0.25;
        gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
      }`,
    gradientSubtract: `
      precision highp float; precision highp sampler2D;
      varying vec2 vUv, vL, vR, vT, vB;
      uniform sampler2D uPressure; uniform sampler2D uVelocity;
      void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        vec2 velocity = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
      }`,
    display: `
      precision highp float; precision highp sampler2D;
      varying vec2 vUv; uniform sampler2D uTexture;
      void main () { gl_FragColor = vec4(texture2D(uTexture, vUv).rgb, 1.0); }`
  };

  function compile(type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Fluid shader error:', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  function createProgram(fragSrc) {
    const vs = compile(gl.VERTEX_SHADER, baseVertexSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Fluid program link error:', gl.getProgramInfoLog(program));
      return null;
    }
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    return { program, uniforms };
  }

  function useProgram(p) {
    gl.useProgram(p.program);
    return p;
  }

  function blit() {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function createFBO(w, h, internalFormat, format, type, filter) {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      texture, fbo, width: w, height: h,
      texelSizeX: 1 / w, texelSizeY: 1 / h,
      attach(id) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      }
    };
  }

  function createDoubleFBO(w, h, internalFormat, format, type, filter) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, filter);
    let fbo2 = createFBO(w, h, internalFormat, format, type, filter);
    return {
      get read() { return fbo1; },
      get write() { return fbo2; },
      swap() { const tmp = fbo1; fbo1 = fbo2; fbo2 = tmp; }
    };
  }

  function checkFramebufferSupport(internalFormat, format, type) {
    const fbo = createFBO(4, 4, internalFormat, format, type, gl.NEAREST);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.deleteFramebuffer(fbo.fbo);
    gl.deleteTexture(fbo.texture);
    return status;
  }

  function init(canvas) {
    canvasEl = canvas;
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false })
        || canvas.getContext('experimental-webgl');
    } catch (e) { gl = null; }
    if (!gl) return false;

    halfFloat = gl.getExtension('OES_texture_half_float');
    const linearExt = gl.getExtension('OES_texture_half_float_linear');
    if (!gl.getExtension('WEBGL_color_buffer_float')) { /* not required for WebGL1 half-float path */ }
    if (!halfFloat) return false;
    supportLinear = !!linearExt;

    const texType = halfFloat.HALF_FLOAT_OES;
    if (!checkFramebufferSupport(gl.RGBA, gl.RGBA, texType)) return false;

    const filter = supportLinear ? gl.LINEAR : gl.NEAREST;

    quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    Object.keys(fragShaders).forEach(name => { programs[name] = createProgram(fragShaders[name]); });

    const simW = SIM_RESOLUTION, simH = SIM_RESOLUTION;
    velocity = createDoubleFBO(simW, simH, gl.RGBA, gl.RGBA, texType, filter);
    divergence = createFBO(simW, simH, gl.RGBA, gl.RGBA, texType, gl.NEAREST);
    curlFbo = createFBO(simW, simH, gl.RGBA, gl.RGBA, texType, gl.NEAREST);
    pressure = createDoubleFBO(simW, simH, gl.RGBA, gl.RGBA, texType, gl.NEAREST);
    dye = createDoubleFBO(DYE_RESOLUTION, DYE_RESOLUTION, gl.RGBA, gl.RGBA, texType, filter);

    ready = true;
    resize();
    return true;
  }

  function resize() {
    if (!gl || !canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * Math.min(window.devicePixelRatio, 2)));
    const h = Math.max(1, Math.round(rect.height * Math.min(window.devicePixelRatio, 2)));
    if (canvasEl.width !== w || canvasEl.height !== h) {
      canvasEl.width = w;
      canvasEl.height = h;
    }
  }

  function setUniforms(p, values) {
    Object.keys(values).forEach(key => {
      const loc = p.uniforms[key];
      if (loc == null) return;
      const v = values[key];
      if (Array.isArray(v)) {
        if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
        else if (v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]);
      } else {
        gl.uniform1f(loc, v);
      }
    });
  }

  function step(dt) {
    gl.disable(gl.BLEND);

    gl.viewport(0, 0, SIM_RESOLUTION, SIM_RESOLUTION);

    let p = useProgram(programs.curl);
    setUniforms(p, { texelSize: [velocity.read.texelSizeX, velocity.read.texelSizeY] });
    gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(0));
    gl.bindFramebuffer(gl.FRAMEBUFFER, curlFbo.fbo);
    blit();

    p = useProgram(programs.vorticity);
    setUniforms(p, { texelSize: [velocity.read.texelSizeX, velocity.read.texelSizeY], curlStrength: CURL_STRENGTH, dt });
    gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(p.uniforms.uCurl, curlFbo.attach(1));
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
    blit();
    velocity.swap();

    p = useProgram(programs.divergence);
    setUniforms(p, { texelSize: [velocity.read.texelSizeX, velocity.read.texelSizeY] });
    gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(0));
    gl.bindFramebuffer(gl.FRAMEBUFFER, divergence.fbo);
    blit();

    p = useProgram(programs.clear);
    gl.uniform1i(p.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(p.uniforms.value, PRESSURE_DISSIPATION);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.write.fbo);
    blit();
    pressure.swap();

    p = useProgram(programs.pressure);
    setUniforms(p, { texelSize: [velocity.read.texelSizeX, velocity.read.texelSizeY] });
    gl.uniform1i(p.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(p.uniforms.uPressure, pressure.read.attach(1));
      gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.write.fbo);
      blit();
      pressure.swap();
    }

    p = useProgram(programs.gradientSubtract);
    setUniforms(p, { texelSize: [velocity.read.texelSizeX, velocity.read.texelSizeY] });
    gl.uniform1i(p.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(1));
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
    blit();
    velocity.swap();

    p = useProgram(programs.advection);
    setUniforms(p, { texelSize: [velocity.read.texelSizeX, velocity.read.texelSizeY], dt, dissipation: VELOCITY_DISSIPATION });
    gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(p.uniforms.uSource, velocity.read.attach(0));
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
    blit();
    velocity.swap();

    gl.viewport(0, 0, dye.read.width, dye.read.height);
    setUniforms(p, { texelSize: [velocity.read.texelSizeX, velocity.read.texelSizeY], dt, dissipation: DENSITY_DISSIPATION });
    gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(p.uniforms.uSource, dye.read.attach(1));
    gl.bindFramebuffer(gl.FRAMEBUFFER, dye.write.fbo);
    blit();
    dye.swap();
  }

  function render() {
    gl.viewport(0, 0, canvasEl.width, canvasEl.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const p = useProgram(programs.display);
    gl.uniform1i(p.uniforms.uTexture, dye.read.attach(0));
    blit();
  }

  function splatAt(xNorm, yNorm, dx, dy, color) {
    if (!ready) return;
    let p = useProgram(programs.splat);
    gl.viewport(0, 0, SIM_RESOLUTION, SIM_RESOLUTION);
    gl.uniform1i(p.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(p.uniforms.aspectRatio, canvasEl.width / canvasEl.height);
    gl.uniform2f(p.uniforms.point, xNorm, yNorm);
    gl.uniform3f(p.uniforms.color, dx, dy, 0.0);
    gl.uniform1f(p.uniforms.radius, SPLAT_RADIUS);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
    blit();
    velocity.swap();

    gl.viewport(0, 0, dye.read.width, dye.read.height);
    gl.uniform1i(p.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(p.uniforms.color, color[0], color[1], color[2]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dye.write.fbo);
    blit();
    dye.swap();
  }

  function splatFromPointer(xNorm, yNorm, moveDx, moveDy) {
    hue = (hue + 4) % 360;
    const [r, g, b] = hslToRgb(hue / 360, 1, 0.55);
    const dx = moveDx * SPLAT_FORCE;
    const dy = moveDy * SPLAT_FORCE;
    splatAt(xNorm, yNorm, dx, dy, [r, g, b]);
  }

  function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p2 = 2 * l - q;
      r = hue2rgb(p2, q, h + 1 / 3);
      g = hue2rgb(p2, q, h);
      b = hue2rgb(p2, q, h - 1 / 3);
    }
    return [r, g, b];
  }

  function reset() {
    if (!ready) return;
    [velocity.read, velocity.write, dye.read, dye.write, pressure.read, pressure.write, divergence, curlFbo].forEach(fbo => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
      gl.viewport(0, 0, fbo.width, fbo.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    });
  }

  function loop(t) {
    if (!lastTime) lastTime = t;
    const dt = Math.min((t - lastTime) / 1000, 1 / 30);
    lastTime = t;
    step(dt);
    render();
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (!ready) return;
    lastTime = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = null;
  }

  return {
    init, resize, start, stop, reset,
    splat: splatFromPointer,
    get ready() { return ready; }
  };
})();

/* ===================== RAINBOW PAINT ===================== */
const Paint = (() => {
  const canvas = document.getElementById('sparkle-canvas');
  const ctx = canvas.getContext('2d');
  const fluidCanvas = document.getElementById('fluid-canvas');
  const fluidBrushBtn = document.getElementById('fluid-brush-btn');
  const hint = document.getElementById('canvas-hint');
  const shower = document.getElementById('sparkle-shower');
  const wandBtn = document.getElementById('wand-clear-btn');
  const colorBtns = document.querySelectorAll('.color-blob');
  const brushBtns = document.querySelectorAll('.brush-btn');
  let fluidInitAttempted = false;
  const lockBtn = document.getElementById('paint-lock-btn');
  const lockRing = document.getElementById('paint-lock-ring');
  const lockIcon = document.getElementById('paint-lock-icon');
  const backBtn = document.getElementById('paint-back-btn');
  const stageEl = document.getElementById('paint-stage');
  const chromeEls = document.querySelectorAll('.paint-chrome');

  let activeColor = '#ffd53d';
  let activeBrush = 'rainbow';
  let particles = [];
  let hue = 0;
  let raf = null;
  let inited = false;

  /* ---- Fullscreen kiosk mode: tap the lock to go fullscreen + hide all UI, hold 3s to exit ---- */
  const LOCK_CIRC = 131.95;
  const HOLD_MS = 3000;
  let locked = false;
  let holdRaf = null;
  let holdStart = null;

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  function enterFullscreen() {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) { /* fullscreen unsupported, ignore */ }
  }
  function exitFullscreen() {
    try {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) { /* ignore */ }
  }

  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => {
    document.addEventListener(ev, () => {
      if (locked && !isFullscreen()) enterFullscreen();
    });
  });

  function setLocked(v) {
    locked = v;
    lockIcon.textContent = locked ? 'lock' : 'lock_open';
    chromeEls.forEach(el => el.classList.toggle('hidden', locked));
    backBtn.classList.toggle('hidden', locked);
    stageEl.classList.toggle('kiosk', locked);
    if (locked) {
      lockBtn.style.width = '26px';
      lockBtn.style.height = '26px';
      lockBtn.style.top = '10px';
      lockBtn.style.right = '10px';
      lockBtn.style.opacity = '0.55';
      lockIcon.style.fontSize = '13px';
    } else {
      lockBtn.style.width = '44px';
      lockBtn.style.height = '44px';
      lockBtn.style.top = '26px';
      lockBtn.style.right = '20px';
      lockBtn.style.opacity = '1';
      lockIcon.style.fontSize = '22px';
    }
    resize();
    if (activeBrush === 'fluid') FluidSim.resize();
  }

  function resetRing() {
    lockRing.setAttribute('stroke-dashoffset', String(LOCK_CIRC));
  }

  function cancelHold() {
    cancelAnimationFrame(holdRaf);
    holdRaf = null;
    holdStart = null;
    resetRing();
  }

  function startHold() {
    holdStart = performance.now();
    const step = (t) => {
      const p = Math.min((t - holdStart) / HOLD_MS, 1);
      lockRing.setAttribute('stroke-dashoffset', String(LOCK_CIRC * (1 - p)));
      if (p >= 1) {
        setLocked(false);
        exitFullscreen();
        AudioFX.chime(900);
        resetRing();
        holdRaf = null;
        return;
      }
      holdRaf = requestAnimationFrame(step);
    };
    holdRaf = requestAnimationFrame(step);
  }

  lockBtn.addEventListener('click', () => {
    if (locked) return;
    setLocked(true);
    enterFullscreen();
    AudioFX.chime(500);
  });
  lockBtn.addEventListener('pointerdown', () => { if (locked) startHold(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => {
    lockBtn.addEventListener(ev, () => { if (locked) cancelHold(); });
  });

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  function spawnSparkles(x, y) {
    if (hint && !hint.classList.contains('opacity-0')) hint.classList.add('opacity-0');
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      let strokeColor = activeColor;
      if (activeBrush === 'rainbow') {
        hue = (hue + 12) % 360;
        strokeColor = `hsl(${hue}, 100%, 70%)`;
      }
      particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4 - 0.5,
        size: 14 + Math.random() * 18,
        color: strokeColor,
        alpha: 1,
        decay: 0.008 + Math.random() * 0.008,
        type: activeBrush,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.1
      });
    }
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  let pointerDown = false;
  let lastPointerX = 0, lastPointerY = 0;

  function handleTouch(x, y, isFirst) {
    if (activeBrush === 'fluid') {
      if (FluidSim.ready) {
        const rect = canvas.getBoundingClientRect();
        const nx = x / rect.width;
        const ny = 1 - y / rect.height;
        const dx = isFirst ? 0 : x - lastPointerX;
        const dy = isFirst ? 0 : -(y - lastPointerY);
        FluidSim.splat(nx, ny, dx, dy);
        if (isFirst) AudioFX.chime(500 + Math.random() * 150);
      }
    } else {
      spawnSparkles(x, y);
      if (isFirst) AudioFX.chime(700 + Math.random() * 200);
    }
    lastPointerX = x;
    lastPointerY = y;
  }

  canvas.addEventListener('pointerdown', e => { pointerDown = true; const p = getPos(e); handleTouch(p.x, p.y, true); });
  canvas.addEventListener('pointermove', e => { if (!pointerDown) return; const p = getPos(e); handleTouch(p.x, p.y, false); });
  window.addEventListener('pointerup', () => { pointerDown = false; });

  function drawPaw(x, y, size) {
    ctx.beginPath();
    ctx.ellipse(x, y, size * 0.5, size * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    [-0.4, 0, 0.4].forEach(angle => {
      ctx.beginPath();
      const tx = x + Math.sin(angle) * (size * 0.55);
      const ty = y - Math.cos(angle) * (size * 0.45);
      ctx.ellipse(tx, ty, size * 0.2, size * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawStar(cx, cy, spikes, outerR, innerR) {
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
      let x = cx + Math.cos(rot) * outerR, y = cy + Math.sin(rot) * outerR;
      ctx.lineTo(x, y);
      rot += step;
      x = cx + Math.cos(rot) * innerR; y = cy + Math.sin(rot) * innerR;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerR);
    ctx.closePath();
    ctx.fill();
  }

  function animate() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      p.rotation += p.rotSpeed;
      p.alpha -= p.decay;
      if (p.alpha <= 0) { particles.splice(i, 1); continue; }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;

      if (p.type === 'stars') drawStar(0, 0, 5, p.size * 0.6, p.size * 0.3);
      else if (p.type === 'bubbles') {
        ctx.beginPath(); ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.arc(-p.size * 0.18, -p.size * 0.18, p.size * 0.15, 0, Math.PI * 2); ctx.fill();
      } else if (p.type === 'paws') drawPaw(0, 0, p.size);
      else { ctx.beginPath(); ctx.arc(0, 0, p.size * 0.4, 0, Math.PI * 2); ctx.fill(); }

      ctx.restore();
    }
    raf = requestAnimationFrame(animate);
  }

  function clearWithMagic() {
    AudioFX.chime(300);
    if (activeBrush === 'fluid') FluidSim.reset();
    shower.innerHTML = '';
    shower.classList.remove('opacity-0');
    shower.classList.add('opacity-100');
    const colors = ['#ffd53d', '#ff7eb6', '#38bdf8', '#4ade80', '#c084fc', '#ffffff'];
    for (let i = 0; i < 40; i++) {
      const star = document.createElement('div');
      const color = colors[Math.floor(Math.random() * colors.length)];
      const left = Math.random() * 100;
      const delay = Math.random() * 0.3;
      const size = 12 + Math.random() * 20;
      star.className = 'absolute rounded-full pointer-events-none transition-all duration-700 ease-out';
      star.style.left = `${left}%`;
      star.style.top = '-20px';
      star.style.width = `${size}px`;
      star.style.height = `${size}px`;
      star.style.backgroundColor = color;
      star.style.boxShadow = `0 0 16px ${color}`;
      shower.appendChild(star);
      setTimeout(() => {
        star.style.top = `${80 + Math.random() * 40}%`;
        star.style.opacity = '0';
        star.style.transform = `scale(${1.5 + Math.random()}) rotate(${Math.random() * 360}deg)`;
      }, delay * 1000);
    }
    setTimeout(() => {
      particles = [];
      shower.classList.remove('opacity-100');
      shower.classList.add('opacity-0');
      if (hint) hint.classList.remove('opacity-0');
    }, 750);
  }

  wandBtn.addEventListener('click', clearWithMagic);

  let lastX = null, lastY = null, lastZ = null, shakeCount = 0;
  window.addEventListener('devicemotion', e => {
    const acc = e.accelerationIncludingGravity;
    if (!acc) return;
    if (lastX !== null) {
      const delta = Math.abs(acc.x - lastX) + Math.abs(acc.y - lastY) + Math.abs(acc.z - lastZ);
      if (delta > 24) {
        shakeCount++;
        if (shakeCount > 2) { clearWithMagic(); shakeCount = 0; }
      }
    }
    lastX = acc.x; lastY = acc.y; lastZ = acc.z;
  });

  colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      colorBtns.forEach(b => { b.classList.remove('scale-110'); b.querySelector('.select-indicator')?.classList.add('hidden'); });
      btn.classList.add('scale-110');
      btn.querySelector('.select-indicator')?.classList.remove('hidden');
      activeColor = btn.getAttribute('data-color') || '#ffd53d';
    });
  });

  function selectBrush(btn) {
    brushBtns.forEach(b => {
      b.classList.remove('bg-primary', 'text-on-primary', 'shadow-[0_6px_0_#004c69]');
      b.classList.add('bg-surface-container', 'text-on-surface-variant', 'shadow-[0_6px_0_#ccdbf3]');
    });
    btn.classList.remove('bg-surface-container', 'text-on-surface-variant', 'shadow-[0_6px_0_#ccdbf3]');
    btn.classList.add('bg-primary', 'text-on-primary', 'shadow-[0_6px_0_#004c69]');
    activeBrush = btn.getAttribute('data-brush') || 'rainbow';

    if (activeBrush === 'fluid') {
      if (!fluidInitAttempted) {
        fluidInitAttempted = true;
        fluidCanvas.classList.remove('hidden');
        const ok = FluidSim.init(fluidCanvas);
        if (!ok) {
          fluidCanvas.classList.add('hidden');
          fluidBrushBtn.classList.add('opacity-40', 'pointer-events-none');
          selectBrush(brushBtns[0]);
          return;
        }
      } else {
        fluidCanvas.classList.remove('hidden');
        FluidSim.resize();
      }
      FluidSim.start();
    } else {
      fluidCanvas.classList.add('hidden');
      FluidSim.stop();
    }
  }

  brushBtns.forEach(btn => btn.addEventListener('click', () => selectBrush(btn)));

  window.addEventListener('resize', () => {
    if (activeGame !== 'paint') return;
    resize();
    if (activeBrush === 'fluid') FluidSim.resize();
  });

  function start() {
    resize();
    if (activeBrush === 'fluid') FluidSim.resize();
    if (!inited) {
      inited = true;
      cancelAnimationFrame(raf);
      animate();
    }
  }

  function stop() {
    FluidSim.stop();
  }

  return { start, stop };
})();

/* ===================== PEEKABOO POP ===================== */
const Peekaboo = (() => {
  const grid = document.getElementById('peekaboo-grid');
  const btnHideAll = document.getElementById('btn-hide-all');
  const btnShuffle = document.getElementById('btn-shuffle');
  const adminOpenBtn = document.getElementById('peekaboo-admin-open-btn');
  let built = false;

  const housings = [
    { id: 'tent', icon: 'festival', bg: 'bg-tertiary-container text-on-tertiary-container', shadow: '#811057', label: 'Circus Tent' },
    { id: 'gift', icon: 'redeem', bg: 'bg-secondary-container text-on-secondary-container', shadow: '#693300', label: 'Gift Box' },
    { id: 'cloud', icon: 'cloud', bg: 'bg-primary-fixed text-on-primary-fixed', shadow: '#7bd0ff', label: 'Fluffy Cloud' },
    { id: 'hedge', icon: 'park', bg: 'bg-surface-container-highest text-on-surface', shadow: '#ccdbf3', label: 'Bushy Hedge' },
    { id: 'toybox', icon: 'inventory_2', bg: 'bg-secondary-fixed text-on-secondary-fixed', shadow: '#ffb783', label: 'Toy Box' },
    { id: 'curtain', icon: 'nights_stay', bg: 'bg-tertiary-fixed text-on-tertiary-fixed', shadow: '#ffafd3', label: 'Curtain' }
  ];
  const faces = ['🐻', '🐰', '🐧', '🦉', '🦊', '🐘', '🐼', '🦁'];

  const customImages = {}; // housing id -> { kind: 'blob'|'url', url, blob? }

  function pickFaces() {
    const shuffled = [...faces].sort(() => Math.random() - 0.5);
    return housings.map((_, i) => shuffled[i % shuffled.length]);
  }

  let assignedFaces = [];

  function backFaceHTML(h, i) {
    const custom = customImages[h.id];
    if (custom) {
      return `<img src="${custom.url}" alt="${h.label} surprise" class="w-full h-full object-cover rounded-xl" referrerpolicy="no-referrer">`;
    }
    return assignedFaces[i];
  }

  function render() {
    grid.innerHTML = '';
    housings.forEach((h, i) => {
      const tile = document.createElement('div');
      tile.className = 'peek-tile aspect-square cursor-pointer';
      tile.innerHTML = `
        <div class="peek-inner">
          <div class="peek-face peek-front rounded-xl ${h.bg} shadow-[0_8px_0_${h.shadow}] flex flex-col items-center justify-center gap-space-2xs">
            <span class="material-symbols-outlined text-[48px]">${h.icon}</span>
            <span class="font-label-sm text-label-sm text-center px-1">${h.label}</span>
          </div>
          <div class="peek-face peek-back rounded-xl bg-surface-container-lowest shadow-[0_8px_0_#d5e3fc] flex items-center justify-center text-[56px] overflow-hidden">
            ${backFaceHTML(h, i)}
          </div>
        </div>`;
      tile.addEventListener('click', () => {
        const wasOpen = tile.classList.contains('open');
        tile.classList.toggle('open');
        if (!wasOpen) AudioFX.giggle(); else AudioFX.chime(400);
      });
      grid.appendChild(tile);
    });
  }

  btnHideAll.addEventListener('click', () => {
    AudioFX.chime(350);
    grid.querySelectorAll('.peek-tile.open').forEach(t => t.classList.remove('open'));
  });

  btnShuffle.addEventListener('click', () => {
    AudioFX.chime(900);
    assignedFaces = pickFaces();
    render();
  });

  /* ---- Admin: upload a photo or paste an image URL per hiding spot ---- */
  async function loadCustomImages() {
    const stored = await ImageStore.getAll();
    Object.keys(stored).forEach(id => {
      const value = stored[id];
      if (customImages[id] && customImages[id].kind === 'blob') URL.revokeObjectURL(customImages[id].url);
      if (typeof value === 'string') customImages[id] = { kind: 'url', url: value };
      else customImages[id] = { kind: 'blob', url: URL.createObjectURL(value), blob: value };
    });
  }

  function renderAdminList(listEl) {
    housings.forEach(h => {
      const hasCustom = !!customImages[h.id];
      const row = document.createElement('div');
      row.className = 'flex flex-col gap-space-xs p-space-sm rounded-lg bg-surface-container';
      row.innerHTML = `
        <div class="flex items-center gap-space-sm">
          <div class="w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center ${hasCustom ? '' : h.bg}" data-thumb-wrap>
            ${hasCustom ? `<img src="${customImages[h.id].url}" class="w-full h-full object-cover" referrerpolicy="no-referrer">` : `<span class="material-symbols-outlined text-[24px]">${h.icon}</span>`}
          </div>
          <div class="flex-1 flex flex-col min-w-0">
            <span class="font-label-md text-label-md text-on-surface">${h.label}</span>
            <span class="font-body-sm text-body-sm text-on-surface-variant" data-status>${hasCustom ? 'Custom photo set' : 'Using random default face'}</span>
          </div>
          <label class="w-10 h-10 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center flex-shrink-0 cursor-pointer" aria-label="Upload photo">
            <span class="material-symbols-outlined text-[20px]">upload</span>
            <input accept="image/*" class="hidden" data-upload type="file"/>
          </label>
          <button class="w-10 h-10 rounded-full bg-surface-container-highest text-on-surface-variant flex items-center justify-center flex-shrink-0" data-reset type="button" aria-label="Reset to default"><span class="material-symbols-outlined text-[20px]">restart_alt</span></button>
        </div>
        <div class="flex items-center gap-space-xs">
          <input type="text" placeholder="Paste an image URL" data-url-input class="flex-1 min-w-0 border border-outline-variant rounded-lg px-space-sm py-1.5 font-body-sm text-body-sm bg-surface text-on-surface">
          <button type="button" data-url-submit class="px-space-sm py-1.5 rounded-lg bg-primary text-on-primary font-label-sm text-label-sm flex-shrink-0">Use URL</button>
        </div>
        <p class="font-body-sm text-body-sm text-error hidden" data-url-error>Enter a valid image URL starting with http(s)://</p>`;

      const thumbWrap = row.querySelector('[data-thumb-wrap]');
      const statusEl = row.querySelector('[data-status]');

      function refreshThumb() {
        const c = customImages[h.id];
        thumbWrap.className = `w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center ${c ? '' : h.bg}`;
        thumbWrap.innerHTML = c
          ? `<img src="${c.url}" class="w-full h-full object-cover" referrerpolicy="no-referrer">`
          : `<span class="material-symbols-outlined text-[24px]">${h.icon}</span>`;
        statusEl.textContent = c ? 'Custom photo set' : 'Using random default face';
      }

      row.querySelector('[data-upload]').addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          await ImageStore.set(h.id, file);
          if (customImages[h.id] && customImages[h.id].kind === 'blob') URL.revokeObjectURL(customImages[h.id].url);
          customImages[h.id] = { kind: 'blob', url: URL.createObjectURL(file), blob: file };
          refreshThumb();
          AudioFX.chime(700);
        } catch (err) {
          console.error('Failed to save photo for', h.id, err);
          statusEl.textContent = 'Upload failed — try again';
        }
      });

      row.querySelector('[data-url-submit]').addEventListener('click', async () => {
        const input = row.querySelector('[data-url-input]');
        const errorEl = row.querySelector('[data-url-error]');
        const url = input.value.trim();
        if (!/^https?:\/\//i.test(url)) {
          errorEl.classList.remove('hidden');
          return;
        }
        errorEl.classList.add('hidden');
        try {
          await ImageStore.set(h.id, url);
          if (customImages[h.id] && customImages[h.id].kind === 'blob') URL.revokeObjectURL(customImages[h.id].url);
          customImages[h.id] = { kind: 'url', url };
          refreshThumb();
          input.value = '';
          AudioFX.chime(700);
        } catch (err) {
          console.error('Failed to save image URL for', h.id, err);
          statusEl.textContent = 'Save failed — try again';
        }
      });

      row.querySelector('[data-reset]').addEventListener('click', async () => {
        if (!customImages[h.id]) return;
        await ImageStore.remove(h.id);
        if (customImages[h.id].kind === 'blob') URL.revokeObjectURL(customImages[h.id].url);
        delete customImages[h.id];
        refreshThumb();
        AudioFX.chime(400);
      });

      listEl.appendChild(row);
    });
  }

  adminOpenBtn.addEventListener('click', () => {
    Admin.open({
      title: 'Peekaboo Faces',
      desc: 'Upload a photo or paste an image URL per hiding spot. Saved on this device only.',
      render: renderAdminList,
      onClose: render
    });
  });

  function start() {
    if (!built) {
      assignedFaces = pickFaces();
      built = true;
    }
    render();
    loadCustomImages().then(render);
  }

  return { start };
})();

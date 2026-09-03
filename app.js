'use strict';

/* ===================== VIEW SWITCHING ===================== */
const screens = document.querySelectorAll('.screen');
let activeGame = null;

function showScreen(id) {
  screens.forEach(s => s.classList.toggle('active', s.id === id));
}

function goHome() {
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

/* ===================== ANIMAL ZOO ===================== */
const Zoo = (() => {
  const grid = document.getElementById('animal-grid');
  const btnSing = document.getElementById('btn-sing-along');
  const btnSurprise = document.getElementById('btn-surprise');
  let built = false;

  const animals = [
    { word: 'MOOO!', freq: 220, cardClass: 'bg-primary-container text-on-primary-container', shadow: '#004965',
      svg: `<circle cx="50" cy="54" fill="#ffffff" r="34"/><ellipse cx="40" cy="44" fill="#0d1c2e" rx="9" ry="12"/><ellipse cx="68" cy="50" fill="#0d1c2e" rx="7" ry="9"/><ellipse cx="28" cy="24" fill="#0d1c2e" rx="10" ry="6" transform="rotate(-30 28 24)"/><ellipse cx="72" cy="24" fill="#0d1c2e" rx="10" ry="6" transform="rotate(30 72 24)"/><ellipse cx="50" cy="64" fill="#ffafd3" rx="20" ry="14"/><circle cx="43" cy="62" fill="#811057" r="3"/><circle cx="57" cy="62" fill="#811057" r="3"/><circle cx="39" cy="44" fill="#00668a" r="3.5"/><circle cx="61" cy="44" fill="#00668a" r="3.5"/><circle cx="41" cy="42" fill="#ffffff" r="1.5"/><circle cx="63" cy="42" fill="#ffffff" r="1.5"/><path d="M44 70 C47 74 53 74 56 70" stroke="#811057" stroke-linecap="round" stroke-width="2"/>` },
    { word: 'ROAAR!', freq: 130, cardClass: 'bg-secondary-container text-on-secondary-container', shadow: '#693300',
      svg: `<circle cx="50" cy="50" fill="#ffb783" r="38"/><circle cx="50" cy="50" fill="#944a00" r="34" stroke="#ffdcc5" stroke-dasharray="8 6" stroke-width="3"/><circle cx="50" cy="52" fill="#ffdcc5" r="24"/><circle cx="30" cy="30" fill="#ffdcc5" r="7"/><circle cx="70" cy="30" fill="#ffdcc5" r="7"/><circle cx="41" cy="48" fill="#301400" r="3"/><circle cx="59" cy="48" fill="#301400" r="3"/><polygon fill="#944a00" points="50,56 46,52 54,52"/><path d="M46 58 Q50 63 54 58" stroke="#301400" stroke-linecap="round" stroke-width="2"/>` },
    { word: 'QUACK!', freq: 392, cardClass: 'bg-surface-container-highest text-on-surface', shadow: '#ccdbf3',
      svg: `<circle cx="46" cy="54" fill="#ffdcc5" r="28"/><circle cx="56" cy="40" fill="#ffdcc5" r="18"/><circle cx="58" cy="36" fill="#0d1c2e" r="3"/><ellipse cx="74" cy="42" fill="#fd933d" rx="10" ry="5"/><path d="M30 52 C30 62 42 66 50 66 C42 66 36 60 30 52 Z" fill="#ffb783"/>` },
    { word: 'RIBBIT!', freq: 330, cardClass: 'bg-primary-fixed text-on-primary-fixed', shadow: '#7bd0ff',
      svg: `<circle cx="34" cy="36" fill="#7bd0ff" r="11"/><circle cx="66" cy="36" fill="#7bd0ff" r="11"/><circle cx="34" cy="35" fill="#ffffff" r="5"/><circle cx="66" cy="35" fill="#ffffff" r="5"/><circle cx="35" cy="35" fill="#004965" r="2.5"/><circle cx="67" cy="35" fill="#004965" r="2.5"/><ellipse cx="50" cy="56" fill="#7bd0ff" rx="30" ry="22"/><ellipse cx="50" cy="62" fill="#c4e7ff" rx="18" ry="12"/><path d="M38 56 Q50 66 62 56" stroke="#004965" stroke-linecap="round" stroke-width="2.5"/>` },
    { word: 'WOOF!', freq: 260, cardClass: 'bg-secondary-fixed text-on-secondary-fixed', shadow: '#ffb783',
      svg: `<ellipse cx="28" cy="46" fill="#944a00" rx="8" ry="16" transform="rotate(-15 28 46)"/><ellipse cx="72" cy="46" fill="#944a00" rx="8" ry="16" transform="rotate(15 72 46)"/><circle cx="50" cy="52" fill="#ffffff" r="28"/><circle cx="41" cy="46" fill="#301400" r="3.5"/><circle cx="59" cy="46" fill="#301400" r="3.5"/><ellipse cx="50" cy="54" fill="#301400" rx="5" ry="3.5"/><path d="M46 58 Q50 63 54 58" stroke="#301400" stroke-linecap="round" stroke-width="2"/>` },
    { word: 'MEOW!', freq: 523, cardClass: 'bg-tertiary-fixed text-on-tertiary-fixed', shadow: '#ffafd3',
      svg: `<polygon fill="#ffafd3" points="26,38 34,20 46,32"/><polygon fill="#ffafd3" points="74,38 66,20 54,32"/><circle cx="50" cy="54" fill="#ffafd3" r="28"/><circle cx="40" cy="50" fill="#3d0026" r="3"/><circle cx="60" cy="50" fill="#3d0026" r="3"/><polygon fill="#811057" points="50,56 47,53 53,53"/><path d="M47 58 Q50 61 53 58" stroke="#3d0026" stroke-linecap="round" stroke-width="1.5"/>` }
  ];

  function triggerAnimalJoy(el, word, freq) {
    AudioFX.chime(freq);
    el.classList.add('scale-110');
    setTimeout(() => el.classList.remove('scale-110'), 350);

    const rect = el.getBoundingClientRect();
    const particle = document.createElement('div');
    particle.className = 'fixed pointer-events-none z-50 flex items-center gap-1 font-label-lg text-label-lg text-primary px-3 py-1 bg-surface-container-lowest rounded-full shadow-lg';
    particle.style.left = (rect.left + rect.width / 2 - 40) + 'px';
    particle.style.top = (rect.top + 10) + 'px';
    particle.innerHTML = `<span>${word}</span>`;
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
      btn.addEventListener('click', () => triggerAnimalJoy(btn, a.word, a.freq));
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

  function start() { if (!built) build(); }

  return { start };
})();

/* ===================== RAINBOW PAINT ===================== */
const Paint = (() => {
  const canvas = document.getElementById('sparkle-canvas');
  const ctx = canvas.getContext('2d');
  const hint = document.getElementById('canvas-hint');
  const shower = document.getElementById('sparkle-shower');
  const wandBtn = document.getElementById('wand-clear-btn');
  const colorBtns = document.querySelectorAll('.color-blob');
  const brushBtns = document.querySelectorAll('.brush-btn');

  let activeColor = '#ffd53d';
  let activeBrush = 'rainbow';
  let particles = [];
  let hue = 0;
  let raf = null;
  let inited = false;

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
  canvas.addEventListener('pointerdown', e => { pointerDown = true; const p = getPos(e); spawnSparkles(p.x, p.y); AudioFX.chime(700 + Math.random() * 200); });
  canvas.addEventListener('pointermove', e => { if (!pointerDown) return; const p = getPos(e); spawnSparkles(p.x, p.y); });
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

  brushBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      brushBtns.forEach(b => {
        b.classList.remove('bg-primary', 'text-on-primary', 'shadow-[0_6px_0_#004c69]');
        b.classList.add('bg-surface-container', 'text-on-surface-variant', 'shadow-[0_6px_0_#ccdbf3]');
      });
      btn.classList.remove('bg-surface-container', 'text-on-surface-variant', 'shadow-[0_6px_0_#ccdbf3]');
      btn.classList.add('bg-primary', 'text-on-primary', 'shadow-[0_6px_0_#004c69]');
      activeBrush = btn.getAttribute('data-brush') || 'rainbow';
    });
  });

  window.addEventListener('resize', () => { if (activeGame === 'paint') resize(); });

  function start() {
    resize();
    if (!inited) {
      inited = true;
      cancelAnimationFrame(raf);
      animate();
    }
  }

  return { start };
})();

/* ===================== PEEKABOO POP ===================== */
const Peekaboo = (() => {
  const grid = document.getElementById('peekaboo-grid');
  const btnHideAll = document.getElementById('btn-hide-all');
  const btnShuffle = document.getElementById('btn-shuffle');
  let built = false;

  const housings = [
    { icon: 'festival', bg: 'bg-tertiary-container text-on-tertiary-container', shadow: '#811057', label: 'Circus Tent' },
    { icon: 'redeem', bg: 'bg-secondary-container text-on-secondary-container', shadow: '#693300', label: 'Gift Box' },
    { icon: 'cloud', bg: 'bg-primary-fixed text-on-primary-fixed', shadow: '#7bd0ff', label: 'Fluffy Cloud' },
    { icon: 'park', bg: 'bg-surface-container-highest text-on-surface', shadow: '#ccdbf3', label: 'Bushy Hedge' },
    { icon: 'inventory_2', bg: 'bg-secondary-fixed text-on-secondary-fixed', shadow: '#ffb783', label: 'Toy Box' },
    { icon: 'nights_stay', bg: 'bg-tertiary-fixed text-on-tertiary-fixed', shadow: '#ffafd3', label: 'Curtain' }
  ];
  const faces = ['🐻', '🐰', '🐧', '🦉', '🦊', '🐘', '🐼', '🦁'];

  function pickFaces() {
    const shuffled = [...faces].sort(() => Math.random() - 0.5);
    return housings.map((_, i) => shuffled[i % shuffled.length]);
  }

  let assignedFaces = [];

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
          <div class="peek-face peek-back rounded-xl bg-surface-container-lowest shadow-[0_8px_0_#d5e3fc] flex items-center justify-center text-[56px]">
            ${assignedFaces[i]}
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

  function start() {
    if (!built) {
      assignedFaces = pickFaces();
      render();
      built = true;
    }
  }

  return { start };
})();

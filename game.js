'use strict';
/* =========================================================================
   Ritterburg – ein einfaches Ritterspiel für zwei Kinder gegen den Computer
   Alles wird direkt mit Canvas gezeichnet, keine Bilder nötig.
   ========================================================================= */

// ---------- Grundwerte ----------
const W = 1280, H = 720;          // Bildgröße
const T = 64;                     // Größe eines Bausteins
const COLS = 20, ROWS = 10;       // Spielfeld in Bausteinen
const TOP = 80;                   // Höhe der Anzeige oben
const WORLD_H = ROWS * T;         // 640
const CASTLE_COLS = 8;            // Burghof = die linken 8 Spalten
const KEEP = { c: 0, r: 4 };      // Burgturm (2x2 Bausteine)
const BELL = { c: 1, r: 7 };      // Glocke zum Starten der Welle
const FONT = '"Trebuchet MS", "Comic Sans MS", "Segoe UI", sans-serif';

const ITEMS = ['wall', 'catapult', 'crossbow'];
const ITEM_NAME = { wall: 'Mauer', catapult: 'Katapult', crossbow: 'Armbrust' };
const ITEM_HP = { wall: 10, catapult: 6, crossbow: 6 };

const SWORD_NAME = ['', 'Holzschwert', 'Eisenschwert', 'Goldschwert', 'Laserschwert'];
const SWORD_DMG = [0, 1, 2, 3, 5];
const MAX_SWORD = 4;
const SHIELD_NAME = ['', 'Holzschild', 'Eisenschild', 'Goldschild'];
const SHIELD_PROTECT = [0, 0.3, 0.55, 0.8];

const ENEMY = {
  foot:   { hp: 3,  speed: 45, dmg: 1,   r: 18, tunic: '#d64545', plume: '#ffd23f', scale: 1 },
  rider:  { hp: 5,  speed: 85, dmg: 1.5, r: 22, tunic: '#8e44ad', plume: '#ff8c1a', scale: 1, horse: true },
  archer: { hp: 2,  speed: 40, dmg: 1,   r: 18, tunic: '#e67e22', plume: '#d64545', scale: 1, range: 280 },
  boss:   { hp: 30, speed: 28, dmg: 2,   r: 30, tunic: '#2c2c3a', plume: '#e0262f', scale: 1.6 },
};

const WAVES = [
  { foot: 5 },
  { foot: 7, rider: 2 },
  { foot: 7, rider: 3, archer: 3 },
  { foot: 9, rider: 4, archer: 5 },
  { foot: 10, rider: 5, archer: 6, boss: 1 },
];

const P_KEYS = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    action: ['Space'], build: ['KeyE', 'KeyQ'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    action: ['Enter', 'NumpadEnter', 'ControlRight'], build: ['ShiftRight', 'Numpad0', 'Period'] },
];

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ---------- Tastatur ----------
const keys = {};
const justPressed = new Set();
const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter']);
window.addEventListener('keydown', (e) => {
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  initAudio();
  if (!keys[e.code]) justPressed.add(e.code);
  keys[e.code] = true;
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
// Ein Klick ins Bild holt die Tastatur zum Spiel (wichtig, wenn die Seite eingebettet ist)
canvas.tabIndex = 0;
canvas.addEventListener('pointerdown', () => { canvas.focus(); window.focus(); initAudio(); });
window.addEventListener('load', () => { try { canvas.focus(); } catch (e) { /* egal */ } });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const isDown = (list) => list.some((k) => keys[k]);
const wasPressed = (list) => list.some((k) => justPressed.has(k));

// ---------- Töne ----------
let actx = null, muted = false;
function initAudio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
  }
  if (actx && actx.state === 'suspended') actx.resume();
}
function tone(f, d, type = 'square', v = 0.1, f2 = null, delay = 0) {
  if (!actx || muted) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(actx.destination);
  o.start(t); o.stop(t + d + 0.05);
}
function noise(d, v, freq = 1200) {
  if (!actx || muted) return;
  const len = Math.floor(actx.sampleRate * d);
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = actx.createBufferSource(); src.buffer = buf;
  const filt = actx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = freq;
  const g = actx.createGain(); g.gain.value = v;
  src.connect(filt); filt.connect(g); g.connect(actx.destination);
  src.start();
}
const SFX = {
  swing() { noise(0.12, 0.25, 3000); },
  laser() { tone(140, 0.3, 'sawtooth', 0.06, 520); tone(280, 0.3, 'square', 0.03, 900); },
  hit() { tone(330, 0.1, 'square', 0.08, 160); },
  clang() { tone(1200, 0.12, 'triangle', 0.07, 900); },
  coin() { tone(988, 0.08, 'square', 0.06); tone(1319, 0.18, 'square', 0.06, null, 0.08); },
  build() { tone(160, 0.15, 'triangle', 0.3, 70); noise(0.1, 0.15, 500); },
  tap() { tone(700, 0.05, 'square', 0.05, 500); },
  tick() { tone(600, 0.05, 'square', 0.05); },
  bell() { tone(784, 1.4, 'sine', 0.25); tone(1568, 0.9, 'sine', 0.08); tone(1175, 1.1, 'sine', 0.06); },
  catapult() { tone(260, 0.35, 'sawtooth', 0.06, 90); },
  boom() { noise(0.35, 0.4, 500); tone(90, 0.3, 'sine', 0.25, 40); },
  pew() { tone(1100, 0.08, 'triangle', 0.05, 600); },
  flee() { tone(700, 0.1, 'square', 0.05, 900); tone(500, 0.15, 'square', 0.05, 300, 0.1); },
  hurt() { tone(220, 0.2, 'sawtooth', 0.08, 110); },
  crash() { noise(0.4, 0.35, 900); },
  no() { tone(220, 0.15, 'square', 0.07); tone(180, 0.2, 'square', 0.07, null, 0.15); },
  buy() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.05, null, i * 0.07)); },
  win() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'square', 0.06, null, i * 0.13)); },
  lose() { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.3, 'triangle', 0.08, null, i * 0.22)); },
};

// ---------- kleine Helfer ----------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function ell(x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function txt(s, x, y, size, color, align = 'center', outline = '#2b1d12') {
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (outline) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size / 6);
    ctx.strokeStyle = outline;
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}
function star(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rad = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
}

// ---------- Spielzustand ----------
let mode = 'title';      // 'title' oder 'play'
let titlePlayers = 2;
let titleInfinite = false;
let game = null;

function makePlayer(id, n) {
  const keyset = n === 1
    ? Object.fromEntries(Object.keys(P_KEYS[0]).map((k) => [k, P_KEYS[0][k].concat(P_KEYS[1][k])]))
    : P_KEYS[id];
  return {
    id, keys: keyset,
    name: id ? 'Ritter Grün' : 'Ritter Blau',
    color: id ? '#3cb04a' : '#3a7bd5',
    plume: id ? '#ffe14d' : '#ff5a5a',
    x: 220, y: n === 1 ? 330 : (id ? 390 : 270),
    dir: 1, hp: 10, max: 10,
    sword: 1, shield: 1, horse: false,
    swing: 0, swingCd: 0, buildCd: 0, ko: 0, hurt: 0,
    sel: 0, walk: 0, moving: false, msgCd: 0,
  };
}

function newGame(n, infinite = false) {
  const grid = [];
  for (let c = 0; c < COLS; c++) grid.push(new Array(ROWS).fill(null));
  const keep = { type: 'keep', c: KEEP.c, r: KEEP.r, w: 2, h: 2, hp: 30, max: 30, hurt: 0, anim: 0 };
  for (let c = 0; c < 2; c++) for (let r = 0; r < 2; r++) grid[KEEP.c + c][KEEP.r + r] = keep;
  const players = [];
  for (let i = 0; i < n; i++) players.push(makePlayer(i, n));
  game = {
    state: 'build', waveIdx: 0, coins: 0,
    inv: { wall: 20, catapult: 1, crossbow: 1 },
    grid, keep, structs: [keep], players,
    enemies: [], shots: [], bags: [], swords: [], parts: [], floaters: [],
    infinite,
    spawnQueue: [], spawnTimer: 0, bagTimer: 2, waveDone: false, endTimer: 0,
    banner: null, bell: { swing: 0 },
    market: { cur: [0, 1], ready: [false, false] },
    paused: false, t: 0, stateT: 0,
  };
  // ein paar Geldsäcke zum Start
  for (let i = 0; i < 2; i++) spawnBag();
  showBanner('Baut eure Burg!', 'Läutet dann die Glocke, um zu beginnen', 4);
}

function showBanner(text, sub = '', time = 2.5) { game.banner = { text, sub, t: time, max: time }; }
function floater(x, y, text, color = '#fff', screen = false, size = 22) {
  if (screen) game.floaters = game.floaters.filter((f) => !(f.screen && Math.abs(f.x - x) < 5));
  game.floaters.push({ x, y, text, color, t: 1.3, screen, size });
}
function burst(x, y, color, n = 8, speed = 120, kind = 'dot', size = 4) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(speed * 0.3, speed);
    game.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.3,
      life: rand(0.4, 0.8), max: 0.8, color, kind, size: rand(size * 0.6, size * 1.2), rot: rand(0, 6) });
  }
}

// ---------- Burg / Bausteine ----------
function structCenter(s) {
  const w = s.w || 1, h = s.h || 1;
  return { x: (s.c + w / 2) * T, y: (s.r + h / 2) * T };
}
function placeStruct(type, c, r) {
  const s = { type, c, r, w: 1, h: 1, hp: ITEM_HP[type], max: ITEM_HP[type],
    cd: type === 'catapult' ? 1.5 : 0.5, anim: 0, hurt: 0, angle: 0, pop: 0.3 };
  game.grid[c][r] = s;
  game.structs.push(s);
  return s;
}
function removeStruct(s) {
  game.grid[s.c][s.r] = null;
  const i = game.structs.indexOf(s);
  if (i >= 0) game.structs.splice(i, 1);
}
function structureHit(x, y, rad) {
  const c0 = Math.floor((x - rad) / T), c1 = Math.floor((x + rad) / T);
  const r0 = Math.floor((y - rad) / T), r1 = Math.floor((y + rad) / T);
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) {
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
      const s = game.grid[c][r];
      if (!s) continue;
      const nx = clamp(x, c * T, c * T + T), ny = clamp(y, r * T, r * T + T);
      if ((x - nx) ** 2 + (y - ny) ** 2 < rad * rad) return s;
    }
  }
  return null;
}
function damageStruct(s, d) {
  s.hp -= d;
  s.hurt = 0.15;
  const c = structCenter(s);
  burst(c.x + rand(-15, 15), c.y + rand(-10, 10), '#9aa1a9', 4, 90);
  if (s.type === 'keep') {
    if (s.hp <= 0) { s.hp = 0; gameOver(); }
  } else if (s.hp <= 0) {
    removeStruct(s);
    burst(c.x, c.y, '#8f969e', 16, 200, 'dot', 7);
    burst(c.x, c.y, '#c9a66b', 8, 150);
    SFX.crash();
  }
}
function canBuildAt(c, r) {
  if (c < 0 || c >= CASTLE_COLS || r < 0 || r >= ROWS) return false;
  if (game.grid[c][r]) return false;
  if (c === BELL.c && r === BELL.r) return false;
  for (const e of game.enemies) {
    if (e.flee) continue;
    const nx = clamp(e.x, c * T, c * T + T), ny = clamp(e.y, r * T, r * T + T);
    if ((e.x - nx) ** 2 + (e.y - ny) ** 2 < e.r * e.r) return false;
  }
  return true;
}
function findRepair(p) {
  let best = null, bd = 40;
  for (const s of game.structs) {
    if (s.type === 'keep' || s.hp >= s.max) continue;
    const nx = clamp(p.x, s.c * T, s.c * T + T), ny = clamp(p.y, s.r * T, s.r * T + T);
    const d = Math.hypot(p.x - nx, p.y - ny);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// ---------- Geldsäcke ----------
function spawnBag(x, y) {
  if (x === undefined) {
    for (let tries = 0; tries < 20; tries++) {
      x = rand(150, CASTLE_COLS * T - 30);
      y = rand(40, WORLD_H - 30);
      if (!(x < 150 && y > 230 && y < 410)) break;
    }
  }
  game.bags.push({ x, y, v: 5, t: 0 });
}

// ---------- Wellen ----------
function ringBell() {
  game.bell.swing = 1;
  SFX.bell();
  if (game.state !== 'build') return;
  game.state = 'wave';
  game.stateT = 0;
  const w = WAVES[game.waveIdx];
  const q = [];
  for (const type of ['foot', 'rider', 'archer']) for (let i = 0; i < (w[type] || 0); i++) q.push(type);
  for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
  // zuerst kommt immer ein einfacher Ritter
  const fi = q.indexOf('foot');
  if (fi > 0) { q.splice(fi, 1); q.unshift('foot'); }
  for (let i = 0; i < (w.boss || 0); i++) q.push('boss');
  game.spawnQueue = q;
  game.spawnTimer = 1.5;
  game.bagTimer = 3;
  game.waveDone = false;
  showBanner(`Welle ${game.waveIdx + 1}!`, game.waveIdx === WAVES.length - 1 ? 'Der Schwarze Ritter kommt!' : 'Die Raubritter kommen!', 2.5);
}
function enemySwordLevel(type) {
  if (type === 'boss') return 1;      // der Schwarze Ritter hat nur ein Holzschwert!
  if (type === 'archer') return 0;    // Schützen haben eine Armbrust
  const w = game.waveIdx, r = Math.random();
  const laser = 0.02 + 0.02 * w, gold = laser + 0.05 + 0.1 * w, iron = gold + 0.25 + 0.1 * w;
  return r < laser ? 4 : r < gold ? 3 : r < iron ? 2 : 1;
}
function spawnEnemy(type) {
  const d = ENEMY[type];
  const hp = type === 'boss' ? d.hp : Math.ceil(d.hp * (1 + 0.2 * game.waveIdx));
  game.enemies.push({
    type, ...d, hp, max: hp,
    x: W + 40, y: rand(50, WORLD_H - 50),
    sword: enemySwordLevel(type), atkCd: 1, swing: 0, hurt: 0, walk: rand(0, 5), flee: false, kx: 0, ky: 0, dir: -1, moving: true,
  });
  if (type === 'boss') showBanner('Der Schwarze Ritter!', 'Hihi, er hat nur ein Holzschwert!', 3);
}
function startMarket() {
  game.state = 'market';
  game.stateT = 0;
  game.market.ready = [false, false];
  for (const p of game.players) { p.hp = p.max; p.ko = 0; }
}
function startBuild() {
  game.state = 'build';
  game.stateT = 0;
  showBanner('Baut weiter!', 'Läutet die Glocke für die nächste Welle', 3);
}
function gameOver() {
  if (game.state === 'over') return;
  game.state = 'over';
  game.stateT = 0;
  SFX.lose();
}

// ---------- Kampf ----------
function damageEnemy(e, d, kx = 0, ky = 0) {
  if (e.flee) return;
  e.hp -= d;
  e.hurt = 0.2;
  const k = e.type === 'boss' ? 0.2 : 1;
  e.kx = kx * k; e.ky = ky * k;
  burst(e.x, e.y - 30 * e.scale, '#ffe14d', 5, 120, 'star', 6);
  SFX.hit();
  if (e.hp <= 0) defeat(e);
}
function defeat(e) {
  e.flee = true;
  e.hurt = 0;
  SFX.flee();
  if (e.sword > 0 && (e.type === 'boss' || Math.random() < 0.7)) {
    game.swords.push({ x: e.x + rand(-12, 12), y: clamp(e.y + rand(-6, 6), 20, WORLD_H - 10), level: e.sword, t: 0 });
    e.sword = 0;
  }
  if (e.type === 'boss') {
    for (let i = 0; i < 6; i++) spawnBag(e.x + rand(-60, 60), clamp(e.y + rand(-60, 60), 30, WORLD_H - 20));
    floater(e.x, e.y - 90, 'Der Schwarze Ritter flieht!', '#ffd23f', false, 26);
  } else {
    if (Math.random() < 0.5) spawnBag(e.x, e.y);
    if (Math.random() < 0.3) floater(e.x, e.y - 70, ['Hurra!', 'Juhu!', 'Weg mit dir!', 'Toll!'][Math.floor(rand(0, 4))], '#fff');
  }
}
function hurtPlayer(p, d) {
  if (p.ko > 0) return;
  p.hurt = 0.3;
  SFX.clang();
  if (game.infinite) return;          // unendlich Leben: nichts passiert
  p.hp -= d * (1 - SHIELD_PROTECT[p.shield]);
  if (p.hp <= 0) {
    p.hp = 0;
    p.ko = 4;
    SFX.hurt();
    floater(p.x, p.y - 95, 'Weiße Fahne! Kurz ausruhen...', '#fff');
  }
}
function nearestEnemy(x, y, range) {
  let best = null, bd = range;
  for (const e of game.enemies) {
    if (e.flee || e.x > W + 10) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function fireCatapult(s, target) {
  const c = structCenter(s);
  s.cd = 4.5;
  s.anim = 0.5;
  const lead = target.speed * 0.9;
  const tx = target.x - lead, ty = target.y;
  const d = Math.hypot(tx - c.x, ty - c.y);
  game.shots.push({ kind: 'boulder', sx: c.x, sy: c.y, tx, ty, t: 0, dur: 0.6 + d / 900, peak: 80 + d * 0.25 });
  SFX.catapult();
}

// ---------- Update ----------
function update(dt) {
  game.t += dt;
  game.stateT += dt;

  for (const p of game.parts) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.life -= dt; p.rot += dt * 5;
  }
  game.parts = game.parts.filter((p) => p.life > 0);
  for (const f of game.floaters) { f.y -= 35 * dt; f.t -= dt; }
  game.floaters = game.floaters.filter((f) => f.t > 0);
  if (game.banner) { game.banner.t -= dt; if (game.banner.t <= 0) game.banner = null; }

  if (game.state === 'market') { updateMarket(); return; }
  if (game.state === 'over' || game.state === 'win') {
    if (game.state === 'win' && Math.random() < 0.6) {
      const colors = ['#ff5a5a', '#ffd23f', '#3a7bd5', '#3cb04a', '#ff8cdb'];
      game.parts.push({ x: rand(0, W), y: -20, vx: rand(-40, 40), vy: rand(0, 60), life: 3, max: 3,
        color: colors[Math.floor(rand(0, 5))], kind: 'confetti', size: 6, rot: rand(0, 6) });
    }
    return;
  }

  game.bell.swing = Math.max(0, game.bell.swing - dt * 0.5);
  for (const s of game.structs) {
    s.hurt = Math.max(0, s.hurt - dt);
    s.anim = Math.max(0, s.anim - dt);
    if (s.pop) s.pop = Math.max(0, s.pop - dt);
  }

  for (const p of game.players) updatePlayer(p, dt);
  updateBags(dt);
  updateEnemies(dt);
  updateShots(dt);

  if (game.state === 'wave') {
    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0 && game.spawnQueue.length) {
      spawnEnemy(game.spawnQueue.shift());
      game.spawnTimer = Math.max(1.1, 2.8 - game.waveIdx * 0.35) * rand(0.7, 1.3);
    }
    updateTowers(dt);
    if (!game.waveDone && game.spawnQueue.length === 0 && !game.enemies.some((e) => !e.flee)) {
      game.waveDone = true;
      game.endTimer = 2.5;
      const last = game.waveIdx === WAVES.length - 1;
      if (!last) { showBanner('Welle geschafft!', 'Super gemacht, ihr Ritter!', 2.5); SFX.win(); }
    }
    if (game.waveDone) {
      game.endTimer -= dt;
      if (game.waveIdx === WAVES.length - 1) {
        game.state = 'win'; game.stateT = 0; SFX.win();
      } else if (game.endTimer <= 0) {
        game.waveIdx++;
        startMarket();
      }
    }
  }
}

function updatePlayer(p, dt) {
  p.hurt = Math.max(0, p.hurt - dt);
  p.swing = Math.max(0, p.swing - dt);
  p.swingCd -= dt;
  p.buildCd -= dt;
  p.msgCd -= dt;
  if (p.ko > 0) {
    p.ko -= dt;
    if (p.ko <= 0) {
      p.ko = 0; p.hp = p.max;
      p.x = 190; p.y = 330 + (p.id ? 40 : -40);
      burst(p.x, p.y - 30, '#fff', 10, 100, 'star', 6);
    }
    return;
  }
  const k = p.keys;
  let mx = (isDown(k.right) ? 1 : 0) - (isDown(k.left) ? 1 : 0);
  let my = (isDown(k.down) ? 1 : 0) - (isDown(k.up) ? 1 : 0);
  p.moving = !!(mx || my);
  if (p.moving) {
    const len = Math.hypot(mx, my);
    const sp = (p.horse ? 260 : 165) * dt;
    if (mx) p.dir = mx > 0 ? 1 : -1;
    const nx = clamp(p.x + mx / len * sp, 16, W - 16);
    const ny = clamp(p.y + my / len * sp, 16, WORLD_H - 6);
    if (!inKeep(nx, p.y)) p.x = nx;
    if (!inKeep(p.x, ny)) p.y = ny;
    p.walk += dt;
  }

  // Geldsäcke einsammeln
  for (const b of game.bags) {
    if (!b.taken && Math.hypot(b.x - p.x, b.y - p.y) < 36) {
      b.taken = true;
      game.coins += b.v;
      SFX.coin();
      floater(b.x, b.y - 40, `+${b.v} Taler`, '#ffd23f');
      burst(b.x, b.y - 15, '#ffd23f', 8, 120, 'star', 5);
    }
  }

  // Schwerter der Feinde aufheben
  for (const sw of game.swords) {
    if (sw.taken || Math.hypot(sw.x - p.x, sw.y - p.y) > 34) continue;
    sw.taken = true;
    if (sw.level > p.sword) {
      p.sword = sw.level;
      const laser = sw.level === 4;
      floater(p.x, p.y - 95, laser ? 'LASERSCHWERT!!!' : `${SWORD_NAME[sw.level]}!`, laser ? '#7df9ff' : '#ffd23f', false, laser ? 32 : 24);
      burst(p.x, p.y - 40, laser ? '#7df9ff' : '#ffd23f', laser ? 24 : 12, 160, 'star', 6);
      SFX.buy();
      if (laser) SFX.laser();
    } else {
      game.coins += 2;
      floater(p.x, p.y - 85, 'Altes Schwert: +2 Taler', '#ffd23f', false, 18);
      SFX.coin();
    }
  }

  // Aktionstaste (Schwert / Glocke / Katapult / Auswahl)
  if (wasPressed(k.action)) {
    const bc = { x: BELL.c * T + 32, y: BELL.r * T + 40 };
    if (game.state === 'build') {
      if (Math.hypot(p.x - bc.x, p.y - bc.y) < 60) ringBell();
      else {
        p.sel = (p.sel + 1) % ITEMS.length;
        SFX.tick();
      }
    } else if (game.state === 'wave') {
      const cat = game.structs.find((s) => s.type === 'catapult' && dist(structCenter(s), p) < 62);
      if (cat) {
        const target = nearestEnemy(cat.c * T + 32, cat.r * T + 32, 1300);
        if (!target) { if (p.msgCd <= 0) { floater(p.x, p.y - 80, 'Keine Feinde da!'); p.msgCd = 1; } }
        else if (cat.cd > 3.3) { if (p.msgCd <= 0) { floater(p.x, p.y - 80, 'Lädt noch...'); p.msgCd = 0.6; } }
        else fireCatapult(cat, target);
      } else if (p.swingCd <= 0) {
        swingSword(p);
      }
    }
  }

  // Bautaste
  if (wasPressed(k.build)) {
    const rep = findRepair(p);
    if (rep) repair(p, rep);
    else {
      const c = Math.floor(p.x / T), r = Math.floor(p.y / T);
      const item = ITEMS[p.sel];
      if (canBuildAt(c, r)) {
        if (game.inv[item] > 0) {
          game.inv[item]--;
          placeStruct(item, c, r);
          SFX.build();
          burst(c * T + 32, r * T + 56, '#c9a66b', 10, 120);
        } else if (p.msgCd <= 0) {
          floater(p.x, p.y - 85, item === 'wall' ? 'Keine Bausteine mehr!' : `Kein ${ITEM_NAME[item]} mehr!`, '#ffb3b3');
          SFX.no(); p.msgCd = 0.8;
        }
      } else if (c >= CASTLE_COLS && p.msgCd <= 0) {
        floater(p.x, p.y - 85, 'Nur im Burghof bauen!', '#ffb3b3');
        p.msgCd = 0.8;
      }
    }
  } else if (isDown(k.build) && p.buildCd <= 0) {
    const rep = findRepair(p);
    if (rep) repair(p, rep);
  }
}
function inKeep(x, y) {
  return x < (KEEP.c + 2) * T + 10 && y > KEEP.r * T - 4 && y < (KEEP.r + 2) * T + 10;
}
function repair(p, s) {
  s.hp = Math.min(s.max, s.hp + 1);
  p.buildCd = 0.22;
  p.swing = 0.15;
  SFX.tap();
  burst(s.c * T + 32, s.r * T + 30, '#ffe9a8', 4, 80, 'star', 4);
  if (s.hp >= s.max) floater(s.c * T + 32, s.r * T, 'Repariert!', '#b8ffb0', false, 18);
}
function swingSword(p) {
  p.swing = 0.25;
  p.swingCd = 0.33;
  if (p.sword === 4) SFX.laser(); else SFX.swing();
  for (const e of game.enemies) {
    if (e.flee) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 58 + e.r * 0.6 && (dx * p.dir > -12 || d < 28)) {
      damageEnemy(e, SWORD_DMG[p.sword], dx / d * 220, dy / d * 220);
    }
  }
}

function updateBags(dt) {
  for (const sw of game.swords) sw.t += dt;
  game.swords = game.swords.filter((sw) => !sw.taken && sw.t < 25);
  for (const b of game.bags) b.t += dt;
  game.bags = game.bags.filter((b) => !b.taken);
  if (game.state === 'wave') {
    game.bagTimer -= dt;
    if (game.bagTimer <= 0) {
      game.bagTimer = 3.5;
      if (game.bags.length < 8) spawnBag();
    }
  }
}

function updateEnemies(dt) {
  const kc = structCenter(game.keep);
  for (const e of game.enemies) {
    e.walk += dt;
    e.hurt = Math.max(0, e.hurt - dt);
    e.swing = Math.max(0, e.swing - dt);
    if (e.flee) { e.x += 230 * dt; e.dir = 1; e.moving = true; continue; }
    if (game.state !== 'wave') continue;

    // Rückstoß
    if (e.kx || e.ky) {
      const nx = e.x + e.kx * dt, ny = clamp(e.y + e.ky * dt, e.r, WORLD_H - 10);
      if (!structureHit(nx, ny, e.r)) { e.x = nx; e.y = ny; }
      const f = Math.pow(0.005, dt);
      e.kx *= f; e.ky *= f;
      if (Math.abs(e.kx) + Math.abs(e.ky) < 5) { e.kx = 0; e.ky = 0; }
    }
    e.atkCd -= dt;
    e.moving = false;

    let tp = null, td = 1e9;
    for (const p of game.players) {
      if (p.ko > 0) continue;
      const d = dist(e, p);
      if (d < td) { td = d; tp = p; }
    }

    if (e.type === 'archer' && e.x < W - 20) {
      let target = null, best = e.range;
      if (tp && td < best) { target = { x: tp.x, y: tp.y }; best = td; }
      for (const s of game.structs) {
        const c = structCenter(s);
        const d = Math.hypot(c.x - e.x, c.y - e.y) - (s.w || 1) * T / 2;
        if (d < best) { best = d; target = c; }
      }
      if (target) {
        e.dir = target.x < e.x ? -1 : 1;
        if (e.atkCd <= 0) {
          const dx = target.x - e.x, dy = target.y - e.y, d = Math.hypot(dx, dy) || 1;
          game.shots.push({ kind: 'ebolt', x: e.x + e.dir * 10, y: e.y, vx: dx / d * 380, vy: dy / d * 380, h: 26, life: 2, dmg: e.dmg });
          e.atkCd = 2.4;
          e.swing = 0.3;
          SFX.pew();
        }
        continue;
      }
    }

    let tx = kc.x, ty = kc.y;
    if (tp && td < 170 && e.type !== 'archer') {
      tx = tp.x; ty = tp.y;
      if (td < e.r + 24) {
        e.dir = tp.x < e.x ? -1 : 1;
        if (e.atkCd <= 0) { hurtPlayer(tp, e.dmg); e.atkCd = 1.2; e.swing = 0.3; }
        continue;
      }
    }
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
    const sp = e.speed * dt;
    const nx = e.x + dx / d * sp, ny = e.y + dy / d * sp;
    e.dir = dx < 0 ? -1 : 1;
    const s = structureHit(nx, ny, e.r);
    if (s) {
      if (e.atkCd <= 0) { damageStruct(s, e.dmg); e.atkCd = 1.2; e.swing = 0.3; tone(180, 0.06, 'square', 0.04); }
    } else {
      e.x = nx; e.y = ny; e.moving = true;
    }
  }
  // nicht übereinander stehen
  const es = game.enemies.filter((e) => !e.flee);
  for (let i = 0; i < es.length; i++) {
    for (let j = i + 1; j < es.length; j++) {
      const a = es[i], b = es[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
      const min = (a.r + b.r) * 0.8;
      if (d < min) {
        const push = (min - d) / 2, ux = dx / d, uy = dy / d;
        if (!structureHit(a.x - ux * push, a.y - uy * push, a.r)) { a.x -= ux * push; a.y = clamp(a.y - uy * push, a.r, WORLD_H - 10); }
        if (!structureHit(b.x + ux * push, b.y + uy * push, b.r)) { b.x += ux * push; b.y = clamp(b.y + uy * push, b.r, WORLD_H - 10); }
      }
    }
  }
  game.enemies = game.enemies.filter((e) => !(e.flee && e.x > W + 80));
}

function updateTowers(dt) {
  for (const s of game.structs) {
    if (s.type === 'catapult') {
      s.cd -= dt;
      if (s.cd <= 0) {
        const t = nearestEnemy(s.c * T + 32, s.r * T + 32, 1000);
        if (t) fireCatapult(s, t); else s.cd = 0.5;
      }
    } else if (s.type === 'crossbow') {
      s.cd -= dt;
      const cx = s.c * T + 32, cy = s.r * T + 32;
      const t = nearestEnemy(cx, cy, 380);
      if (t) {
        s.angle = Math.atan2(t.y - cy, t.x - cx);
        if (s.cd <= 0) {
          const d = Math.hypot(t.x - cx, t.y - cy) || 1;
          game.shots.push({ kind: 'bolt', x: cx, y: cy, vx: (t.x - cx) / d * 650, vy: (t.y - cy) / d * 650, h: 34, life: 1 });
          s.cd = 1.3;
          SFX.pew();
        }
      }
    }
  }
}

function updateShots(dt) {
  for (const s of game.shots) {
    if (s.kind === 'boulder') {
      s.t += dt;
      if (s.t >= s.dur) {
        s.dead = true;
        SFX.boom();
        burst(s.tx, s.ty, '#b59a6a', 14, 180, 'dot', 6);
        burst(s.tx, s.ty, '#7d7d7d', 6, 140, 'dot', 5);
        for (const e of game.enemies) {
          if (e.flee) continue;
          const d = Math.hypot(e.x - s.tx, e.y - s.ty);
          if (d < 75) damageEnemy(e, 3, (e.x - s.tx) / (d || 1) * 200, (e.y - s.ty) / (d || 1) * 200);
        }
      }
      continue;
    }
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    if (s.life <= 0 || s.x < -20 || s.x > W + 60 || s.y < -20 || s.y > WORLD_H + 20) { s.dead = true; continue; }
    if (s.kind === 'bolt') {
      for (const e of game.enemies) {
        if (!e.flee && Math.hypot(e.x - s.x, e.y - s.y) < e.r + 6) {
          damageEnemy(e, 1, s.vx * 0.15, s.vy * 0.15);
          s.dead = true;
          break;
        }
      }
    } else if (s.kind === 'ebolt') {
      for (const p of game.players) {
        if (p.ko <= 0 && Math.hypot(p.x - s.x, p.y - s.y) < 20) {
          hurtPlayer(p, s.dmg);
          s.dead = true;
          break;
        }
      }
      if (!s.dead) {
        const st = structureHit(s.x, s.y, 3);
        if (st) { damageStruct(st, s.dmg); s.dead = true; }
      }
    }
  }
  game.shots = game.shots.filter((s) => !s.dead);
}

// ---------- Markt ----------
const SHOP = [
  { id: 'sword', name: 'Besseres Schwert', per: true,
    price: (p) => (p.sword < MAX_SWORD ? [0, 12, 25, 45][p.sword] : null),
    apply: (p) => { p.sword++; return SWORD_NAME[p.sword]; } },
  { id: 'shield', name: 'Besserer Schild', per: true,
    price: (p) => (p.shield < 3 ? [0, 10, 20][p.shield] : null),
    apply: (p) => { p.shield++; return SHIELD_NAME[p.shield]; } },
  { id: 'horse', name: 'Pferd', per: true,
    price: (p) => (p.horse ? null : 15),
    apply: (p) => { p.horse = true; return 'Ein schnelles Pferd!'; } },
  { id: 'blocks', name: '5 Bausteine', price: () => 5,
    apply: () => { game.inv.wall += 5; return '+5 Bausteine'; } },
  { id: 'catapult', name: 'Katapult', price: () => 15,
    apply: () => { game.inv.catapult++; return '+1 Katapult'; } },
  { id: 'crossbow', name: 'Armbrust', price: () => 10,
    apply: () => { game.inv.crossbow++; return '+1 Armbrust'; } },
  { id: 'heal', name: 'Burg heilen', price: () => (game.keep.hp < game.keep.max ? 8 : null),
    apply: () => { game.keep.hp = Math.min(game.keep.max, game.keep.hp + 10); return '+10 Herzen'; } },
  { id: 'go', name: 'Weiter!' },
];
const CARD = { w: 260, h: 210, gap: 24, x0: (W - (4 * 260 + 3 * 24)) / 2, y0: 200 };
function cardPos(i) {
  return { x: CARD.x0 + (i % 4) * (CARD.w + CARD.gap), y: CARD.y0 + Math.floor(i / 4) * (CARD.h + CARD.gap) };
}

function updateMarket() {
  const m = game.market;
  for (const p of game.players) {
    const k = p.keys;
    let cur = m.cur[p.id];
    const old = cur;
    if (wasPressed(k.left) && cur % 4 > 0) cur--;
    if (wasPressed(k.right) && cur % 4 < 3) cur++;
    if (wasPressed(k.up) && cur >= 4) cur -= 4;
    if (wasPressed(k.down) && cur < 4) cur += 4;
    if (cur !== old) SFX.tick();
    m.cur[p.id] = cur;
    if (game.stateT > 0.4 && (wasPressed(k.action) || wasPressed(k.build))) buy(p, cur);
  }
  if (game.players.every((p) => m.ready[p.id])) startBuild();
}
function buy(p, idx) {
  const item = SHOP[idx];
  const cp = cardPos(idx);
  const fx = cp.x + CARD.w / 2, fy = cp.y + 20;
  if (item.id === 'go') {
    game.market.ready[p.id] = !game.market.ready[p.id];
    SFX.tick();
    return;
  }
  const price = item.price(p);
  if (price === null) {
    floater(fx, fy, item.id === 'heal' ? 'Die Burg ist ganz heil!' : 'Hast du schon!', '#fff', true);
    SFX.no();
  } else if (game.coins < price) {
    floater(fx, fy, 'Zu wenig Taler!', '#ffb3b3', true);
    SFX.no();
  } else {
    game.coins -= price;
    const msg = item.apply(p);
    floater(fx, fy, msg, '#b8ffb0', true);
    SFX.buy();
  }
}

// =========================================================================
//   Zeichnen
// =========================================================================
let bgCanvas = null;
function makeBackground() {
  const c = document.createElement('canvas');
  c.width = W; c.height = WORLD_H;
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  g.fillStyle = '#86c96a';
  g.fillRect(0, 0, W, WORLD_H);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = rnd() < 0.5 ? '#7dbf60' : '#92d276';
    g.beginPath();
    g.ellipse(rnd() * W, rnd() * WORLD_H, 10 + rnd() * 30, 6 + rnd() * 14, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Weg zur Burg
  g.fillStyle = '#d8b878';
  g.beginPath();
  for (let x = CASTLE_COLS * T - 20; x <= W; x += 16) g.lineTo(x, 320 + Math.sin(x / 90) * 25 - 38);
  for (let x = W; x >= CASTLE_COLS * T - 20; x -= 16) g.lineTo(x, 320 + Math.sin(x / 90) * 25 + 38);
  g.closePath();
  g.fill();
  for (let i = 0; i < 60; i++) {
    const x = CASTLE_COLS * T + rnd() * (W - CASTLE_COLS * T);
    g.fillStyle = '#c9a66b';
    g.beginPath();
    g.ellipse(x, 320 + Math.sin(x / 90) * 25 + (rnd() - 0.5) * 50, 3 + rnd() * 4, 2 + rnd() * 2, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Grasbüschel und Blumen
  for (let i = 0; i < 140; i++) {
    const x = CASTLE_COLS * T + 10 + rnd() * (W - CASTLE_COLS * T - 10), y = rnd() * WORLD_H;
    if (Math.abs(y - (320 + Math.sin(x / 90) * 25)) < 45) continue;
    g.strokeStyle = '#5ea844'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x - 4, y - 7); g.lineTo(x, y); g.lineTo(x + 4, y - 8); g.moveTo(x, y); g.lineTo(x, y - 9); g.stroke();
  }
  const flowerCols = ['#fff', '#ffe14d', '#ff8cdb', '#ff6b6b', '#b8a6ff'];
  for (let i = 0; i < 70; i++) {
    const x = CASTLE_COLS * T + 10 + rnd() * (W - CASTLE_COLS * T - 10), y = rnd() * WORLD_H;
    if (Math.abs(y - (320 + Math.sin(x / 90) * 25)) < 45) continue;
    g.fillStyle = flowerCols[Math.floor(rnd() * flowerCols.length)];
    for (let k = 0; k < 5; k++) {
      const a = k * Math.PI * 2 / 5;
      g.beginPath(); g.arc(x + Math.cos(a) * 3.5, y + Math.sin(a) * 3.5, 2.6, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#ffb300'; g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill();
  }
  // Burghof
  g.fillStyle = '#e2cf9c';
  g.fillRect(0, 0, CASTLE_COLS * T, WORLD_H);
  for (let i = 0; i < 300; i++) {
    g.fillStyle = rnd() < 0.5 ? '#d4bf88' : '#ead9aa';
    g.beginPath();
    g.ellipse(rnd() * CASTLE_COLS * T, rnd() * WORLD_H, 6 + rnd() * 10, 4 + rnd() * 6, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(120, 90, 40, 0.18)';
  g.lineWidth = 2;
  for (let cc = 0; cc < CASTLE_COLS; cc++) for (let r = 0; r < ROWS; r++) g.strokeRect(cc * T + 1, r * T + 1, T - 2, T - 2);
  g.strokeStyle = 'rgba(110, 70, 30, 0.55)';
  g.lineWidth = 4;
  g.setLineDash([14, 10]);
  g.beginPath(); g.moveTo(CASTLE_COLS * T, 0); g.lineTo(CASTLE_COLS * T, WORLD_H); g.stroke();
  g.setLineDash([]);
  bgCanvas = c;
}

// ---------- Figuren ----------
function drawHorse(walk, moving, color, blanket) {
  const a = moving ? Math.sin(walk * 14) * 5 : 0;
  ctx.fillStyle = color;
  [-17, -9, 10, 18].forEach((lx, i) => ctx.fillRect(lx + (i % 2 ? a : -a) * 0.6, -18, 5, 18));
  ctx.fillStyle = '#2b1d12';
  [-17, -9, 10, 18].forEach((lx, i) => ctx.fillRect(lx + (i % 2 ? a : -a) * 0.6, -3, 5, 3));
  ctx.strokeStyle = '#3b2412'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-24, -28); ctx.quadraticCurveTo(-38, -22 + a * 0.5, -32, -8); ctx.stroke();
  ctx.fillStyle = color;
  ell(0, -26, 27, 12); ctx.fill();
  ctx.beginPath(); ctx.moveTo(13, -32); ctx.lineTo(24, -52); ctx.lineTo(33, -47); ctx.lineTo(25, -22); ctx.closePath(); ctx.fill();
  ell(32, -49, 11, 6.5, 0.35); ctx.fill();
  ctx.beginPath(); ctx.moveTo(24, -55); ctx.lineTo(27, -63); ctx.lineTo(29, -54); ctx.fill();
  ctx.strokeStyle = '#3b2412'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(13, -36); ctx.lineTo(23, -55); ctx.stroke();
  ctx.fillStyle = '#111'; circle(31, -51, 1.7); ctx.fill();
  ctx.fillStyle = blanket; rr(-13, -40, 26, 14, 4); ctx.fill();
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(-13, -29, 26, 3);
}
function drawShield(x, y, level, emblem) {
  const face = ['#a0703c', '#c9d1d9', '#ffcf33'][level - 1];
  const rim = ['#5b3a1a', '#6f7a84', '#b8860b'][level - 1];
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(-9, -11); ctx.lineTo(9, -11); ctx.lineTo(9, 0);
  ctx.quadraticCurveTo(9, 9, 0, 13); ctx.quadraticCurveTo(-9, 9, -9, 0);
  ctx.closePath();
  ctx.fillStyle = face; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = rim; ctx.stroke();
  ctx.fillStyle = emblem;
  ctx.fillRect(-1.6, -8, 3.2, 17);
  ctx.fillRect(-6, -3.5, 12, 3.2);
  ctx.restore();
}
function drawSword(level, swing, hx = 11, hy = -24, hand = true) {
  const laser = level === 4;
  const col = ['#c8a06a', '#dfe6ee', '#ffd23f', '#7df9ff'][level - 1];
  const L = [22, 27, 31, 36][level - 1];
  let a = -1.15;
  if (swing > 0) a = -2.3 + (1 - swing / 0.25) * 3.2;
  if (swing > 0) {
    ctx.strokeStyle = laser ? 'rgba(125,249,255,0.8)' : 'rgba(255,255,255,0.75)';
    ctx.lineWidth = laser ? 8 : 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(hx, hy, L + 6, -2.3, a); ctx.stroke();
  }
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(a);
  if (laser) {
    ctx.fillStyle = '#9aa3ad'; ctx.fillRect(-9, -2.8, 12, 5.6);
    ctx.fillStyle = '#444'; ctx.fillRect(-6, -2.8, 2, 5.6); ctx.fillRect(-2, -2.8, 2, 5.6);
    ctx.save();
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 14;
    ctx.fillStyle = col; rr(3, -3.5, L + 4, 7, 3.5); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffffff'; rr(4, -1.5, L + 2, 3, 1.5); ctx.fill();
  } else {
    ctx.fillStyle = '#6b4423'; ctx.fillRect(-7, -2, 8, 4);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(3, -2.8); ctx.lineTo(3 + L, -2.8); ctx.lineTo(3 + L + 6, 0); ctx.lineTo(3 + L, 2.8); ctx.lineTo(3, 2.8); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#8a6d3b'; ctx.fillRect(0, -7, 3.5, 14);
  }
  if (hand) { ctx.fillStyle = '#f6cfa6'; circle(-2, 0, 3.6); ctx.fill(); }
  ctx.restore();
}
function drawGroundSword(sw) {
  if (sw.t > 21 && Math.floor(sw.t * 8) % 2 === 0) return;   // blinkt kurz vor dem Verschwinden
  const sc = Math.min(1, sw.t * 6);
  ctx.save();
  ctx.translate(sw.x, sw.y);
  ctx.scale(sc, sc);
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ell(0, 0, 20, 4); ctx.fill();
  if (sw.level === 4) {
    ctx.fillStyle = `rgba(125,249,255,${0.25 + 0.15 * Math.sin(sw.t * 6)})`;
    ell(0, -4, 30, 10); ctx.fill();
  }
  ctx.translate(-16, -5 + Math.sin(sw.t * 3) * 1.5);
  ctx.rotate(1.15 - 0.15);
  drawSword(sw.level, 0, 0, 0, false);
  ctx.restore();
  if (Math.sin(sw.t * 3 + 1) > 0.92) star(sw.x + 12, sw.y - 14, 4, '#fff');
}
function drawHeldCrossbow() {
  ctx.save();
  ctx.translate(8, -26);
  ctx.fillStyle = '#6b4423'; ctx.fillRect(0, -2.5, 20, 5);
  ctx.strokeStyle = '#3d2a18'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(12, 0, 11, -1.25, 1.25); ctx.stroke();
  ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(15.5, -10.4); ctx.lineTo(15.5, 10.4); ctx.stroke();
  ctx.fillStyle = '#f6cfa6'; circle(2, 0, 3.6); ctx.fill();
  ctx.restore();
}
function drawWhiteFlag(t) {
  const w = Math.sin(t * 10) * 3;
  ctx.strokeStyle = '#6b4423'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(8, -20); ctx.lineTo(8, -78); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#999'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(8, -78); ctx.quadraticCurveTo(18, -82 + w, 30, -77); ctx.lineTo(30, -63);
  ctx.quadraticCurveTo(18, -68 + w, 8, -63); ctx.closePath(); ctx.fill(); ctx.stroke();
}

function drawKnight(x, y, o) {
  ctx.save();
  ctx.translate(x, y);
  const sc = o.scale || 1;
  ctx.scale(sc, sc);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ell(0, 0, o.horse && !o.ko ? 32 : 16, 6); ctx.fill();
  if (o.ko) { ctx.translate(-4, -8); ctx.rotate(-1.45 * (o.dir || 1)); }
  ctx.scale(o.dir < 0 ? -1 : 1, 1);
  const moving = o.moving && !o.ko;
  const step = moving ? Math.sin(o.walk * 14) : 0;
  if (o.horse && !o.ko) {
    drawHorse(o.walk, moving, o.horseColor || '#a0673a', o.tunic);
    ctx.translate(0, -24);
  } else {
    ctx.fillStyle = '#4a4a55';
    ctx.fillRect(-7 + step * 3, -13, 5, 13);
    ctx.fillRect(2 - step * 3, -13, 5, 13);
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(-8 + step * 3, -3, 7, 3);
    ctx.fillRect(1 - step * 3, -3, 7, 3);
  }
  ctx.translate(0, moving ? -Math.abs(step) * 1.5 : 0);
  const flash = o.hurt > 0 && Math.floor(o.hurt * 30) % 2 === 0;
  ctx.fillStyle = '#aeb6bf'; rr(-11, -34, 22, 24, 7); ctx.fill();
  ctx.fillStyle = flash ? '#ffffff' : o.tunic; rr(-10, -32, 20, 21, 6); ctx.fill();
  ctx.fillStyle = '#5b3a1a'; ctx.fillRect(-10, -17, 20, 3);
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(-1.5, -17.5, 4, 4);
  // Kopf
  ctx.fillStyle = flash ? '#fff' : '#f6cfa6'; circle(0, -44, 11); ctx.fill();
  ctx.fillStyle = 'rgba(255,120,120,0.45)'; circle(7, -40, 2.6); ctx.fill(); circle(-5, -40, 2.6); ctx.fill();
  ctx.fillStyle = o.helmet || '#c3cbd3';
  ctx.beginPath(); ctx.arc(0, -45, 12.5, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.fillRect(-13.5, -47, 27, 4);
  ctx.fillRect(2, -47, 2.6, 7);
  if (o.ko) {
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.6;
    for (const ex of [-3, 7]) {
      ctx.beginPath(); ctx.moveTo(ex - 2, -44); ctx.lineTo(ex + 2, -40); ctx.moveTo(ex + 2, -44); ctx.lineTo(ex - 2, -40); ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#222'; circle(-3, -42, 1.9); ctx.fill(); circle(7, -42, 1.9); ctx.fill();
  }
  if (o.angry) {
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-6.5, -46.5); ctx.lineTo(-0.5, -44.8); ctx.moveTo(10.5, -46.5); ctx.lineTo(4.5, -44.8); ctx.stroke();
  }
  ctx.strokeStyle = '#a0522d'; ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (o.flee) ctx.arc(2, -35, 2.6, 0, Math.PI * 2);
  else ctx.arc(2, -38.5, 3.2, 0.25, Math.PI - 0.25);
  ctx.stroke();
  ctx.fillStyle = o.plume;
  ell(-5, -59, 5, 9, -0.6); ctx.fill();
  // Waffen
  if (o.flee) drawWhiteFlag(o.walk);
  else if (!o.ko) {
    if (o.weapon === 'crossbow') drawHeldCrossbow();
    else drawSword(o.sword || 1, o.swing || 0);
    drawShield(-11, -23, o.shield || 1, o.emblem || '#fff');
  }
  ctx.restore();
}

function drawPlayer(p) {
  const ko = p.ko > 0;
  drawKnight(p.x, p.y, {
    tunic: p.color, plume: p.plume, dir: p.dir, walk: ko ? game.t : p.walk, moving: ko ? false : p.moving,
    swing: p.swing, sword: p.sword, shield: p.shield, emblem: p.color,
    horse: p.horse, horseColor: p.id ? '#e8e0d0' : '#8b5a2b', hurt: p.hurt, flee: ko,
  });
  // Name
  const top = p.y - (p.horse ? 100 : 76);
  txt(p.id ? 'Grün' : 'Blau', p.x, top - (showSelection(p) ? 30 : 0), 14, p.color, 'center', '#fff');
  if (showSelection(p)) drawSelection(p, top);
}
function showSelection(p) {
  return p.ko <= 0 && (game.state === 'build' || p.x < CASTLE_COLS * T);
}
function drawSelection(p, top) {
  const item = ITEMS[p.sel];
  const n = game.inv[item];
  ctx.fillStyle = 'rgba(255,248,225,0.92)';
  rr(p.x - 34, top - 22, 68, 30, 8); ctx.fill();
  ctx.strokeStyle = p.color; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.save();
  ctx.translate(p.x - 30, top - 21);
  ctx.scale(0.42, 0.42);
  drawItemIcon(item, 0, 6);
  ctx.restore();
  txt(`x${n}`, p.x + 14, top - 6, 16, n > 0 ? '#2b1d12' : '#c0392b', 'center', null);
}

function drawEnemy(e) {
  drawKnight(e.x, e.y, {
    tunic: e.tunic, plume: e.plume, dir: e.dir, walk: e.walk, moving: e.moving || e.flee,
    swing: e.weapon === 'crossbow' ? 0 : (e.swing > 0 ? e.swing * 0.83 : 0), sword: e.sword || 1, shield: 1,
    emblem: '#2b1d12', helmet: e.type === 'boss' ? '#4a4a55' : '#9aa3ad', angry: !e.flee,
    horse: e.horse, horseColor: '#5a3a22', hurt: e.hurt, flee: e.flee, scale: e.scale,
    weapon: e.type === 'archer' ? 'crossbow' : 'sword',
  });
  if (!e.flee && e.hp < e.max) {
    const w = e.type === 'boss' ? 80 : 34;
    const y = e.y - (e.horse ? 92 : 78) * e.scale;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(e.x - w / 2 - 1, y - 1, w + 2, 7);
    ctx.fillStyle = '#ff5a5a'; ctx.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp) / e.max, 5);
  }
}

// ---------- Bauwerke ----------
function drawWall(x, y, s) {
  const dmg = s ? 1 - s.hp / s.max : 0;
  const flash = s && s.hurt > 0;
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x + 4, y + 58, 60, 6);
  ctx.fillStyle = flash ? '#e8e8e8' : '#8f969e'; rr(x + 2, y + 6, 60, 56, 5); ctx.fill();
  ctx.fillStyle = flash ? '#fff' : '#a9b0b8'; rr(x + 2, y + 6, 60, 10, 4); ctx.fill();
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = flash ? '#f0f0f0' : '#9aa1a9'; rr(x + 4 + i * 20, y - 6, 16, 15, 3); ctx.fill();
    ctx.fillStyle = flash ? '#fff' : '#b9c0c7'; ctx.fillRect(x + 5 + i * 20, y - 5, 14, 4);
  }
  ctx.strokeStyle = '#6f757c'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 4, y + 30); ctx.lineTo(x + 60, y + 30);
  ctx.moveTo(x + 4, y + 46); ctx.lineTo(x + 60, y + 46);
  for (const vx of [22, 42]) { ctx.moveTo(x + vx, y + 16); ctx.lineTo(x + vx, y + 30); ctx.moveTo(x + vx, y + 46); ctx.lineTo(x + vx, y + 61); }
  for (const vx of [12, 32, 52]) { ctx.moveTo(x + vx, y + 30); ctx.lineTo(x + vx, y + 46); }
  ctx.stroke();
  if (dmg > 0.35) {
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 18, y + 12); ctx.lineTo(x + 26, y + 26); ctx.lineTo(x + 20, y + 36); ctx.lineTo(x + 30, y + 50); ctx.stroke();
  }
  if (dmg > 0.65) {
    ctx.beginPath(); ctx.moveTo(x + 50, y + 18); ctx.lineTo(x + 42, y + 32); ctx.lineTo(x + 48, y + 44); ctx.stroke();
    ctx.fillStyle = '#6f757c'; ctx.fillRect(x + 44, y - 6, 16, 8);
  }
}
function drawCatapult(x, y, s) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ell(x + 32, y + 60, 30, 6); ctx.fill();
  ctx.fillStyle = '#9b6b3a'; rr(x + 4, y + 40, 56, 10, 3); ctx.fill();
  ctx.strokeStyle = '#7a4f27'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + 20, y + 44); ctx.lineTo(x + 32, y + 22); ctx.lineTo(x + 44, y + 44); ctx.stroke();
  const rest = -2.75, fired = -1.15;
  const p = s ? s.anim / 0.5 : 0;
  const ang = rest + (fired - rest) * (p > 0.8 ? (1 - p) * 5 : p / 0.8);
  ctx.save();
  ctx.translate(x + 32, y + 26);
  ctx.rotate(ang);
  ctx.fillStyle = '#8a5a2b'; ctx.fillRect(-4, -3.5, 36, 7);
  ctx.fillStyle = '#5b3a1a'; ell(32, -3, 8, 5); ctx.fill();
  if (!s || s.cd <= 3.3) { ctx.fillStyle = '#8d8d8d'; circle(32, -7, 6); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = '#5b3a1a';
  circle(x + 15, y + 52, 9); ctx.fill(); circle(x + 49, y + 52, 9); ctx.fill();
  ctx.fillStyle = '#c99a5b';
  circle(x + 15, y + 52, 3); ctx.fill(); circle(x + 49, y + 52, 3); ctx.fill();
  if (s && s.hurt > 0) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x + 4, y + 18, 56, 44); }
}
function drawCrossbowTower(x, y, s) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ell(x + 32, y + 60, 26, 6); ctx.fill();
  ctx.strokeStyle = '#7a4f27'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + 14, y + 60); ctx.lineTo(x + 22, y + 28); ctx.moveTo(x + 50, y + 60); ctx.lineTo(x + 42, y + 28); ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x + 17, y + 48); ctx.lineTo(x + 46, y + 38); ctx.moveTo(x + 47, y + 48); ctx.lineTo(x + 18, y + 38); ctx.stroke();
  ctx.fillStyle = '#9b6b3a'; rr(x + 10, y + 20, 44, 12, 3); ctx.fill();
  ctx.save();
  ctx.translate(x + 32, y + 18);
  ctx.rotate(s ? s.angle : 0);
  ctx.fillStyle = '#6b4423'; ctx.fillRect(-12, -3, 28, 6);
  ctx.strokeStyle = '#3d2a18'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(8, 0, 14, -1.3, 1.3); ctx.stroke();
  ctx.strokeStyle = '#eee'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(8 + 14 * Math.cos(1.3), -14 * Math.sin(1.3)); ctx.lineTo(-6, 0); ctx.lineTo(8 + 14 * Math.cos(1.3), 14 * Math.sin(1.3)); ctx.stroke();
  if (!s || s.cd < 0.9) { ctx.fillStyle = '#ccc'; ctx.fillRect(-6, -1, 26, 2); }
  ctx.restore();
  if (s && s.hurt > 0) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x + 10, y + 6, 44, 56); }
}
function drawItemIcon(item, x, y) {
  if (item === 'wall') drawWall(x, y, null);
  else if (item === 'catapult') drawCatapult(x, y, null);
  else drawCrossbowTower(x, y, null);
}
function drawKeep(s) {
  const x = s.c * T, y = s.r * T;
  const flash = s.hurt > 0;
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x + 10, y + 120, 120, 10);
  ctx.fillStyle = flash ? '#ddd' : '#8f969e'; rr(x + 6, y + 4, 116, 124, 6); ctx.fill();
  ctx.fillStyle = flash ? '#eee' : '#a9b0b8'; rr(x + 6, y + 4, 116, 12, 5); ctx.fill();
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = '#9aa1a9'; rr(x + 8 + i * 23, y - 10, 18, 18, 3); ctx.fill();
    ctx.fillStyle = '#b9c0c7'; ctx.fillRect(x + 9 + i * 23, y - 9, 16, 4);
  }
  ctx.strokeStyle = '#6f757c'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let row = 0; row < 7; row++) {
    const yy = y + 18 + row * 16;
    ctx.moveTo(x + 8, yy); ctx.lineTo(x + 120, yy);
    for (let bx = (row % 2 ? 16 : 30); bx < 116; bx += 28) { ctx.moveTo(x + bx, yy); ctx.lineTo(x + bx, yy + 16); }
  }
  ctx.stroke();
  // Fenster
  ctx.fillStyle = '#3b2a1a';
  ctx.beginPath(); ctx.moveTo(x + 56, y + 56); ctx.lineTo(x + 56, y + 40); ctx.arc(x + 64, y + 40, 8, Math.PI, 0); ctx.lineTo(x + 72, y + 56); ctx.closePath(); ctx.fill();
  // Tor
  ctx.fillStyle = '#7a4a22';
  ctx.beginPath(); ctx.moveTo(x + 46, y + 128); ctx.lineTo(x + 46, y + 98); ctx.arc(x + 64, y + 98, 18, Math.PI, 0); ctx.lineTo(x + 82, y + 128); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#5b3a1a'; ctx.lineWidth = 2;
  ctx.beginPath(); for (const bx of [55, 64, 73]) { ctx.moveTo(x + bx, y + 84); ctx.lineTo(x + bx, y + 128); } ctx.stroke();
  ctx.fillStyle = '#ffd23f'; circle(x + 76, y + 110, 2.5); ctx.fill();
  // Fahne
  ctx.strokeStyle = '#5b3a1a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x + 64, y - 8); ctx.lineTo(x + 64, y - 66); ctx.stroke();
  const t = game ? game.t : performance.now() / 1000;
  const w1 = Math.sin(t * 4) * 4, w2 = Math.sin(t * 4 + 1.5) * 4;
  ctx.fillStyle = '#3a7bd5';
  ctx.beginPath(); ctx.moveTo(x + 66, y - 66); ctx.quadraticCurveTo(x + 82, y - 70 + w1, x + 100, y - 64 + w2); ctx.lineTo(x + 100, y - 54 + w2);
  ctx.quadraticCurveTo(x + 82, y - 60 + w1, x + 66, y - 56); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3cb04a';
  ctx.beginPath(); ctx.moveTo(x + 66, y - 56); ctx.quadraticCurveTo(x + 82, y - 60 + w1, x + 100, y - 54 + w2); ctx.lineTo(x + 100, y - 44 + w2);
  ctx.quadraticCurveTo(x + 82, y - 50 + w1, x + 66, y - 46); ctx.closePath(); ctx.fill();
  star(x + 82, y - 56 + w1 * 0.7, 5, '#ffd23f');
}
function drawBell() {
  const x = BELL.c * T, y = BELL.r * T;
  if (game.state === 'build') {
    const a = 0.45 + 0.4 * Math.sin(game.t * 5);
    ctx.fillStyle = `rgba(255, 230, 80, ${a * 0.35})`;
    circle(x + 32, y + 36, 40); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ell(x + 32, y + 62, 28, 5); ctx.fill();
  ctx.strokeStyle = '#7a4f27'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + 10, y + 62); ctx.lineTo(x + 10, y + 6); ctx.moveTo(x + 54, y + 62); ctx.lineTo(x + 54, y + 6); ctx.stroke();
  ctx.fillStyle = '#9b6b3a'; rr(x + 4, y + 2, 56, 9, 3); ctx.fill();
  const sw = Math.sin(game.t * 12) * game.bell.swing * 0.6;
  ctx.save();
  ctx.translate(x + 32, y + 10);
  ctx.rotate(sw);
  ctx.strokeStyle = '#5b3a1a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 8); ctx.stroke();
  ctx.fillStyle = '#f2c14e'; ctx.strokeStyle = '#a8791a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-12, 30); ctx.quadraticCurveTo(-13, 8, 0, 8); ctx.quadraticCurveTo(13, 8, 12, 30); ctx.lineTo(16, 35); ctx.lineTo(-16, 35); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff3c4'; ctx.fillRect(-7, 14, 3, 12);
  ctx.fillStyle = '#a8791a'; circle(sw * -8, 37, 3.5); ctx.fill();
  ctx.restore();
  if (game.state === 'build') txt('Glocke: Los!', x + 32, y + 76, 14, '#fff');
}
function drawStructHp(s) {
  if (s.type === 'keep' || s.hp >= s.max) return;
  const x = s.c * T + 8, y = s.r * T - 14, w = 48;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - 1, y - 1, w + 2, 7);
  const f = Math.max(0, s.hp / s.max);
  ctx.fillStyle = f > 0.5 ? '#6ad15a' : f > 0.25 ? '#ffd23f' : '#ff5a5a';
  ctx.fillRect(x, y, w * f, 5);
}
function drawStruct(s) {
  if (s.type === 'keep') { drawKeep(s); return; }
  const x = s.c * T, y = s.r * T;
  ctx.save();
  if (s.pop > 0) {
    const k = 1 + s.pop * 0.8;
    ctx.translate(x + 32, y + 64); ctx.scale(k, 2 - k); ctx.translate(-x - 32, -y - 64);
  }
  if (s.type === 'wall') drawWall(x, y, s);
  else if (s.type === 'catapult') drawCatapult(x, y, s);
  else drawCrossbowTower(x, y, s);
  ctx.restore();
}
function drawBag(b) {
  const bob = Math.sin(b.t * 4) * 2;
  const sc = Math.min(1, b.t * 5);
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.scale(sc, sc);
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ell(0, 0, 12, 4); ctx.fill();
  ctx.fillStyle = '#b07a3c';
  ell(0, -11 + bob, 13, 11); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-6, -20 + bob); ctx.lineTo(-9, -29 + bob); ctx.lineTo(0, -25 + bob); ctx.lineTo(9, -29 + bob); ctx.lineTo(6, -20 + bob); ctx.fill();
  ctx.fillStyle = '#6b4423'; ctx.fillRect(-7, -22 + bob, 14, 3);
  ctx.fillStyle = '#ffd23f'; circle(0, -10 + bob, 5.5); ctx.fill();
  ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 1.5; ctx.stroke();
  if (Math.sin(b.t * 3) > 0.9) star(8, -24 + bob, 4, '#fff');
  ctx.restore();
}

function drawShots() {
  for (const s of game.shots) {
    if (s.kind === 'boulder') {
      const p = Math.min(1, s.t / s.dur);
      const x = s.sx + (s.tx - s.sx) * p, gy = s.sy + (s.ty - s.sy) * p;
      const h = Math.sin(p * Math.PI) * s.peak + 30 * (1 - p);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ell(x, gy, 9, 3); ctx.fill();
      ctx.fillStyle = '#8d8d8d'; circle(x, gy - h, 9); ctx.fill();
      ctx.fillStyle = '#b3b3b3'; circle(x - 3, gy - h - 3, 3); ctx.fill();
    } else {
      const a = Math.atan2(s.vy, s.vx);
      ctx.save();
      ctx.translate(s.x, s.y - s.h);
      ctx.rotate(a);
      ctx.fillStyle = s.kind === 'bolt' ? '#5b3a1a' : '#3d2a18';
      ctx.fillRect(-10, -1.5, 18, 3);
      ctx.fillStyle = '#ccc';
      ctx.beginPath(); ctx.moveTo(8, -3.5); ctx.lineTo(14, 0); ctx.lineTo(8, 3.5); ctx.fill();
      ctx.fillStyle = s.kind === 'bolt' ? '#3a7bd5' : '#d64545';
      ctx.fillRect(-11, -3, 4, 6);
      ctx.restore();
    }
  }
}
function drawParticles() {
  for (const p of game.parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5));
    if (p.kind === 'star') star(p.x, p.y, p.size, p.color);
    else if (p.kind === 'confetti') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore();
    } else { ctx.fillStyle = p.color; circle(p.x, p.y, p.size / 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}
function drawFloaters(screen) {
  for (const f of game.floaters) {
    if (!!f.screen !== screen) continue;
    ctx.globalAlpha = Math.min(1, f.t * 2);
    txt(f.text, f.x, f.y, f.size, f.color);
  }
  ctx.globalAlpha = 1;
}

function drawWorld() {
  ctx.save();
  ctx.translate(0, TOP);
  ctx.drawImage(bgCanvas, 0, 0);
  if (game.state === 'build') {
    ctx.fillStyle = `rgba(255,255,255,${0.06 + 0.04 * Math.sin(game.t * 3)})`;
    ctx.fillRect(0, 0, CASTLE_COLS * T, WORLD_H);
  }
  // Bauvorschau
  if (game.state === 'build' || game.state === 'wave') {
    for (const p of game.players) {
      if (p.ko > 0) continue;
      const c = Math.floor(p.x / T), r = Math.floor(p.y / T);
      if (!canBuildAt(c, r)) continue;
      const item = ITEMS[p.sel];
      ctx.globalAlpha = game.inv[item] > 0 ? 0.35 : 0.15;
      drawItemIcon(item, c * T, r * T);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = p.color; ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(c * T + 3, r * T + 3, T - 6, T - 6);
      ctx.setLineDash([]);
    }
  }
  const list = [];
  for (const s of game.structs) list.push({ y: s.type === 'keep' ? (s.r + 2) * T - 12 : s.r * T + 10, f: () => drawStruct(s) });
  list.push({ y: BELL.r * T + 10, f: drawBell });
  for (const b of game.bags) list.push({ y: b.y, f: () => drawBag(b) });
  for (const sw of game.swords) list.push({ y: sw.y, f: () => drawGroundSword(sw) });
  for (const p of game.players) list.push({ y: p.y, f: () => drawPlayer(p) });
  for (const e of game.enemies) list.push({ y: e.y, f: () => drawEnemy(e) });
  list.sort((a, b) => a.y - b.y);
  for (const d of list) d.f();
  for (const s of game.structs) drawStructHp(s);
  drawShots();
  drawParticles();
  drawFloaters(false);
  ctx.restore();
}

function drawHUD() {
  const g = ctx.createLinearGradient(0, 0, 0, TOP);
  g.addColorStop(0, '#8a5a2b'); g.addColorStop(1, '#6b4423');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, TOP);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 27); ctx.lineTo(W, 27); ctx.moveTo(0, 53); ctx.lineTo(W, 53); ctx.stroke();
  ctx.fillStyle = '#3d2a18'; ctx.fillRect(0, TOP - 4, W, 4);

  drawPlayerPanel(game.players[0], 10);
  if (game.players[1]) drawPlayerPanel(game.players[1], W - 232);

  // Burg
  ctx.save(); ctx.translate(262, 18); ctx.scale(0.3, 0.3); drawHeart(0, 0, '#ff4d6d'); ctx.restore();
  txt('Burg', 300, 22, 18, '#fff', 'left');
  const k = game.keep, f = k.hp / k.max;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; rr(258, 38, 184, 22, 8); ctx.fill();
  ctx.fillStyle = f > 0.5 ? '#6ad15a' : f > 0.25 ? '#ffd23f' : '#ff5a5a';
  rr(261, 41, Math.max(10, 178 * f), 16, 6); ctx.fill();
  txt(`${Math.ceil(k.hp)} / ${k.max}`, 350, 49, 14, '#fff');

  // Taler
  drawBag({ x: 482, y: 60, t: 1 });
  txt(`${game.coins}`, 502, 42, 30, '#ffd23f', 'left');
  txt('Taler', 502, 66, 12, '#fff', 'left');

  // Vorrat
  ITEMS.forEach((item, i) => {
    const x = 600 + i * 104;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; rr(x, 10, 96, 60, 10); ctx.fill();
    ctx.save(); ctx.translate(x + 4, 18); ctx.scale(0.66, 0.66); drawItemIcon(item, 0, 6); ctx.restore();
    txt(`${game.inv[item]}`, x + 72, 34, 24, game.inv[item] > 0 ? '#fff' : '#ff9a9a');
    txt(ITEM_NAME[item], x + 72, 58, 11, '#f3e3bd', 'center', null);
  });

  // Welle
  txt(`Welle ${Math.min(game.waveIdx + 1, WAVES.length)} / ${WAVES.length}`, 975, 30, 22, '#fff');
  const phase = { build: 'Bauzeit', wave: 'Kampf!', market: 'Markt', over: '', win: 'Gewonnen!' }[game.state];
  txt(phase, 975, 56, 16, game.state === 'wave' ? '#ff9a9a' : '#b8ffb0');
}
function drawHeart(x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + 30);
  ctx.bezierCurveTo(x - 60, y - 10, x - 25, y - 50, x, y - 20);
  ctx.bezierCurveTo(x + 25, y - 50, x + 60, y - 10, x, y + 30);
  ctx.fill();
}
function drawPlayerPanel(p, x) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; rr(x, 6, 222, 68, 12); ctx.fill();
  ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.rect(x, 6, 60, 68); ctx.clip();
  drawKnight(x + 30, 118, { tunic: p.color, plume: p.plume, dir: 1, walk: 0, sword: p.sword, shield: p.shield, emblem: p.color, scale: 1.3 });
  ctx.restore();
  txt(p.name, x + 66, 20, 16, '#fff', 'left');
  const f = p.ko > 0 ? 0 : p.hp / p.max;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; rr(x + 66, 32, 146, 12, 5); ctx.fill();
  ctx.fillStyle = f > 0.5 ? '#6ad15a' : f > 0.25 ? '#ffd23f' : '#ff5a5a';
  if (game.infinite) { ctx.fillStyle = '#6ad15a'; rr(x + 68, 34, 142, 8, 4); ctx.fill(); txt('∞', x + 139, 37, 22, '#fff'); }
  else if (f > 0) { rr(x + 68, 34, Math.max(6, 142 * f), 8, 4); ctx.fill(); }
  ctx.save(); ctx.translate(x + 76, 64); ctx.rotate(-0.8); ctx.scale(0.8, 0.8);
  drawSword(p.sword, 0, -10, 0); ctx.restore();
  drawShield(x + 104, 60, p.shield, p.color);
  if (p.horse) { ctx.save(); ctx.translate(x + 134, 72); ctx.scale(0.42, 0.42); drawHorse(0, false, p.id ? '#e8e0d0' : '#8b5a2b', p.color); ctx.restore(); }
  if (p.ko > 0) txt('ruht sich aus...', x + 180, 61, 11, '#ffe14d', 'center');
}

function drawHints() {
  let s;
  if (game.state === 'build') s = 'Bauen: E / Shift rechts  •  Baustein wechseln: Leertaste / Enter  •  Fertig? Geht zur Glocke und drückt Leertaste / Enter!';
  else if (game.state === 'wave') s = 'Schwert: Leertaste / Enter (am Katapult: schießen)  •  Bauen & reparieren: E / Shift rechts  •  Sammelt die Geldsäcke!';
  else return;
  if (game.single) s = s.replace(/ \/ Shift rechts/g, '').replace(/ \/ Enter/g, '');
  ctx.fillStyle = 'rgba(43,29,18,0.7)';
  ctx.fillRect(0, H - 26, W, 26);
  txt(s, W / 2, H - 13, 14, '#fff3c4', 'center', null);
}

function drawBanner() {
  const b = game.banner;
  if (!b) return;
  const age = b.max - b.t;
  const a = Math.min(1, age * 4, b.t * 2);
  const sc = 0.7 + 0.3 * Math.min(1, age * 5);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(W / 2, 250);
  ctx.scale(sc, sc);
  ctx.fillStyle = 'rgba(43,29,18,0.75)';
  rr(-380, -60, 760, b.sub ? 130 : 100, 24); ctx.fill();
  ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4; ctx.stroke();
  txt(b.text, 0, -12, 56, '#ffd23f');
  if (b.sub) txt(b.sub, 0, 44, 24, '#fff');
  ctx.restore();
}

function drawMarket() {
  ctx.fillStyle = 'rgba(43,29,18,0.82)';
  ctx.fillRect(0, 0, W, H);
  txt('Markt', W / 2, 70, 56, '#ffd23f');
  txt('Was wollt ihr kaufen?', W / 2, 120, 24, '#fff');
  drawBag({ x: W / 2 - 50, y: 182, t: 1 });
  txt(`${game.coins} Taler`, W / 2 - 30, 166, 28, '#ffd23f', 'left');
  const m = game.market;
  SHOP.forEach((item, i) => {
    const { x, y } = cardPos(i);
    ctx.fillStyle = item.id === 'go' ? '#d6f5c9' : '#f3e3bd';
    rr(x, y, CARD.w, CARD.h, 16); ctx.fill();
    ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 4; ctx.stroke();
    drawShopIcon(item.id, x + CARD.w / 2, y + 88);
    txt(item.name, x + CARD.w / 2, y + 150, 22, '#2b1d12', 'center', null);
    if (item.id === 'go') {
      game.players.forEach((p, j) => {
        const px = x + CARD.w / 2 + (game.players.length > 1 ? (j ? 50 : -50) : 0);
        txt(m.ready[p.id] ? `${p.id ? 'Grün' : 'Blau'}: bereit!` : `${p.id ? 'Grün' : 'Blau'}: ...`, px, y + 184, 17, p.color, 'center', '#fff');
      });
    } else if (item.per) {
      game.players.forEach((p, j) => {
        const price = item.price(p);
        const px = x + CARD.w / 2 + (game.players.length > 1 ? (j ? 60 : -60) : 0);
        const label = price === null ? 'hast du' : `${price} Taler`;
        txt(`${p.id ? 'Grün' : 'Blau'}: ${label}`, px, y + 184, 16, price !== null && price > game.coins ? '#c0392b' : p.color, 'center', '#fff');
      });
    } else {
      const price = item.price();
      txt(price === null ? '—' : `${price} Taler`, x + CARD.w / 2, y + 184, 20, price !== null && price > game.coins ? '#c0392b' : '#8a5a2b', 'center', null);
    }
  });
  game.players.forEach((p) => {
    const { x, y } = cardPos(m.cur[p.id]);
    const inset = p.id === 1 ? 8 : -4;
    ctx.strokeStyle = p.color; ctx.lineWidth = 6;
    rr(x + inset, y + inset, CARD.w - inset * 2, CARD.h - inset * 2, 16 - inset / 2); ctx.stroke();
    txt(p.id ? 'Grün' : 'Blau', x + (p.id ? CARD.w - 34 : 34), y + (p.id ? 24 : 12), 16, '#fff', 'center', p.color);
  });
  txt(game.single
    ? 'Auswählen: Pfeiltasten / WASD  •  Kaufen: Leertaste / Enter  •  Wenn ihr fertig seid: „Weiter!" wählen'
    : 'Blau: WASD + Leertaste   •   Grün: Pfeiltasten + Enter   •   Fertig? Beide „Weiter!" wählen', W / 2, 684, 18, '#fff3c4', 'center', null);
  drawFloaters(true);
}
function drawShopIcon(id, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  if (id === 'sword') {
    ctx.save(); ctx.translate(-40, 34); ctx.scale(2, 2); drawSword(3, 0, 0, 0, false); ctx.restore();
    ctx.save(); ctx.translate(-8, 38); ctx.scale(2, 2); drawSword(4, 0, 0, 0, false); ctx.restore();
  } else if (id === 'shield') {
    ctx.save(); ctx.translate(-26, 0); ctx.scale(2.6, 2.6); drawShield(0, 0, 2, '#3a7bd5'); ctx.restore();
    ctx.save(); ctx.translate(30, 0); ctx.scale(2.6, 2.6); drawShield(0, 0, 3, '#3cb04a'); ctx.restore();
  } else if (id === 'horse') {
    ctx.save(); ctx.translate(-6, 44); ctx.scale(1.6, 1.6); drawHorse(0, false, '#8b5a2b', '#ffd23f'); ctx.restore();
  } else if (id === 'blocks') {
    ctx.save(); ctx.scale(0.9, 0.9);
    drawWall(-64, -30, null); drawWall(0, -30, null); drawWall(-32, -78, null);
    ctx.restore();
  } else if (id === 'catapult') {
    ctx.save(); ctx.scale(1.4, 1.4); drawCatapult(-32, -40, null); ctx.restore();
  } else if (id === 'crossbow') {
    ctx.save(); ctx.scale(1.4, 1.4); drawCrossbowTower(-32, -40, null); ctx.restore();
  } else if (id === 'heal') {
    ctx.save(); ctx.scale(0.9, 0.9); drawHeart(0, 0, '#ff4d6d'); ctx.restore();
    txt('+10', 0, -2, 24, '#fff', 'center', '#b0203a');
  } else if (id === 'go') {
    ctx.strokeStyle = '#5b3a1a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-30, 50); ctx.lineTo(-30, -50); ctx.stroke();
    ctx.fillStyle = '#3a7bd5'; ctx.fillRect(-28, -50, 60, 22);
    ctx.fillStyle = '#3cb04a'; ctx.fillRect(-28, -28, 60, 22);
    star(2, -28, 10, '#ffd23f');
  }
  ctx.restore();
}

function drawOverlay(title, sub, color) {
  ctx.fillStyle = 'rgba(43,29,18,0.7)';
  ctx.fillRect(0, 0, W, H);
  txt(title, W / 2, 280, 64, color);
  txt(sub, W / 2, 360, 28, '#fff');
  if (game.stateT > 1.2 && Math.floor(game.t * 2) % 2 === 0) txt('Drückt Leertaste oder Enter, um nochmal zu spielen', W / 2, 460, 24, '#fff3c4');
}

// ---------- Titelbild ----------
function drawTitle(t) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#7ec8f5'); sky.addColorStop(0.6, '#cdeefe'); sky.addColorStop(0.6, '#86c96a'); sky.addColorStop(1, '#6db552');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  // Wolken
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 380 + t * 18) % (W + 300)) - 150, cy = 60 + (i % 2) * 50;
    ell(cx, cy, 60, 22); ctx.fill(); ell(cx + 40, cy - 12, 40, 22); ctx.fill(); ell(cx - 40, cy + 4, 36, 16); ctx.fill();
  }
  // Burg
  const fakeGame = game;
  game = { t, state: 'title', bell: { swing: 0 } };
  ctx.save();
  ctx.translate(W / 2 - 128 * 0.9, 285);
  ctx.scale(0.9, 0.9);
  for (let i = -3; i <= 4; i++) { if (i === 0 || i === 1) continue; drawWall(i * 64, 64 + 32, null); }
  drawKeep({ c: 0, r: 0, w: 2, h: 2, hurt: 0 });
  ctx.restore();
  game = fakeGame;
  drawKnight(W / 2 - 320, 560, { tunic: '#3a7bd5', plume: '#ff5a5a', dir: 1, walk: t, moving: true, sword: 2, shield: 2, emblem: '#3a7bd5', scale: 1.6, swing: (t % 2) < 0.25 ? 0.25 - (t % 2) : 0 });
  if (titlePlayers === 2) drawKnight(W / 2 + 320, 560, { tunic: '#3cb04a', plume: '#ffe14d', dir: -1, walk: t, moving: true, sword: 3, shield: 3, emblem: '#3cb04a', scale: 1.6, horse: true, horseColor: '#e8e0d0' });

  txt('Ritterburg', W / 2, 120, 96, '#ffd23f', 'center', '#5b3a1a');
  txt('Baut eure Burg und verteidigt sie gegen die frechen Raubritter!', W / 2, 190, 26, '#fff', 'center', '#5b3a1a');

  drawKeyCard(40, 270, 'Ritter Blau', '#3a7bd5', ['W A S D', 'Leertaste', 'E'], ['laufen', 'Schwert', 'bauen']);
  if (titlePlayers === 2) drawKeyCard(W - 300, 270, 'Ritter Grün', '#3cb04a', ['Pfeiltasten', 'Enter', 'Shift rechts'], ['laufen', 'Schwert', 'bauen']);

  ctx.fillStyle = 'rgba(43,29,18,0.75)'; rr(W / 2 - 300, 582, 600, 130, 20); ctx.fill();
  txt('1 = ein Ritter      2 = zwei Ritter', W / 2, 606, 22, '#fff3c4', 'center', null);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  const sx = titlePlayers === 1 ? W / 2 - 172 : W / 2 + 4;
  rr(sx, 590, 170, 32, 10); ctx.fill();
  txt('L = unendlich Leben:', W / 2 + 40, 642, 22, '#fff3c4', 'right', null);
  ctx.fillStyle = titleInfinite ? '#3cb04a' : '#8a5a2b'; rr(W / 2 + 52, 628, 90, 28, 10); ctx.fill();
  txt(titleInfinite ? 'AN ∞' : 'AUS', W / 2 + 97, 642, 18, '#fff', 'center', null);
  if (Math.floor(t * 2) % 2 === 0) txt('Leertaste oder Enter = Los geht\'s!', W / 2, 684, 28, '#ffd23f');
  txt(muted ? 'M = Ton an' : 'M = Ton aus', W - 20, H - 16, 14, '#fff', 'right');
  txt('Tipp: Erst einmal ins Bild klicken, dann gehen die Tasten.', 20, H - 16, 14, '#fff', 'left');
}
function drawKeyCard(x, y, title, color, keysList, what) {
  ctx.fillStyle = 'rgba(255,248,225,0.92)'; rr(x, y, 260, 170, 16); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.stroke();
  txt(title, x + 130, y + 26, 24, color, 'center', '#fff');
  keysList.forEach((k, i) => {
    const yy = y + 66 + i * 36;
    ctx.font = `bold 17px ${FONT}`;
    const w = ctx.measureText(k).width + 20;
    ctx.fillStyle = '#fff'; rr(x + 16, yy - 14, w, 28, 6); ctx.fill();
    ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 2; ctx.stroke();
    txt(k, x + 16 + w / 2, yy, 17, '#2b1d12', 'center', null);
    txt(what[i], x + 244, yy, 18, '#5b3a1a', 'right', null);
  });
}

// ---------- Hauptschleife ----------
let last = performance.now();
let titleT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (justPressed.has('KeyM')) muted = !muted;

  if (mode === 'title') {
    titleT += dt;
    if (justPressed.has('Digit1') || justPressed.has('Numpad1')) { titlePlayers = 1; SFX.tick(); }
    if (justPressed.has('Digit2') || justPressed.has('Numpad2')) { titlePlayers = 2; SFX.tick(); }
    if (justPressed.has('KeyL') || justPressed.has('Digit3') || justPressed.has('Numpad3')) { titleInfinite = !titleInfinite; SFX.tick(); }
    if (justPressed.has('Space') || justPressed.has('Enter') || justPressed.has('NumpadEnter')) {
      newGame(titlePlayers, titleInfinite);
      game.single = titlePlayers === 1;
      mode = 'play';
      SFX.bell();
    }
    drawTitle(titleT);
  } else {
    if (justPressed.has('KeyP') || justPressed.has('Escape')) game.paused = !game.paused;
    if ((game.state === 'over' || game.state === 'win') && game.stateT > 1.2 &&
        (justPressed.has('Space') || justPressed.has('Enter') || justPressed.has('NumpadEnter'))) {
      mode = 'title';
      justPressed.clear();
      requestAnimationFrame(frame);
      return;
    }
    if (!game.paused) update(dt);
    ctx.clearRect(0, 0, W, H);
    drawWorld();
    drawHUD();
    drawHints();
    if (game.state === 'market') drawMarket();
    if (game.state === 'over') drawOverlay('Oh nein!', 'Die Raubritter haben die Burg erobert. Versucht es nochmal!', '#ff9a9a');
    if (game.state === 'win') { drawOverlay('Hurra! Gewonnen!', 'Ihr habt die Burg tapfer verteidigt!', '#ffd23f'); drawParticles(); }
    drawBanner();
    if (game.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
      txt('Pause', W / 2, H / 2 - 20, 72, '#fff');
      txt('Drücke P zum Weiterspielen', W / 2, H / 2 + 40, 26, '#fff3c4');
    }
  }
  justPressed.clear();
  requestAnimationFrame(frame);
}

makeBackground();
requestAnimationFrame(frame);

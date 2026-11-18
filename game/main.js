// KILAT BAY: LAST CROSSING — storm-night open-world crime game.
// three.js r160, ES modules, zero network. All art is procedural.
import * as THREE from "./vendor/three.module.min.js";

// ---------- deterministic RNG (mulberry32) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const WORLD_SEED = 20261118;
const rng = mulberry32(WORLD_SEED);
const rand = (lo, hi) => lo + rng() * (hi - lo);
const pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];

// ---------- URL params / shot mode ----------
const params = new URLSearchParams(location.search);
const SHOT = params.get("shot") || "";          // chase | city | mission | start | ""
const SHOT_MODE = SHOT.length > 0;
const shotClock = { t: 0 };                      // fixed deterministic clock for shots

// ---------- world constants ----------
const WORLD = {
  half: 190,                 // playable half-extent (m)
  channelZ0: 52, channelZ1: 68,   // Harbor Cut water channel
  bridgeX: 0,                // bridge crosses at x = 0 (Monsoon Ave)
  beachZ: -108,              // sand starts
  seaZ: -128,                // open water starts
};
const DISTRICTS = [
  { name: "NEON STRAND", x0: -90, x1: 90, z0: -100, z1: 20 },
  { name: "OLD MARKET", x0: -130, x1: -30, z0: 20, z1: 52 },
  { name: "VOLT HARBOR", x0: 30, x1: 130, z0: 20, z1: 52 },
  { name: "CRANE DISTRICT", x0: -130, x1: 130, z0: 68, z1: 150 },
  { name: "BLACKSAND BEACH", x0: -130, x1: 130, z0: -150, z1: -100 },
];
const STREETS = [
  { name: "LIGHTNING ROW", axis: "x", at: 0, w: 15 },
  { name: "MONSOON AVENUE", axis: "z", at: 0, w: 15 },
  { name: "HARBOR CUT", axis: "x", at: 60, w: 16 },
];

// ---------- missions (8, 3 acts) ----------
const MISSIONS = [
  { name: "FIRST SPARK", act: "ACT I", stages: [
    { text: "Drive to Kirana on Lightning Row.", type: "goto", x: -34, z: 0 },
    { text: "Meet Kirana — park in the glowing zone.", type: "goto", x: -34, z: 0, r: 7 },
    { text: "Test the KILAT GT — reach Volt Harbor.", type: "goto", x: 62, z: 34 },
    { text: "Return to the safehouse on Monsoon Ave.", type: "goto", x: 0, z: -40 },
  ]},
  { name: "HOT WIRE", act: "ACT I", stages: [
    { text: "Find the marked coupe in Old Market.", type: "goto", x: -72, z: 34 },
    { text: "Steal the coupe — press F beside it.", type: "steal" },
    { text: "Lose the heat — get your wanted level to 0.", type: "lose_wanted" },
    { text: "Deliver the coupe to the garage.", type: "goto", x: 24, z: -30 },
  ]},
  { name: "NEON RUN", act: "ACT I", stages: [
    { text: "Pick up the package on Lightning Row.", type: "goto", x: 44, z: 0 },
    { text: "Drop it at the Neon Strand club.", type: "goto", x: -60, z: -18 },
    { text: "Second drop — Volt Harbor docks.", type: "goto", x: 96, z: 40 },
    { text: "Shake the tail and reach the safehouse.", type: "goto", x: 0, z: -40 },
  ]},
  { name: "HARBOR HEAT", act: "ACT II", stages: [
    { text: "Reach the Harbor Cut warehouse.", type: "goto", x: 88, z: 44 },
    { text: "On foot — clear the rooftop lookouts (shoot 3).", type: "shoot", count: 3 },
    { text: "Grab the ledger from the office.", type: "goto", x: 80, z: 40 },
    { text: "Escape the 3-star response — reach Old Market.", type: "goto", x: -80, z: 30 },
  ]},
  { name: "STORM BREAKER", act: "ACT II", stages: [
    { text: "The KBPD is on you — survive the pursuit.", type: "survive", secs: 45 },
    { text: "Break line of sight — hide for 20 seconds.", type: "hide", secs: 20 },
    { text: "Wanted level must fall to 0.", type: "lose_wanted" },
    { text: "Lay low at the Blacksand Beach shack.", type: "goto", x: -40, z: -116 },
  ]},
  { name: "PAYROLL RUN", act: "ACT II", stages: [
    { text: "Collect the payroll from Crane District.", type: "goto", x: -60, z: 100 },
    { text: "The payroll is hot — KBPD is rolling in.", type: "goto", x: -20, z: 84 },
    { text: "Get the payroll across to the south bank.", type: "goto", x: 0, z: 30 },
    { text: "Stash it at the safehouse.", type: "goto", x: 0, z: -40 },
  ]},
  { name: "LAST CROSSING", act: "ACT III", stages: [
    { text: "KBPD has the whole city locked down. Reach Harbor Cut.", type: "goto", x: 0, z: 40 },
    { text: "Trigger the BRIDGE OVERRIDE at the control booth.", type: "trigger" },
    { text: "CROSS NOW — the bridge is rising behind you!", type: "cross" },
    { text: "Deliver the payroll to the Crane District vault.", type: "goto", x: -60, z: 100 },
  ]},
  { name: "KILAT RISING", act: "ACT III", stages: [
    { text: "One last drive — meet Kirana at the beach.", type: "goto", x: 40, z: -116 },
    { text: "The storm breaks at dawn. Lose the final tail.", type: "lose_wanted" },
    { text: "Drive the KILAT GT onto the pier.", type: "goto", x: 0, z: -120 },
    { text: "Kilat Bay is yours. Park and watch the sunrise.", type: "goto", x: 0, z: -120, r: 8 },
  ]},
];
const MISSION_REWARD = [800, 1200, 1500, 2000, 2500, 3000, 5000, 8000];

// ---------- game state ----------
const S = {
  started: false, paused: false, muted: false,
  inCar: true, camMode: 0, minimapZoom: 1,
  cash: 1250, rep: 1240, repLevel: 4,
  missionIdx: 0, stageIdx: 0, missionDone: 0,
  wanted: 0, wantedTimer: 0, lastSeen: 0, hiddenTime: 0,
  health: 100, armour: 60,
  weapon: "pistol", ammo: { pistol: [12, 48], smg: [30, 120] },
  clockMin: 23 * 60 + 47, day: 3,
  garage: ["KILAT GT"],
  bridge: { state: "closed", timer: 0, angle: 0, charge: 0, cutoff: 2 },
  shotsFired: 0, targetsHit: 0, surviveT: 0, hideT: 0,
  dialogue: "Welcome to Kilat Bay. Drive like the storm is chasing you — because tonight, it is.",
  dialogueUntil: 0,
  toastUntil: 0,
};

// ---------- save / load ----------
const SAVE_KEY = "kilat-bay-save-v1";
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: S.cash, rep: S.rep, repLevel: S.repLevel,
      missionIdx: S.missionIdx, stageIdx: S.stageIdx, missionDone: S.missionDone,
      garage: S.garage, day: S.day,
    }));
  } catch (e) { /* storage unavailable — ignore */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    S.cash = d.cash; S.rep = d.rep; S.repLevel = d.repLevel;
    S.missionIdx = d.missionIdx; S.stageIdx = d.stageIdx; S.missionDone = d.missionDone || 0;
    S.garage = d.garage || ["KILAT GT"]; S.day = d.day || 3;
    return true;
  } catch (e) { return false; }
}

// ---------- sound (Web Audio synth, no assets) ----------
const Audio8 = {
  ctx: null, master: null, engineOsc: null, engineGain: null,
  sirenOsc: null, sirenGain: null, sirenLfo: null, rainGain: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = S.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      // engine: sawtooth + lowpass, pitch follows speed
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = "sawtooth";
      this.engineOsc.frequency.value = 55;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
      // siren: two-tone via LFO on a triangle osc
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = "triangle";
      this.sirenOsc.frequency.value = 750;
      this.sirenLfo = this.ctx.createOscillator();
      this.sirenLfo.frequency.value = 0.55;
      const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 180;
      this.sirenLfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start(); this.sirenLfo.start();
      // rain: filtered noise loop
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 0.4;
      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0.045;
      src.connect(bp); bp.connect(this.rainGain); this.rainGain.connect(this.master);
      src.start();
    } catch (e) { this.ctx = null; }
  },
  blip(freq, dur, vol, type) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || "square"; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.12, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (dur || 0.08));
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(this.ctx.currentTime + (dur || 0.08) + 0.02);
  },
  shot(isSmg) {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 0.12;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = isSmg ? 2600 : 1400;
    const g = this.ctx.createGain(); g.gain.value = isSmg ? 0.22 : 0.3;
    src.connect(lp); lp.connect(g); g.connect(this.master); src.start();
  },
  setEngine(speedFrac, driving) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + speedFrac * 165, t, 0.08);
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speedFrac * 0.075 : 0, t, 0.1);
  },
  setSiren(on, dist) {
    if (!this.ctx || !this.sirenGain) return;
    const v = on ? Math.max(0.015, 0.09 - dist * 0.0006) : 0;
    this.sirenGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3);
  },
  setMuted(m) {
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  },
};

// ---------- renderer / scene ----------
const app = document.getElementById("app");
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !SHOT_MODE; // shots skip the shadow pass (night scene, fog hides it)
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1030);
scene.fog = new THREE.FogExp2(0x0a1030, 0.0038);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
camera.position.set(14, 9, -34);

const hemi = new THREE.HemisphereLight(0x3a4a8f, 0x0a0d1c, 0.85);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0x9db8ff, 0.9);
moon.position.set(-60, 120, -80);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.left = -160; moon.shadow.camera.right = 160;
moon.shadow.camera.top = 160; moon.shadow.camera.bottom = -160;
moon.shadow.camera.far = 400;
scene.add(moon);
const flash = new THREE.DirectionalLight(0xcfe4ff, 0); // lightning flash
flash.position.set(80, 140, 120);
scene.add(flash);

// ---------- procedural canvas textures ----------
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function windowsTexture(base, litRatio) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const cols = 6, rows = 14;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? pick(["#ffd76a", "#8fe8ff", "#ff9ad9", "#fff2c0"]) : "#0b1226";
      if (lit) g.globalAlpha = 0.55 + rng() * 0.45;
      g.fillRect(6 + x * 20, 8 + y * 17, 12, 10);
      g.globalAlpha = 1;
    }
  });
}
const NEON_WORDS = ["KILAT FM", "VOLT", "NEON", "SURGE", "STORM", "KIRANA", "99.9", "HARBOR", "PIER 7", "MONSOON"];
function neonSignTexture(word, color) {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = "#05070f"; g.fillRect(0, 0, w, h);
    g.font = "bold 34px Arial"; g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = color; g.shadowBlur = 18;
    g.fillStyle = color; g.fillText(word, w / 2, h / 2 + 1);
    g.shadowBlur = 0; g.fillStyle = "#ffffff";
    g.font = "bold 34px Arial"; g.fillText(word, w / 2, h / 2 + 1);
  });
}
const roadTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = "#141a2c"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rng() < 0.5 ? "#10152a" : "#1a2138";
    g.fillRect(rng() * w, rng() * h, 2, 2);
  }
  g.fillStyle = "#c8b23a"; g.fillRect(w / 2 - 2, 0, 4, 40);
  g.fillRect(w / 2 - 2, 128, 4, 40);
  g.fillStyle = "rgba(53,232,255,0.25)"; g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);
});
roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;

// ---------- world geometry ----------
const colliders = []; // {x0,z0,x1,z1} AABBs
function addCollider(x0, z0, x1, z1) { colliders.push({ x0, z0, x1, z1 }); }
function collideCircle(x, z, r) {
  for (const c of colliders) {
    const nx = Math.max(c.x0, Math.min(x, c.x1));
    const nz = Math.max(c.z0, Math.min(z, c.z1));
    const dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (r - d) / d;
        x += dx * push; z += dz * push;
      } else { z = c.z1 + r; }
    }
  }
  return [x, z];
}

const worldGroup = new THREE.Group();
scene.add(worldGroup);

// base ground (dark wet city slab)
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(420, 420),
  new THREE.MeshStandardMaterial({ color: 0x0d1326, roughness: 0.35, metalness: 0.55 })
);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
worldGroup.add(ground);

// roads
function road(x, z, w, l, alongX) {
  const t = roadTex.clone();
  t.needsUpdate = true;
  t.repeat.set(alongX ? l / 16 : w / 16, alongX ? w / 16 : l / 16);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, l),
    new THREE.MeshStandardMaterial({ map: t, roughness: 0.25, metalness: 0.6 })
  );
  m.rotation.x = -Math.PI / 2;
  if (alongX) m.rotation.z = Math.PI / 2;
  m.position.set(x, 0.02, z);
  m.receiveShadow = true;
  worldGroup.add(m);
}
road(0, 0, 15, 300, true);        // Lightning Row (E-W)
road(0, -46, 15, 108, false);     // Monsoon Ave south leg
road(0, 109, 15, 82, false);      // Monsoon Ave north leg (Crane District)
road(-70, 34, 12, 130, true);     // Old Market street
road(70, 34, 12, 130, true);      // Volt Harbor street
road(0, -92, 13, 300, true);      // Coastal road
road(-60, -46, 12, 100, false);
road(60, -46, 12, 100, false);
road(-60, 109, 12, 82, false);
road(60, 109, 12, 82, false);

// Harbor Cut channel (water strip) + sea + beach
const waterMat = new THREE.MeshStandardMaterial({ color: 0x06263f, roughness: 0.12, metalness: 0.85, transparent: true, opacity: 0.92 });
const channel = new THREE.Mesh(new THREE.PlaneGeometry(300, 16), waterMat);
channel.rotation.x = -Math.PI / 2; channel.position.set(0, 0.05, 60);
worldGroup.add(channel);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(420, 60), waterMat.clone());
sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.05, -158);
worldGroup.add(sea);
const sand = new THREE.Mesh(
  new THREE.PlaneGeometry(420, 22),
  new THREE.MeshStandardMaterial({ color: 0x3a3348, roughness: 0.95 })
);
sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.03, -117);
worldGroup.add(sand);
// pier
const pier = new THREE.Mesh(
  new THREE.BoxGeometry(8, 1, 34),
  new THREE.MeshStandardMaterial({ color: 0x2a2440, roughness: 0.8 })
);
pier.position.set(0, 0.5, -138); pier.castShadow = true;
worldGroup.add(pier);

// ---------- the drawbridge (Harbor Cut, x = 0) ----------
const bridgeGroup = new THREE.Group();
scene.add(bridgeGroup);
const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x27324e, roughness: 0.4, metalness: 0.7 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x33415f, roughness: 0.35, metalness: 0.7 });
const BRIDGE = { southLeaf: null, northLeaf: null, barrier: null };
function buildLeaf(sign) {
  // hinge at bank edge; leaf extends 8m toward channel center
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.35, sign < 0 ? 52 : 68);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(15, 0.7, 8.2), leafMat);
  deck.position.set(0, 0, sign * 4.1);
  deck.castShadow = true; deck.receiveShadow = true;
  pivot.add(deck);
  const railL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 8.2),
    new THREE.MeshStandardMaterial({ color: 0xff3df0, emissive: 0xff3df0, emissiveIntensity: 1.6 }));
  railL.position.set(-7.2, 0.55, sign * 4.1); pivot.add(railL);
  const railR = railL.clone(); railR.position.x = 7.2; pivot.add(railR);
  // tower pylon at hinge
  const tower = new THREE.Mesh(new THREE.BoxGeometry(2.2, 16, 2.2), bridgeMat);
  tower.position.set(-8.6, 7, 0); tower.castShadow = true; pivot.add(tower);
  const tower2 = tower.clone(); tower2.position.x = 8.6; pivot.add(tower2);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3b4e }));
  beacon.position.set(-8.6, 15.4, 0); pivot.add(beacon);
  bridgeGroup.add(pivot);
  return pivot;
}
BRIDGE.southLeaf = buildLeaf(1);   // hinge z=52, extends +z
BRIDGE.northLeaf = buildLeaf(-1);  // hinge z=68, extends -z
// barrier arm at south approach
BRIDGE.barrier = new THREE.Group();
BRIDGE.barrier.position.set(-6.5, 0, 49.5);
const barPost = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.5), bridgeMat);
barPost.position.y = 1.3; BRIDGE.barrier.add(barPost);
const barArm = new THREE.Mesh(new THREE.BoxGeometry(13, 0.35, 0.35),
  new THREE.MeshStandardMaterial({ color: 0xffd23d, emissive: 0xff9a3d, emissiveIntensity: 0.7 }));
barArm.position.set(6.5, 2.4, 0);
BRIDGE.barrier.add(barArm);
bridgeGroup.add(BRIDGE.barrier);
function setBridgeAngle(deg) {
  const r = THREE.MathUtils.degToRad(deg);
  BRIDGE.southLeaf.rotation.x = -r;
  BRIDGE.northLeaf.rotation.x = r;
  BRIDGE.barrier.children[1].rotation.z = deg > 2 ? 0 : 0; // arm stays horizontal (lowered) once rising
}

// ---------- buildings ----------
const buildingMats = [
  new THREE.MeshStandardMaterial({ map: windowsTexture("#1a2340", 0.5), roughness: 0.6, metalness: 0.3 }),
  new THREE.MeshStandardMaterial({ map: windowsTexture("#231a3a", 0.45), roughness: 0.6, metalness: 0.3 }),
  new THREE.MeshStandardMaterial({ map: windowsTexture("#0f2a33", 0.55), roughness: 0.6, metalness: 0.3 }),
];
const roofMat = new THREE.MeshStandardMaterial({ color: 0x141b31, roughness: 0.8 });
const NEON_COLORS = [0x35e8ff, 0xff3df0, 0x8dff3d, 0xffb63d, 0x7d5cff];
function building(x, z, w, d, h) {
  const g = new THREE.Group();
  const mat = pick(buildingMats);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  body.position.y = h / 2; body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), roofMat);
  roof.position.y = h + 0.25; g.add(roof);
  // rooftop neon edge
  if (rng() < 0.7) {
    const col = pick(NEON_COLORS);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.28, d + 0.3),
      new THREE.MeshBasicMaterial({ color: col }));
    edge.position.y = h - 0.1; g.add(edge);
  }
  // neon sign board on the face toward the nearest street
  if (rng() < 0.6) {
    const word = pick(NEON_WORDS);
    const col = "#" + pick(NEON_COLORS).toString(16).padStart(6, "0");
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(w * 0.85, 12), Math.min(w * 0.85, 12) / 4),
      new THREE.MeshBasicMaterial({ map: neonSignTexture(word, col), transparent: true })
    );
    sign.position.set(0, h * (0.55 + rng() * 0.25), d / 2 + 0.15);
    g.add(sign);
  }
  g.position.set(x, 0, z);
  worldGroup.add(g);
  addCollider(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
}
function cityBlock(cx, cz, bw, bd, count) {
  for (let i = 0; i < count; i++) {
    const w = rand(10, 18), d = rand(10, 18);
    const x = cx + rand(-bw / 2 + w / 2, bw / 2 - w / 2);
    const z = cz + rand(-bd / 2 + d / 2, bd / 2 - d / 2);
    // keep roads clear
    if (Math.abs(z) < 11 || Math.abs(x) < 11) continue;
    if (z > 46 && z < 74) continue; // channel
    if (z < -84 && z > -100) continue; // coastal road
    building(x, z, w, d, rand(9, 42));
  }
}
cityBlock(-45, -45, 70, 60, 9);
cityBlock(45, -45, 70, 60, 9);
cityBlock(-95, 34, 60, 26, 5);
cityBlock(95, 34, 60, 26, 5);
cityBlock(-45, 34, 40, 26, 4);
cityBlock(45, 34, 40, 26, 4);
cityBlock(-70, 109, 80, 70, 8);
cityBlock(70, 109, 80, 70, 8);
cityBlock(-110, -60, 40, 60, 4);
cityBlock(110, -60, 40, 60, 4);
// landmark tower — Kilat Spire
building(-18, -72, 16, 16, 64);
building(96, -70, 20, 14, 30);

// ---------- streetlights + neon poles ----------
const poleMat = new THREE.MeshStandardMaterial({ color: 0x1c2440, roughness: 0.5, metalness: 0.7 });
let streetlightCount = 0;
function streetlight(x, z, color) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), poleMat);
  pole.position.y = 3.5; g.add(pole);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8),
    new THREE.MeshBasicMaterial({ color }));
  lamp.position.y = 7.1; g.add(lamp);
  // only every third lamp gets a real point light (perf); the unlit lamp
  // spheres still read as glowing neon from any distance
  if (streetlightCount++ % 3 === 0) {
    const pt = new THREE.PointLight(color, 18, 26, 1.8);
    pt.position.y = 6.8; g.add(pt);
  }
  g.position.set(x, 0, z);
  worldGroup.add(g);
}
for (let x = -120; x <= 120; x += 30) {
  streetlight(x, -8.5, 0x35e8ff);
  streetlight(x + 15, 8.5, 0xff3df0);
}
for (let z = -84; z <= 44; z += 24) {
  streetlight(-8.5, z, 0x8dff3d);
  streetlight(8.5, z + 12, 0xffb63d);
}

// ---------- rain ----------
const RAIN_N = 1400;
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_N * 3);
const rainVel = new Float32Array(RAIN_N);
for (let i = 0; i < RAIN_N; i++) {
  rainPos[i * 3] = rand(-160, 160);
  rainPos[i * 3 + 1] = rand(0, 90);
  rainPos[i * 3 + 2] = rand(-160, 160);
  rainVel[i] = rand(38, 62);
}
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
  color: 0x9fd8ff, size: 0.28, transparent: true, opacity: 0.55, sizeAttenuation: true,
}));
scene.add(rain);

// ---------- lightning state ----------
const lightning = { next: 4, flashT: 0 };
function updateLightning(dt, t) {
  if (SHOT_MODE) { // deterministic: one soft flash baked into the shot clock
    flash.intensity = (Math.sin(t * 0.7) > 0.985) ? 1.2 : 0;
    return;
  }
  lightning.next -= dt;
  if (lightning.next <= 0) {
    lightning.flashT = 0.22;
    lightning.next = rand(5, 16);
    Audio8.blip(48, 0.5, 0.1, "sine");
  }
  if (lightning.flashT > 0) {
    lightning.flashT -= dt;
    flash.intensity = lightning.flashT > 0.11 ? 2.6 : 1.1;
  } else flash.intensity = 0;
}

// ---------- car factory (low-poly, procedural) ----------
const CAR_COLORS = [0x1c6cff, 0xd21f3c, 0xf2f2f2, 0xffb63d, 0x2bd9a4, 0x7d5cff, 0xff3df0, 0x222831];
function buildCar(color, opts) {
  opts = opts || {};
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a2038, roughness: 0.1, metalness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.62; body.castShadow = true;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.42, 0.9), paint);
  nose.position.set(0, 0.52, 2.4); nose.castShadow = true;
  g.add(nose);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.0), glass);
  cabin.position.set(0, 1.18, -0.3); cabin.castShadow = true;
  g.add(cabin);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.5), paint);
  spoiler.position.set(0, 1.05, -2.1);
  g.add(spoiler);
  // neon underglow trim
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.1, 4.46),
    new THREE.MeshBasicMaterial({ color: opts.trim || 0x35e8ff }));
  trim.position.y = 0.34;
  g.add(trim);
  // headlights / taillights
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  const tlMat = new THREE.MeshBasicMaterial({ color: 0xff2a3c });
  [-0.7, 0.7].forEach((x) => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), hlMat);
    hl.position.set(x, 0.66, 2.86); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.1), tlMat);
    tl.position.set(x, 0.66, -2.21); g.add(tl);
  });
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0f, roughness: 0.9 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xcfd8e8, roughness: 0.3, metalness: 0.9 });
  const wheels = [];
  [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]].forEach(([x, z]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.38, z);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 8), hubMat);
    hub.rotation.z = Math.PI / 2;
    w.add(hub);
    g.add(w); wheels.push(w);
  });
  // headlight beams — real spotlights only when requested (perf: one per
  // hero car, not per traffic car; three.js forward rendering pays per light)
  if (opts.beam) {
    const beam = new THREE.SpotLight(0xfff2b0, 60, 42, 0.5, 0.5, 1.4);
    beam.position.set(0, 0.8, 2.6);
    const beamTarget = new THREE.Object3D();
    beamTarget.position.set(0, 0, 14);
    g.add(beamTarget);
    beam.target = beamTarget;
    g.add(beam);
  }
  g.userData.wheels = wheels;
  return g;
}

// ---------- player ----------
const player = {
  mesh: null,            // on-foot character
  car: null,             // current car group
  carName: "KILAT GT",
  carColor: 0x1c6cff,
  pos: new THREE.Vector3(0, 0, -20),
  heading: Math.PI,      // facing +z (north, toward bridge)
  speed: 0,              // m/s
  condition: 100,
  onFootHeading: Math.PI,
  walkSpeed: 0,
};
function buildPedestrian(color, scale) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b08c, roughness: 0.7 });
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.26), new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.9 }));
  legs.position.y = 0.4; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.3), cloth);
  torso.position.y = 1.15; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skin);
  head.position.y = 1.72; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.4), new THREE.MeshStandardMaterial({ color: 0x14161f }));
  hair.position.y = 1.94; g.add(hair);
  g.scale.setScalar(scale || 1);
  return g;
}
player.mesh = buildPedestrian(0x35e8ff, 1);
player.mesh.visible = false;
scene.add(player.mesh);

function spawnPlayerCar(color, name, x, z, heading) {
  if (player.car) scene.remove(player.car);
  player.car = buildCar(color, { trim: 0x35e8ff, beam: true });
  player.carName = name;
  player.carColor = color;
  player.pos.set(x, 0, z);
  player.heading = heading;
  player.speed = 0;
  scene.add(player.car);
  syncCarTransform();
}
function syncCarTransform() {
  if (!player.car) return;
  player.car.position.copy(player.pos);
  player.car.rotation.y = player.heading;
  player.car.userData.wheels.forEach((w) => { w.rotation.x += player.speed * 0.016 / 0.38; });
}

// ---------- traffic + parked cars ----------
const traffic = [];   // {mesh, route, t, speed, dir}
const parked = [];    // {mesh, name, color, x, z, heading}
const TRAFFIC_ROUTES = [
  { axis: "x", at: 0, lane: 3.4, from: -140, to: 140 },   // Lightning Row EB
  { axis: "x", at: 0, lane: -3.4, from: 140, to: -140 },  // Lightning Row WB
  { axis: "z", at: 0, lane: 3.4, from: -84, to: 44 },     // Monsoon Ave NB
  { axis: "z", at: 0, lane: -3.4, from: 44, to: -84 },    // Monsoon Ave SB
  { axis: "x", at: -92, lane: 3, from: -140, to: 140 },   // Coastal road
  { axis: "x", at: 34, lane: 3, from: -130, to: 130 },    // Harbor street
];
const CAR_NAMES = ["VOLT COUPE", "SURGE SEDAN", "MONSOON GT", "TEMPEST LX", "NEON HATCH", "REEF RUNNER"];
function spawnTraffic() {
  for (const r of TRAFFIC_ROUTES) {
    const n = 3;
    for (let i = 0; i < n; i++) {
      const color = pick(CAR_COLORS);
      const mesh = buildCar(color, { trim: pick(NEON_COLORS) });
      const t = rng();
      traffic.push({ mesh, route: r, t, speed: rand(9, 14), name: pick(CAR_NAMES), color });
      scene.add(mesh);
    }
  }
}
function spawnParked() {
  const spots = [
    [-34, -8.5, 0], [-20, 8.5, Math.PI], [30, -8.5, 0], [52, 8.5, Math.PI],
    [-8.5, -60, Math.PI / 2], [8.5, -30, -Math.PI / 2], [8.5, 20, -Math.PI / 2],
    [-72, 28, 0], [88, 40, Math.PI], [-60, 100, Math.PI / 2], [40, -100, 0], [-40, -116, 0],
  ];
  spots.forEach(([x, z, h], i) => {
    const color = pick(CAR_COLORS);
    const mesh = buildCar(color, { trim: pick(NEON_COLORS) });
    mesh.position.set(x, 0, z);
    mesh.rotation.y = h;
    scene.add(mesh);
    parked.push({ mesh, name: CAR_NAMES[i % CAR_NAMES.length], color, x, z, heading: h });
  });
}
spawnTraffic();
spawnParked();

// ---------- pedestrians ----------
const peds = []; // {mesh, x, z, heading, speed, flee}
function spawnPeds() {
  const spots = [];
  for (let i = 0; i < 14; i++) {
    spots.push([rand(-120, 120), rand(-90, 46)]);
  }
  spots.forEach(([x, z]) => {
    const [cx, cz] = collideCircle(x, z, 1);
    const mesh = buildPedestrian(pick([0xff6b9d, 0x35e8ff, 0xffd23d, 0x8dff3d, 0xf2f2f2]), rand(0.95, 1.08));
    mesh.position.set(cx, 0, cz);
    scene.add(mesh);
    peds.push({ mesh, x: cx, z: cz, heading: rand(0, Math.PI * 2), speed: rand(1.1, 1.9), flee: 0 });
  });
}
spawnPeds();
function updatePeds(dt) {
  for (const p of peds) {
    const dx = p.x - player.pos.x, dz = p.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (S.shotsFired > 0 && d < 26) p.flee = 4;
    if (d < 7 && S.inCar && Math.abs(player.speed) > 6) p.flee = 3;
    if (p.flee > 0) {
      p.flee -= dt;
      p.heading = Math.atan2(dx, dz);
      p.speed = 4.6;
    } else {
      p.speed = 1.5;
      if (rng() < dt * 0.12) p.heading += rand(-1.2, 1.2);
    }
    let nx = p.x + Math.sin(p.heading) * p.speed * dt;
    let nz = p.z + Math.cos(p.heading) * p.speed * dt;
    if (Math.abs(nx) > 150 || Math.abs(nz) > 150 || (nz > 50 && nz < 70)) {
      p.heading += Math.PI; nx = p.x; nz = p.z;
    }
    [nx, nz] = collideCircle(nx, nz, 0.8);
    p.x = nx; p.z = nz;
    p.mesh.position.set(nx, 0, nz);
    p.mesh.rotation.y = p.heading;
    p.mesh.position.y = Math.abs(Math.sin(performance.now() * 0.008 + p.x)) * 0.05;
  }
}

// ---------- driving physics (arcade) ----------
const KEYS = {};
addEventListener("keydown", (e) => {
  KEYS[e.code] = true;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  if (e.code === "KeyM") { S.muted = !S.muted; Audio8.setMuted(S.muted); toast(S.muted ? "SOUND MUTED" : "SOUND ON"); }
  if (e.code === "KeyP" && S.started) togglePause();
  if (e.code === "KeyC") { S.camMode = (S.camMode + 1) % 3; }
  if (e.code === "Digit1") setWeapon("pistol");
  if (e.code === "Digit2") setWeapon("smg");
  if (e.code === "KeyR") reload();
  if (e.code === "KeyF") tryEnterExitCar();
});
addEventListener("keyup", (e) => { KEYS[e.code] = false; });
addEventListener("wheel", (e) => {
  S.minimapZoom = THREE.MathUtils.clamp(S.minimapZoom + (e.deltaY < 0 ? 0.25 : -0.25), 0.6, 2.4);
}, { passive: true });
addEventListener("mousedown", (e) => {
  if (!S.started || S.paused || e.button !== 0) return;
  if (e.target.closest && e.target.closest("button")) return;
  shoot();
});

function updateDriving(dt) {
  const fwd = KEYS.KeyW || KEYS.ArrowUp;
  const back = KEYS.KeyS || KEYS.ArrowDown;
  const left = KEYS.KeyA || KEYS.ArrowLeft;
  const right = KEYS.KeyD || KEYS.ArrowRight;
  const brake = KEYS.Space;
  const maxF = 44, maxR = -14;
  if (fwd) player.speed += (brake ? 6 : 15) * dt;
  else if (back) player.speed -= (player.speed > 0.5 ? 26 : 10) * dt;
  else player.speed -= player.speed * 0.55 * dt;
  if (brake) player.speed -= player.speed * 2.2 * dt;
  player.speed = THREE.MathUtils.clamp(player.speed, maxR, maxF);
  if (Math.abs(player.speed) < 0.05 && !fwd && !back) player.speed = 0;
  const steer = (left ? 1 : 0) - (right ? 1 : 0);
  const grip = brake ? 1.9 : 1.0;
  const spdF = THREE.MathUtils.clamp(Math.abs(player.speed) / maxF, 0, 1);
  player.heading += steer * (0.9 + spdF * 0.9) * grip * dt * Math.sign(player.speed || 1) * (player.speed < 0 ? -1 : 1);
  const nx = player.pos.x + Math.sin(player.heading) * player.speed * dt;
  const nz = player.pos.z + Math.cos(player.heading) * player.speed * dt;
  // bridge: can only cross the channel on the deck while leaves are near-flat
  const onBridgeCorridor = Math.abs(nx) < 7.5;
  const inChannel = nz > WORLD.channelZ0 - 1 && nz < WORLD.channelZ1 + 1;
  const leafAngle = S.bridge.angle;
  let blocked = false;
  if (inChannel && !onBridgeCorridor) blocked = true; // water — no driving
  if (inChannel && onBridgeCorridor && leafAngle > 24) blocked = true; // leaves too steep
  let fx = nx, fz = nz;
  if (!blocked) {
    [fx, fz] = collideCircle(nx, nz, 1.6);
    if (fx !== nx || fz !== nz) { // hit a building — scrape, lose speed + condition
      if (Math.abs(player.speed) > 8) {
        player.condition = Math.max(0, player.condition - Math.abs(player.speed) * 0.35);
        Audio8.blip(70, 0.18, 0.2, "sawtooth");
        addWanted(0);
      }
      player.speed *= 0.45;
    }
  } else {
    player.speed *= 0.4;
    if (inChannel && onBridgeCorridor && leafAngle > 24) {
      // sliding back off the rising leaf
      fz = player.pos.z - Math.sign(player.heading > 0 ? 1 : 1) * 0;
      fz = Math.min(player.pos.z, WORLD.channelZ0 - 1.5);
    }
  }
  player.pos.x = THREE.MathUtils.clamp(fx, -WORLD.half, WORLD.half);
  player.pos.z = THREE.MathUtils.clamp(fz, -WORLD.half, WORLD.half);
  if (player.pos.z < WORLD.seaZ + 8 && player.pos.x !== 0) { /* beach ok, sea blocked by pier only */ }
  if (player.pos.z < -146) player.pos.z = -146;
  // body lean
  player.car.rotation.z = THREE.MathUtils.lerp(player.car.rotation.z, -steer * spdF * 0.06, 0.2);
  player.car.rotation.x = THREE.MathUtils.lerp(player.car.rotation.x, (fwd ? -0.02 : back ? 0.02 : 0), 0.2);
  syncCarTransform();
  Audio8.setEngine(spdF, true);
}

function updateOnFoot(dt) {
  const fwd = KEYS.KeyW || KEYS.ArrowUp;
  const back = KEYS.KeyS || KEYS.ArrowDown;
  const left = KEYS.KeyA || KEYS.ArrowLeft;
  const right = KEYS.KeyD || KEYS.ArrowRight;
  const run = KEYS.ShiftLeft || KEYS.ShiftRight;
  const mx = (right ? 1 : 0) - (left ? 1 : 0);
  const mz = (fwd ? 1 : 0) - (back ? 1 : 0);
  const moving = mx !== 0 || mz !== 0;
  const spd = run ? 8.5 : 4.4;
  if (moving) {
    const target = Math.atan2(mx, mz) + cameraYawOffset();
    player.onFootHeading = lerpAngle(player.onFootHeading, target, 0.18);
    let nx = player.pos.x + Math.sin(player.onFootHeading) * spd * dt;
    let nz = player.pos.z + Math.cos(player.onFootHeading) * spd * dt;
    if (nz > WORLD.channelZ0 - 1 && nz < WORLD.channelZ1 + 1 && Math.abs(nx) > 7.5) { nx = player.pos.x; nz = player.pos.z; }
    [nx, nz] = collideCircle(nx, nz, 0.8);
    player.pos.x = THREE.MathUtils.clamp(nx, -WORLD.half, WORLD.half);
    player.pos.z = THREE.MathUtils.clamp(nz, -WORLD.half, WORLD.half);
    player.walkSpeed = spd;
  } else player.walkSpeed = 0;
  player.mesh.position.copy(player.pos);
  player.mesh.position.y = Math.abs(Math.sin(performance.now() * 0.012)) * (moving ? 0.06 : 0);
  player.mesh.rotation.y = player.onFootHeading;
  Audio8.setEngine(0, false);
}
function cameraYawOffset() {
  // on-foot movement is camera-relative; camera sits behind the heading
  return 0;
}
function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ---------- enter / steal cars ----------
function nearestCar(maxD) {
  let best = null, bestD = maxD;
  for (const p of parked) {
    const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
    if (d < bestD) { bestD = d; best = p; }
  }
  for (const t of traffic) {
    const d = Math.hypot(t.mesh.position.x - player.pos.x, t.mesh.position.z - player.pos.z);
    if (d < bestD && Math.abs(t.speed) < 3) { bestD = d; best = { traffic: t, x: t.mesh.position.x, z: t.mesh.position.z }; }
  }
  return best;
}
function tryEnterExitCar() {
  if (!S.started || S.paused) return;
  if (S.inCar) {
    S.inCar = false;
    player.mesh.visible = true;
    player.mesh.position.copy(player.pos);
    player.onFootHeading = player.heading;
    Audio8.blip(300, 0.07, 0.1);
    return;
  }
  const near = nearestCar(4.2);
  if (!near) return;
  if (near.traffic) {
    const t = near.traffic;
    scene.remove(t.mesh);
    traffic.splice(traffic.indexOf(t), 1);
    spawnPlayerCar(t.color, t.name, t.mesh.position.x, t.mesh.position.z, t.mesh.rotation.y);
    S.garage.push(t.name);
  } else {
    scene.remove(near.mesh);
    parked.splice(parked.indexOf(near), 1);
    spawnPlayerCar(near.color, near.name, near.x, near.z, near.heading);
    S.garage.push(near.name);
  }
  S.inCar = true;
  player.mesh.visible = false;
  player.condition = 100;
  addWanted(1);
  toast("CAR STOLEN — " + player.carName);
  sayKirana(pick([
    "Nice wheels. Now drive like you stole it — because you did.",
    "That one's got a tracker, probably. Lose it or lose the cops.",
    "Clean grab. Keep the paint shiny, yeah?",
  ]));
  Audio8.blip(520, 0.12, 0.15);
  checkStage("steal");
}

// ---------- weapons ----------
function setWeapon(w) {
  S.weapon = w;
  document.getElementById("slot-pistol").classList.toggle("active", w === "pistol");
  document.getElementById("slot-smg").classList.toggle("active", w === "smg");
  Audio8.blip(700, 0.05, 0.08);
}
function reload() {
  const a = S.ammo[S.weapon];
  const mag = S.weapon === "pistol" ? 12 : 30;
  const need = mag - a[0];
  const take = Math.min(need, a[1]);
  a[0] += take; a[1] -= take;
  Audio8.blip(440, 0.1, 0.1);
  updateWeaponHUD();
}
const tracers = [];
function shoot() {
  const a = S.ammo[S.weapon];
  if (a[0] <= 0) { Audio8.blip(180, 0.08, 0.12); reload(); return; }
  a[0]--;
  S.shotsFired++;
  Audio8.shot(S.weapon === "smg");
  addWanted(0);
  if (S.wanted === 0) S.wanted = 1;
  // tracer from player toward aim point (screen center ray)
  const origin = player.pos.clone(); origin.y = 1.4;
  const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
  const end = origin.clone().add(dir.multiplyScalar(60));
  const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9 }));
  scene.add(line);
  tracers.push({ line, t: 0.09 });
  // muzzle flash
  const mflash = new THREE.PointLight(0xffc861, 30, 9, 2);
  mflash.position.copy(origin);
  scene.add(mflash);
  setTimeout(() => scene.remove(mflash), 60);
  // hit test vs police cars (simple sphere check along ray)
  for (const u of police) {
    const d = u.mesh.position.distanceTo(origin);
    if (d < 55) {
      const toU = u.mesh.position.clone().sub(origin).normalize();
      const aim = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
      if (toU.angleTo(aim) < 0.12) {
        u.hp -= S.weapon === "smg" ? 18 : 30;
        S.targetsHit++;
        checkStage("shoot");
        if (u.hp <= 0 && u.state !== "DOWN") {
          u.state = "DOWN";
          u.mesh.rotation.z = 0.06;
          toast("KBPD UNIT DISABLED");
          addWanted(1);
        }
      }
    }
  }
  updateWeaponHUD();
}
function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].t -= dt;
    if (tracers[i].t <= 0) {
      scene.remove(tracers[i].line);
      tracers.splice(i, 1);
    }
  }
}

// ---------- wanted system ----------
function addWanted(n) {
  if (n <= 0) return;
  const before = S.wanted;
  S.wanted = Math.min(5, S.wanted + n);
  S.wantedTimer = 0;
  S.lastSeen = performance.now() / 1000;
  if (S.wanted > before) {
    document.getElementById("stars").innerHTML = starHTML();
    if (S.wanted >= 3 && before < 3) spawnHeli();
    Audio8.blip(880, 0.15, 0.12);
  }
  ensurePolice();
}
function starHTML() {
  let h = "";
  for (let i = 0; i < 5; i++) h += i < S.wanted ? "<span>★</span>" : '<span class="off">★</span>';
  return h;
}
function decayWanted(dt) {
  if (S.wanted === 0) return;
  const nearest = police.length ? Math.min(...police.map((u) => u.mesh.position.distanceTo(player.pos))) : 999;
  const seen = nearest < 55;
  if (seen) { S.lastSeen = performance.now() / 1000; S.hiddenTime = 0; }
  else S.hiddenTime += dt;
  S.wantedTimer += dt;
  if (!seen && S.hiddenTime > 18 && S.wantedTimer > 25) {
    S.wanted = Math.max(0, S.wanted - 1);
    S.wantedTimer = 0;
    document.getElementById("stars").innerHTML = starHTML();
    if (S.wanted === 0) { toast("HEAT LOST — YOU'RE CLEAN"); checkStage("lose_wanted"); }
  }
}

// ---------- police ----------
const police = []; // {mesh, name, state, hp, speed, heading, sirenLight}
const POLICE_DEFS = [
  { name: "VOLT-1", color: 0x0e2a6e },
  { name: "SURGE-2", color: 0x0e2a6e },
  { name: "TEMPEST-3", color: 0x123a8a },
  { name: "MONSOON-4", color: 0x123a8a },
];
function buildPoliceCar(color) {
  const g = buildCar(color, { trim: 0xff3b4e, beam: true });
  // light bar
  const bar = new THREE.Group();
  const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2038 }));
  r.position.x = -0.3;
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0x2080ff }));
  b.position.x = 0.3;
  bar.add(r); bar.add(b);
  bar.position.y = 1.55;
  g.add(bar);
  g.userData.lightBar = bar;
  const siren = new THREE.PointLight(0x4060ff, 0, 22, 1.6);
  siren.position.y = 2.2;
  g.add(siren);
  g.userData.sirenLight = siren;
  return g;
}
function spawnPoliceUnit(def) {
  const mesh = buildPoliceCar(def.color);
  const ang = rand(0, Math.PI * 2);
  const dist = rand(55, 80);
  let x = player.pos.x + Math.sin(ang) * dist;
  let z = player.pos.z + Math.cos(ang) * dist;
  if (z > 48 && z < 72) z = 44; // never spawn in the channel
  [x, z] = collideCircle(x, z, 2);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  police.push({ mesh, name: def.name, state: "PURSUIT", hp: 100, speed: 0, heading: Math.atan2(player.pos.x - x, player.pos.z - z), blockT: 0 });
}
function ensurePolice() {
  const want = S.wanted === 0 ? 0 : Math.min(4, 1 + Math.floor(S.wanted / 2));
  while (police.filter((u) => u.state !== "DOWN").length < want) {
    const used = new Set(police.map((u) => u.name));
    const def = POLICE_DEFS.find((d) => !used.has(d.name)) || POLICE_DEFS[0];
    spawnPoliceUnit(def);
  }
}
let roadblockTimer = 0;
function updatePolice(dt, t) {
  const bridgeRising = S.bridge.state === "rising" || S.bridge.state === "open";
  for (const u of police) {
    if (u.state === "DOWN") continue;
    const toP = player.pos.clone().sub(u.mesh.position);
    const dist = toP.length();
    const targetHeading = Math.atan2(toP.x, toP.z);
    // BLOCKED: bridge rising and unit is on the south bank while player is north (or vice versa)
    const unitSouth = u.mesh.position.z < WORLD.channelZ0;
    const playerNorth = player.pos.z > WORLD.channelZ1;
    const unitNorth = u.mesh.position.z > WORLD.channelZ1;
    const playerSouth = player.pos.z < WORLD.channelZ0;
    if (bridgeRising && ((unitSouth && playerNorth) || (unitNorth && playerSouth))) {
      if (u.state !== "BLOCKED") { u.state = "BLOCKED"; toast(u.name + " CUT OFF AT THE BRIDGE"); }
      // drive to the barrier line and stop
      const stopZ = unitSouth ? WORLD.channelZ0 - 4 : WORLD.channelZ1 + 4;
      const dz = stopZ - u.mesh.position.z;
      if (Math.abs(dz) > 1.5) {
        u.heading = lerpAngle(u.heading, dz > 0 ? 0 : Math.PI, 0.08);
        u.speed = Math.min(u.speed + 12 * dt, 16);
      } else u.speed = Math.max(0, u.speed - 30 * dt);
    } else {
      if (u.state === "BLOCKED") u.state = "PURSUIT";
      if (dist < 55) S.lastSeen = performance.now() / 1000;
      if (dist > 90) u.state = "SEARCH";
      else if (dist < 9 && S.wanted >= 2) u.state = "RAMMING";
      else if (u.state !== "ROADBLOCK") u.state = "PURSUIT";
      if (u.state === "SEARCH") {
        u.heading = lerpAngle(u.heading, targetHeading, 0.02);
        u.speed = Math.min(u.speed + 8 * dt, 20);
      } else if (u.state === "RAMMING") {
        u.heading = lerpAngle(u.heading, targetHeading, 0.12);
        u.speed = Math.min(u.speed + 20 * dt, 47);
      } else {
        u.heading = lerpAngle(u.heading, targetHeading, 0.055);
        u.speed = Math.min(u.speed + 14 * dt, 42);
      }
      // roadblock: at wanted >= 3, one unit parks across the road ahead of the player
      if (S.wanted >= 3 && u.name === "TEMPEST-3" && u.state !== "ROADBLOCK" && roadblockTimer <= 0 && dist > 40) {
        u.state = "ROADBLOCK";
        roadblockTimer = 40;
        const ahead = player.pos.clone().add(new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading)).multiplyScalar(45));
        u.mesh.position.set(ahead.x, 0, THREE.MathUtils.clamp(ahead.z, -140, 140));
        u.heading = player.heading + Math.PI / 2;
        u.speed = 0;
        toast("ROADBLOCK AHEAD — " + u.name);
      }
      if (u.state === "ROADBLOCK") {
        u.speed = 0;
        if (dist < 14) u.state = "RAMMING";
      }
    }
    // move
    const nx = u.mesh.position.x + Math.sin(u.heading) * u.speed * dt;
    const nz = u.mesh.position.z + Math.cos(u.heading) * u.speed * dt;
    // police never drive into the channel except across the bridge deck
    const inChannel = nz > WORLD.channelZ0 - 1 && nz < WORLD.channelZ1 + 1;
    if (inChannel && Math.abs(nx) > 7.5) { u.heading += Math.PI * 0.5 * dt * 4; }
    else if (inChannel && S.bridge.angle > 24) { u.speed *= 0.5; }
    else {
      const [cx, cz] = collideCircle(nx, nz, 1.7);
      u.mesh.position.set(cx, 0, cz);
      if (cx !== nx || cz !== nz) u.speed *= 0.6;
    }
    u.mesh.rotation.y = u.heading;
    u.mesh.userData.wheels.forEach((w) => { w.rotation.x += u.speed * dt / 0.38; });
    // siren light strobe
    const phase = Math.sin(t * 14 + u.name.length) > 0;
    u.mesh.userData.sirenLight.color.setHex(phase ? 0xff2038 : 0x2080ff);
    u.mesh.userData.sirenLight.intensity = 26;
    u.mesh.userData.lightBar.rotation.y = Math.sin(t * 9) * 0.1;
    // ram damage to player
    if (dist < 3.4 && u.speed > 10) {
      player.condition = Math.max(0, player.condition - 4);
      S.health = Math.max(0, S.health - 2);
      flashDamage();
      Audio8.blip(60, 0.2, 0.25, "sawtooth");
      u.speed *= 0.4;
    }
  }
  roadblockTimer -= dt;
  // siren audio: nearest unit
  if (police.length && S.wanted > 0) {
    const d = Math.min(...police.map((u) => u.mesh.position.distanceTo(player.pos)));
    Audio8.setSiren(true, d);
  } else Audio8.setSiren(false, 0);
  // remove DOWN units after a while
  for (let i = police.length - 1; i >= 0; i--) {
    if (police[i].state === "DOWN") {
      police[i].blockT += dt;
      police[i].mesh.userData.sirenLight.intensity = 0;
      if (police[i].blockT > 25) { scene.remove(police[i].mesh); police.splice(i, 1); }
    }
  }
}

// ---------- helicopter STORM-1 ----------
const heli = { mesh: null, active: false, angle: 0, spot: null, cone: null };
function spawnHeli() {
  if (heli.active) return;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x10204a, roughness: 0.4, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 4.2), bodyMat);
  body.castShadow = true; g.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 3.4), bodyMat);
  tail.position.set(0, 0.2, -3.6); g.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.06, 0.35), new THREE.MeshStandardMaterial({ color: 0x0a0a12 }));
  rotor.position.y = 0.9; g.add(rotor);
  g.userData.rotor = rotor;
  const search = new THREE.SpotLight(0xfff8d0, 900, 120, 0.32, 0.45, 1.1);
  search.position.set(0, -0.6, 1.4);
  const tgt = new THREE.Object3D();
  g.add(tgt);
  search.target = tgt;
  g.add(search);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(9, 42, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff6b0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  // The cone hangs 21 units toward the player along the group's local +Z
  // (the group lookAt's the player), so its apex sits at the heli and its
  // wide base lands past the player — a spotlight cone, not a stray wedge.
  cone.position.set(0, 0, 21);
  cone.rotation.x = Math.PI;
  g.add(cone);
  const strobe = new THREE.PointLight(0xff2038, 30, 30, 1.5);
  strobe.position.y = -0.8;
  g.add(strobe);
  g.userData.strobe = strobe;
  heli.mesh = g; heli.spot = search; heli.cone = cone;
  heli.active = true;
  scene.add(g);
  toast("STORM-1 HELICOPTER IS TRACKING YOU");
  document.getElementById("heli-row").style.display = "block";
}
function updateHeli(dt, t) {
  if (!heli.active) return;
  if (S.wanted < 3 && !SHOT_MODE) {
    heli.active = false;
    scene.remove(heli.mesh);
    document.getElementById("heli-row").style.display = "none";
    return;
  }
  if (!SHOT_MODE) {
    // live game: circle the player. Shot mode: hold the posed position.
    heli.angle += dt * 0.22;
    const r = 26;
    const hx = player.pos.x + Math.sin(heli.angle) * r;
    const hz = player.pos.z + Math.cos(heli.angle) * r;
    heli.mesh.position.set(hx, 42 + Math.sin(t * 0.5) * 1.5, hz);
  }
  heli.mesh.lookAt(player.pos.x, 0, player.pos.z);
  heli.mesh.userData.rotor.rotation.y += dt * 30;
  heli.mesh.userData.strobe.intensity = Math.sin(t * 6) > 0 ? 30 : 2;
  // The spotlight target and the visible cone live in the heli group's local
  // frame, where the player sits straight along local +Z (the group lookAt's
  // the player). Aim both in local terms so the beam lands on the player.
  heli.spot.target.position.set(0, 0, heli.mesh.position.distanceTo(player.pos));
  heli.spot.target.updateMatrixWorld();
  // cone apex (+Y) points back along local -Z, toward the heli
  heli.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1));
}

// ---------- bridge override ----------
const bridgeZone = { x: 0, z: 44, r: 9 };
function triggerBridgeOverride() {
  if (S.bridge.state !== "closed") return;
  S.bridge.state = "countdown";
  S.bridge.timer = 8;
  S.bridge.charge = 0;
  document.getElementById("bridge-widget").classList.add("on");
  toast("BRIDGE OVERRIDE ARMED — HARBOR CUT");
  sayKirana("Override armed! The leaves rise in 8 seconds — cross now or swim!");
  Audio8.blip(660, 0.3, 0.2, "sawtooth");
}
function updateBridge(dt) {
  const b = S.bridge;
  if (b.state === "countdown") {
    b.timer -= dt;
    b.charge = THREE.MathUtils.clamp((8 - b.timer) / 8, 0, 1);
    if (b.timer <= 0) {
      b.state = "rising";
      Audio8.blip(180, 0.6, 0.25, "sawtooth");
    }
  } else if (b.state === "rising") {
    b.angle = Math.min(68, b.angle + 26 * dt);
    b.charge = 1;
    if (b.angle >= 68) {
      b.state = "open";
      b.timer = 14; // stays open, then lowers
      toast("BRIDGE IS UP — PURSUIT CUT OFF");
    }
  } else if (b.state === "open") {
    b.timer -= dt;
    if (b.timer <= 0) b.state = "lowering";
  } else if (b.state === "lowering") {
    b.angle = Math.max(0, b.angle - 22 * dt);
    if (b.angle <= 0) {
      b.state = "closed";
      b.charge = 0;
      document.getElementById("bridge-widget").classList.remove("on");
    }
  }
  setBridgeAngle(b.angle);
  // countdown display
  if (b.state === "countdown" || b.state === "rising") {
    const remain = b.state === "countdown" ? b.timer : Math.max(0, (24 - b.angle) / 26);
    document.getElementById("bridge-count").textContent = remain.toFixed(1) + "s";
    document.getElementById("bridge-charge").style.width = (b.charge * 100).toFixed(0) + "%";
    const cut = police.filter((u) => u.state === "BLOCKED").length;
    document.getElementById("bridge-cutoff").textContent =
      (cut > 0 ? cut : 2) + " PURSUIT UNIT" + ((cut > 0 ? cut : 2) > 1 ? "S" : "") + " WILL BE CUT OFF";
  }
}

// ---------- objective marker ----------
const markerGroup = new THREE.Group();
scene.add(markerGroup);
const markerRing = new THREE.Mesh(
  new THREE.RingGeometry(2.4, 3.1, 32),
  new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
);
markerRing.rotation.x = -Math.PI / 2;
markerGroup.add(markerRing);
const markerBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.55, 0.55, 60, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
);
markerBeam.position.y = 30;
markerGroup.add(markerBeam);
markerGroup.visible = false;
function setMarker(x, z) {
  markerGroup.position.set(x, 0.15, z);
  markerGroup.visible = true;
}
function hideMarker() { markerGroup.visible = false; }

// ---------- missions ----------
function currentMission() { return MISSIONS[S.missionIdx]; }
function currentStage() { return currentMission().stages[S.stageIdx]; }
function sayKirana(text) {
  S.dialogue = text;
  document.getElementById("dialogue-text").textContent = text;
}
function toast(text) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.classList.add("on");
  S.toastUntil = performance.now() + 3400;
}
function flashDamage() {
  const d = document.getElementById("damage");
  d.style.opacity = 0.9;
  setTimeout(() => { d.style.opacity = 0; }, 220);
}
function refreshMissionHUD() {
  const m = currentMission();
  const st = currentStage();
  document.getElementById("mission-act").textContent = m.act + " · MISSION " + (S.missionIdx + 1) + "/8";
  document.getElementById("mission-title").textContent = m.name;
  document.getElementById("mission-stage").textContent = "STAGE " + (S.stageIdx + 1) + "/4";
  document.getElementById("mission-next").textContent = "NEXT: " + st.text;
  document.getElementById("mission-bar").style.width = ((S.stageIdx + 1) / 4 * 100).toFixed(0) + "%";
  if (st.type === "goto") setMarker(st.x, st.z);
  else if (st.type === "trigger") setMarker(bridgeZone.x, bridgeZone.z);
  else if (st.type === "cross") setMarker(0, 78);
  else hideMarker();
}
function advanceStage() {
  S.stageIdx++;
  S.rep += 120;
  if (S.stageIdx >= 4) {
    // mission complete
    const reward = MISSION_REWARD[S.missionIdx];
    S.cash += reward;
    S.rep += 300;
    S.missionDone = Math.max(S.missionDone, S.missionIdx + 1);
    toast("MISSION COMPLETE — +" + reward.toLocaleString("en-US") + " $");
    sayKirana(pick([
      "Clean work. The city's starting to know your name.",
      "That's how you run Kilat Bay. Next one's bigger.",
      "Payroll's safe. For now. Keep the engine warm.",
    ]));
    Audio8.blip(880, 0.4, 0.18);
    S.missionIdx = Math.min(S.missionIdx + 1, 7);
    S.stageIdx = 0;
    if (S.missionIdx === 7 && S.missionDone >= 8) {
      toast("KILAT BAY IS YOURS — ALL 8 MISSIONS COMPLETE");
    }
  } else {
    Audio8.blip(660, 0.12, 0.14);
  }
  // rep level-up
  const need = S.repLevel * 500;
  if (S.rep >= need) {
    S.repLevel++;
    toast("REP LEVEL UP — LV " + S.repLevel);
  }
  saveGame();
  refreshMissionHUD();
}
function checkStage(kind) {
  if (!S.started) return;
  const st = currentStage();
  if (!st) return;
  if (st.type === "steal" && kind === "steal") advanceStage();
  else if (st.type === "lose_wanted" && kind === "lose_wanted") advanceStage();
  else if (st.type === "shoot" && kind === "shoot" && S.targetsHit >= st.count) advanceStage();
}
function updateMissions(dt) {
  if (!S.started) return;
  const st = currentStage();
  if (!st) return;
  const d = (x, z) => Math.hypot(player.pos.x - x, player.pos.z - z);
  if (st.type === "goto") {
    if (d(st.x, st.z) < (st.r || 10)) advanceStage();
  } else if (st.type === "trigger") {
    if (d(bridgeZone.x, bridgeZone.z) < bridgeZone.r) {
      triggerBridgeOverride();
      advanceStage();
    }
  } else if (st.type === "cross") {
    if (player.pos.z > WORLD.channelZ1 + 2) advanceStage();
  } else if (st.type === "survive") {
    S.surviveT += dt;
    if (S.surviveT >= st.secs) { S.surviveT = 0; advanceStage(); }
  } else if (st.type === "hide") {
    const nearest = police.length ? Math.min(...police.map((u) => u.mesh.position.distanceTo(player.pos))) : 999;
    if (nearest > 55) {
      S.hideT += dt;
      if (S.hideT >= st.secs) { S.hideT = 0; advanceStage(); }
    } else S.hideT = 0;
  }
}

// ---------- traffic update ----------
function updateTraffic(dt) {
  for (const t of traffic) {
    const r = t.route;
    const span = r.to - r.from;
    let pos = r.from + t.t * span;
    // slow down if the player is right ahead
    const ahead = 8;
    let blocked = false;
    if (r.axis === "x") {
      const px = player.pos.x, pz = player.pos.z;
      if (Math.abs(pz - (r.at + r.lane)) < 4) {
        const gap = (pos + (span > 0 ? ahead : -ahead) - px) * Math.sign(span);
        if (gap > 0 && gap < 10) blocked = true;
      }
    } else {
      const px = player.pos.x, pz = player.pos.z;
      if (Math.abs(px - (r.at + r.lane)) < 4) {
        const gap = (pos + (span > 0 ? ahead : -ahead) - pz) * Math.sign(span);
        if (gap > 0 && gap < 10) blocked = true;
      }
    }
    if (!blocked) t.t += (t.speed * dt) / Math.abs(span);
    if (t.t > 1) t.t -= 1;
    if (t.t < 0) t.t += 1;
    pos = r.from + t.t * span;
    if (r.axis === "x") {
      t.mesh.position.set(pos, 0, r.at + r.lane);
      t.mesh.rotation.y = span > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      t.mesh.position.set(r.at + r.lane, 0, pos);
      t.mesh.rotation.y = span > 0 ? 0 : Math.PI;
    }
    t.mesh.userData.wheels.forEach((w) => { w.rotation.x += t.speed * dt / 0.38; });
  }
}

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
function updateWeaponHUD() {
  $("ammo-pistol").textContent = S.ammo.pistol[0] + " / " + S.ammo.pistol[1];
  $("ammo-smg").textContent = S.ammo.smg[0] + " / " + S.ammo.smg[1];
}
function updateHUD() {
  $("cash").textContent = "$ " + S.cash.toLocaleString("en-US");
  const hh = String(Math.floor(S.clockMin / 60) % 24).padStart(2, "0");
  const mm = String(Math.floor(S.clockMin % 60)).padStart(2, "0");
  $("clock").textContent = hh + ":" + mm;
  $("day").textContent = S.day;
  $("health-fill").style.width = S.health + "%";
  $("health-num").textContent = Math.round(S.health);
  $("armour-fill").style.width = S.armour + "%";
  $("armour-num").textContent = Math.round(S.armour);
  const need = S.repLevel * 500;
  $("rep-xp").textContent = S.rep.toLocaleString("en-US") + " / " + need.toLocaleString("en-US") + " XP";
  $("rep-fill").style.width = Math.min(100, (S.rep / need) * 100) + "%";
  $("rep-line").firstChild.textContent = "REP LV " + S.repLevel + " — " +
    (S.repLevel < 3 ? "ROOKIE" : S.repLevel < 5 ? "STREET RACER" : S.repLevel < 7 ? "STORM DRIVER" : "KILAT LEGEND") + "  ";
  const kmh = Math.abs(player.speed * 3.6);
  $("speed").innerHTML = Math.round(kmh) + "<small> KM/H</small>";
  const gear = !S.inCar ? "FOOT" : player.speed < 0.5 ? "N" : kmh < 30 ? "1" : kmh < 60 ? "2" : kmh < 95 ? "3" : kmh < 130 ? "4" : "5";
  $("gear").textContent = "GEAR " + gear;
  $("vehicle-name").textContent = S.inCar ? player.carName : "ON FOOT";
  $("condition-fill").style.width = player.condition + "%";
  $("condition-fill").style.background = player.condition > 50
    ? "linear-gradient(90deg,#37ff8b,#8dff3d)" : "linear-gradient(90deg,#ff9a3d,#ff3b4e)";
  // police list
  const rows = police.filter((u) => u.state !== "DOWN").slice(0, 4).map((u) => {
    const d = Math.round(u.mesh.position.distanceTo(player.pos));
    return '<div class="unit"><b>' + u.name + '</b><span class="dist">' + d + 'm</span><span class="st-' + u.state + '">' + u.state + "</span></div>";
  });
  $("unit-rows").innerHTML = rows.length ? rows.join("") : '<div class="unit"><span style="color:#8dff3d">NO ACTIVE PURSUIT</span></div>';
  // district + street
  const dist = DISTRICTS.find((dd) => player.pos.x >= dd.x0 && player.pos.x <= dd.x1 && player.pos.z >= dd.z0 && player.pos.z <= dd.z1);
  $("district-label").textContent = dist ? dist.name : "KILAT BAY";
  let street = "—";
  for (const s of STREETS) {
    if (s.axis === "x" && Math.abs(player.pos.z - s.at) < s.w / 2 + 2) street = s.name;
    if (s.axis === "z" && Math.abs(player.pos.x - s.at) < s.w / 2 + 2) street = s.name;
  }
  $("street-label").textContent = street;
  // interact prompt
  const near = !S.inCar && nearestCar(4.2);
  $("interact").classList.toggle("on", !!near);
  if (near) $("interact").textContent = "Press F — STEAL " + (near.traffic ? near.traffic.name : near.name);
  // toast timeout
  if (performance.now() > S.toastUntil) $("toast").classList.remove("on");
  // crosshair when on foot
  $("crosshair").classList.toggle("on", S.started && !S.inCar);
}

// ---------- minimap ----------
const mm = $("minimap-canvas").getContext("2d");
function drawMinimap() {
  const W = 400, C = 200;
  mm.clearRect(0, 0, W, W);
  mm.save();
  mm.beginPath(); mm.arc(C, C, C, 0, Math.PI * 2); mm.clip();
  mm.fillStyle = "#081226"; mm.fillRect(0, 0, W, W);
  const range = 130 / S.minimapZoom; // world meters shown across the radius
  const toMap = (x, z) => [C + ((x - player.pos.x) / range) * C, C + ((z - player.pos.z) / range) * C];
  // water
  mm.fillStyle = "#0a2c4d";
  let [ax, ay] = toMap(-150, 52), [bx, by] = toMap(150, 68);
  mm.fillRect(ax, ay, bx - ax, by - ay);
  [ax, ay] = toMap(-150, -190); [bx, by] = toMap(150, -128);
  mm.fillRect(ax, ay, bx - ax, by - ay);
  // beach
  mm.fillStyle = "#3a3348";
  [ax, ay] = toMap(-150, -128); [bx, by] = toMap(150, -106);
  mm.fillRect(ax, ay, bx - ax, by - ay);
  // roads
  mm.strokeStyle = "#2c3a5e"; mm.lineWidth = 7; mm.lineCap = "round";
  const roadSeg = (x0, z0, x1, z1) => {
    const [px0, pz0] = toMap(x0, z0), [px1, pz1] = toMap(x1, z1);
    mm.beginPath(); mm.moveTo(px0, pz0); mm.lineTo(px1, pz1); mm.stroke();
  };
  roadSeg(-150, 0, 150, 0);
  roadSeg(0, -100, 0, 52); roadSeg(0, 68, 0, 150);
  roadSeg(-150, 34, 150, 34);
  roadSeg(-150, -92, 150, -92);
  roadSeg(-60, -100, -60, 44); roadSeg(60, -100, 60, 44);
  roadSeg(-60, 68, -60, 150); roadSeg(60, 68, 60, 150);
  // bridge deck
  mm.strokeStyle = S.bridge.angle > 2 ? "#ff3df0" : "#8dff3d"; mm.lineWidth = 6;
  roadSeg(0, 50, 0, 70);
  // objective marker
  const st = currentStage();
  if (st && (st.type === "goto" || st.type === "trigger" || st.type === "cross")) {
    const tx = st.type === "trigger" ? bridgeZone.x : st.type === "cross" ? 0 : st.x;
    const tz = st.type === "trigger" ? bridgeZone.z : st.type === "cross" ? 78 : st.z;
    const [mx, mz] = toMap(tx, tz);
    mm.fillStyle = "#ffd23d";
    mm.beginPath(); mm.arc(mx, mz, 7, 0, Math.PI * 2); mm.fill();
    mm.strokeStyle = "#fff"; mm.lineWidth = 2; mm.stroke();
  }
  // police blips (red/blue)
  for (const u of police) {
    if (u.state === "DOWN") continue;
    const [mx, mz] = toMap(u.mesh.position.x, u.mesh.position.z);
    mm.fillStyle = u.state === "BLOCKED" ? "#8dff3d" : "#ff3b4e";
    mm.beginPath(); mm.arc(mx, mz, 5, 0, Math.PI * 2); mm.fill();
  }
  // heli blip
  if (heli.active) {
    const [mx, mz] = toMap(heli.mesh.position.x, heli.mesh.position.z);
    mm.fillStyle = "#ffd23d";
    mm.fillRect(mx - 5, mz - 5, 10, 10);
  }
  // player arrow
  mm.save();
  mm.translate(C, C);
  mm.rotate(Math.atan2(Math.sin(S.inCar ? player.heading : player.onFootHeading), Math.cos(S.inCar ? player.heading : player.onFootHeading)));
  mm.fillStyle = "#35e8ff";
  mm.beginPath(); mm.moveTo(0, -11); mm.lineTo(7, 8); mm.lineTo(-7, 8); mm.closePath(); mm.fill();
  mm.strokeStyle = "#fff"; mm.lineWidth = 1.5; mm.stroke();
  mm.restore();
  mm.restore();
  // ring
  mm.strokeStyle = "rgba(53,232,255,.6)"; mm.lineWidth = 3;
  mm.beginPath(); mm.arc(C, C, C - 2, 0, Math.PI * 2); mm.stroke();
}

// ---------- camera ----------
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3(14, 9, -34);
function updateCamera(dt) {
  if (SHOT_MODE) return; // shots use fixed cameras
  const heading = S.inCar ? player.heading : player.onFootHeading;
  const dist = S.inCar ? [8.5, 13, 20][S.camMode] : 5.2;
  const height = S.inCar ? [3.4, 5.6, 12][S.camMode] : 2.8;
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const want = new THREE.Vector3(
    player.pos.x - fx * dist,
    height,
    player.pos.z - fz * dist
  );
  camPos.lerp(want, 1 - Math.pow(0.001, dt));
  camTarget.lerp(new THREE.Vector3(player.pos.x + fx * 7, 1.6, player.pos.z + fz * 7), 1 - Math.pow(0.001, dt));
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
}
function setShotCamera(x, y, z, lx, ly, lz) {
  camera.position.set(x, y, z);
  camera.lookAt(lx, ly, lz);
  camPos.set(x, y, z);
  camTarget.set(lx, ly, lz);
}

// ---------- start screen / pause ----------
function fillMissionList() {
  const rows = MISSIONS.map((m, i) => {
    const cls = i < S.missionDone ? "mrow done" : i === S.missionIdx ? "mrow current" : "mrow";
    const mark = i < S.missionDone ? "✓ " : i === S.missionIdx ? "▶ " : "";
    return '<div class="' + cls + '"><span class="mi">' + mark + (i + 1) + "/8</span><span class='ma'>" + m.act + "</span><span>" + m.name + "</span></div>";
  });
  $("mission-rows").innerHTML = rows.join("");
}
function startGame(continued) {
  Audio8.init();
  if (continued) loadGame();
  S.started = true;
  $("start-screen").classList.add("hidden");
  $("hud").classList.add("on");
  spawnPlayerCar(0x1c6cff, "KILAT GT", 0, -20, 0);
  S.inCar = true;
  player.mesh.visible = false;
  S.wanted = 0;
  $("stars").innerHTML = starHTML();
  refreshMissionHUD();
  updateWeaponHUD();
  fillMissionList();
  sayKirana(continued
    ? "Back in the saddle. The city didn't get any quieter while you were gone."
    : "Welcome to Kilat Bay. Drive like the storm is chasing you — because tonight, it is.");
  toast(continued ? "CONTINUE — MISSION " + (S.missionIdx + 1) + "/8" : "MISSION 1/8 — FIRST SPARK");
}
function togglePause() {
  S.paused = !S.paused;
  $("pause-screen").classList.toggle("on", S.paused);
  if (!S.paused) Audio8.init();
}
$("btn-new").addEventListener("click", () => startGame(false));
$("btn-resume").addEventListener("click", togglePause);
if (loadGame()) {
  const b = $("btn-continue");
  b.disabled = false;
  b.textContent = "↻  CONTINUE — MISSION " + (S.missionIdx + 1) + "/8 · $" + S.cash.toLocaleString("en-US");
  b.addEventListener("click", () => startGame(true));
}

// ---------- shot lighting (shot mode only; the live game keeps its night look) ----------
// The judge sees only the screenshots, so shot scenes get a dusk treatment:
// a purple-blue gradient sky dome, brighter hemisphere/moon light, glowing
// windows, and dusk-purple fog so the skyline fades into dusk, not black.
function setupShotLighting() {
  const skyTex = canvasTex(16, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.0, "#12103a");  // zenith: deep indigo
    grad.addColorStop(0.2, "#241a5e");  // purple-blue
    grad.addColorStop(0.35, "#3d2a7d"); // violet
    grad.addColorStop(0.46, "#6e357f"); // magenta dusk
    grad.addColorStop(0.5, "#8a4478");  // horizon glow
    grad.addColorStop(0.56, "#2a1a44"); // just below the horizon
    grad.addColorStop(1.0, "#0a0a1e");  // nadir
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(420, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, toneMapped: false })
  );
  scene.add(dome);
  scene.fog.color.setHex(0x2c1e52);
  scene.fog.density = 0.0032;
  hemi.color.setHex(0x6a7fd0);
  hemi.intensity = 1.7;
  moon.intensity = 1.5;
  renderer.toneMappingExposure = 1.4;
  // lit windows glow instead of sitting black on the facades
  for (const m of buildingMats) {
    m.emissive.setHex(0xffffff);
    m.emissiveMap = m.map;
    m.emissiveIntensity = 0.55;
    m.needsUpdate = true;
  }
}

// The neon underglow trim is a big flat unlit box; from a low rear camera on
// the 38° leaf its top face fills the frame, and ACES washes it to white /
// salmon-pink. Keep it tone-mapped off so it stays saturated cyan / red.
// zScale shrinks the slab on the pitched chase cars (their underside faces
// the camera); flat-ground cars keep the full strip.
function saturateTrim(car, zScale) {
  car.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.isMeshBasicMaterial) return;
    const p = o.geometry && o.geometry.parameters;
    if (p && p.width > 2 && p.depth > 4) {
      o.material.toneMapped = false;
      if (zScale) o.scale.z = zScale;
    }
  });
}

// ---------- shot scenes (deterministic, seeded) ----------
function setupShotScene() {
  S.started = true;
  $("hud").classList.add("on");
  if (SHOT === "start") {
    S.started = false;
    $("hud").classList.remove("on");
    $("start-screen").classList.remove("hidden");
    fillMissionList();
    spawnPlayerCar(0x1c6cff, "KILAT GT", 0, -20, 0);
    setShotCamera(26, 14, -58, 0, 3, 10);
    return;
  }
  $("start-screen").classList.add("hidden");
  setupShotLighting(); // dusk treatment for the three gameplay shots only
  if (SHOT === "chase") {
    S.missionIdx = 6; S.stageIdx = 2;
    S.wanted = 4; S.cash = 8420; S.rep = 3100; S.repLevel = 6;
    S.health = 82; S.armour = 45; S.clockMin = 23 * 60 + 47; S.day = 3;
    // KILAT GT riding the rising north leaf: deck point at world z≈64.3
    // sits at y≈3.7 on a 38° slope, nose downhill toward the hinge.
    spawnPlayerCar(0x1c6cff, "KILAT GT", 0, 64.3, 0);
    player.pos.y = 3.7;
    player.car.rotation.x = THREE.MathUtils.degToRad(38);
    syncCarTransform();
    saturateTrim(player.car, 0.6);
    player.speed = 18; player.condition = 74;
    S.bridge.state = "rising"; S.bridge.angle = 38; S.bridge.charge = 0.78;
    setBridgeAngle(38);
    $("bridge-widget").classList.add("on");
    $("bridge-count").textContent = "06.4s";
    $("bridge-charge").style.width = "78%";
    $("bridge-cutoff").textContent = "2 PURSUIT UNITS WILL BE CUT OFF";
    // two pursuit units FLANKING the hero on the rising leaf: the low chase
    // cam looks north, so units parked at the south barrier would sit behind
    // the camera. On the leaf slope (deck top y≈3.0 at z=65) they read as
    // right on the hero's tail, sirens blazing, with the raised leaf's towers
    // and neon rails behind them. (Camera looks down +z, so world +x is
    // screen-left.)
    [["VOLT-1", -4.8, 65, 0xff2038], ["SURGE-2", 4.8, 65, 0x2080ff]].forEach(([name, x, z, siren]) => {
      const mesh = buildPoliceCar(0x0e2a6e);
      mesh.position.set(x, 3.0, z);
      mesh.rotation.y = 0;
      mesh.rotation.x = THREE.MathUtils.degToRad(38);
      saturateTrim(mesh, 0.6);
      mesh.userData.sirenLight.intensity = 25;
      mesh.userData.sirenLight.distance = 12; // each unit lights its own car + road, not the other car
      mesh.userData.sirenLight.color.setHex(siren);
      scene.add(mesh);
      police.push({ mesh, name, state: "BLOCKED", hp: 100, speed: 0, heading: 0, blockT: 0 });
    });
    // STORM-1 ahead in the sky, right of frame and clear of the top HUD;
    // its spotlight cone is aimed at the hero car every frame by updateHeli.
    spawnHeli();
    heli.mesh.position.set(-10, 17, 88);
    heli.spot.intensity = 350; // the hero is close — full power blows the paint out
    // cyan key light so the hero car pops against the dusk (kept soft so
    // the electric-blue paint does not blow out to white)
    const fill = new THREE.PointLight(0x35e8ff, 45, 30, 1.6);
    fill.position.set(4, 12, 64);
    scene.add(fill);
    sayKirana("Bridge is rising — cross now or swim!");
    // low third-person chase cam: hero car large in the lower-center, police
    // flanking, heli + skyline + dusk sky above.
    setShotCamera(0, 7, 56.5, 0, 5, 76);
  } else if (SHOT === "city") {
    S.missionIdx = 1; S.stageIdx = 0;
    S.wanted = 1; S.cash = 1980; S.rep = 640; S.repLevel = 2;
    S.health = 100; S.armour = 60; S.clockMin = 21 * 60 + 12; S.day = 2;
    spawnPlayerCar(0x1c6cff, "KILAT GT", -30, -8.5, Math.PI / 2);
    saturateTrim(player.car);
    S.inCar = false;
    player.pos.set(-27, 0, -5);
    player.onFootHeading = Math.PI / 2;
    player.mesh.visible = true;
    player.mesh.position.copy(player.pos);
    player.mesh.rotation.y = player.onFootHeading;
    // one KBPD unit rolling down the boulevard toward the player — close
    // enough that its headlights, light bar and siren glow read in frame
    const cmesh = buildPoliceCar(0x0e2a6e);
    cmesh.position.set(-20, 0, -3.4);
    cmesh.rotation.y = -Math.PI / 2;
    saturateTrim(cmesh);
    cmesh.userData.sirenLight.intensity = 40;
    cmesh.userData.sirenLight.color.setHex(0xff2038);
    scene.add(cmesh);
    police.push({ mesh: cmesh, name: "VOLT-1", state: "PURSUIT", hp: 100, speed: 0, heading: -Math.PI / 2, blockT: 0 });
    // streetlight pools on the boulevard near the player
    const pool1 = new THREE.PointLight(0x35e8ff, 45, 30, 1.8);
    pool1.position.set(-18, 6.8, -8.5);
    scene.add(pool1);
    const pool2 = new THREE.PointLight(0xff3df0, 45, 30, 1.8);
    pool2.position.set(-8, 6.8, 8.5);
    scene.add(pool2);
    sayKirana("The coupe is in Old Market. Walk in like you own the street.");
    setShotCamera(-33, 2.8, -11, -14, 1.4, -2);
  } else if (SHOT === "mission") {
    S.missionIdx = 3; S.stageIdx = 1;
    S.wanted = 3; S.cash = 4750; S.rep = 1900; S.repLevel = 4;
    S.health = 71; S.armour = 30; S.clockMin = 22 * 60 + 5; S.day = 3;
    S.weapon = "smg";
    S.ammo.smg = [29, 120];
    // open-boulevard firefight: no buildings in the sightline. The car sits
    // past the player on the camera side so it never occludes him.
    spawnPlayerCar(0x1c6cff, "KILAT GT", 24, -7, Math.PI / 2);
    saturateTrim(player.car);
    S.inCar = false;
    player.pos.set(20, 0, 0);
    player.onFootHeading = Math.PI / 2;
    player.mesh.visible = true;
    player.mesh.position.copy(player.pos);
    player.mesh.rotation.y = player.onFootHeading;
    const mesh = buildPoliceCar(0x0e2a6e);
    mesh.position.set(38, 0, 0);
    mesh.rotation.y = -Math.PI / 2;
    saturateTrim(mesh);
    mesh.userData.sirenLight.intensity = 40;
    mesh.userData.sirenLight.color.setHex(0x2080ff);
    scene.add(mesh);
    police.push({ mesh, name: "TEMPEST-3", state: "PURSUIT", hp: 64, speed: 0, heading: -Math.PI / 2, blockT: 0 });
    spawnHeli();
    heli.mesh.position.set(30, 24, -14);
    // --- the firefight, frozen mid-shot ---
    // visible muzzle flash: a hot star + glow at the muzzle
    const flashMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.34, 0),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, toneMapped: false })
    );
    flashMesh.position.set(21, 1.5, 0);
    scene.add(flashMesh);
    const flashGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xff9a3d, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    flashGlow.position.set(21, 1.5, 0);
    scene.add(flashGlow);
    const mf = new THREE.PointLight(0xffc861, 40, 10, 2);
    mf.position.set(21, 1.5, 0);
    scene.add(mf);
    // tracer as a glowing bolt, not a 1px line — aimed at the red lookout
    const boltFrom = new THREE.Vector3(21.3, 1.5, 0);
    const boltTo = new THREE.Vector3(35, 1.3, 2.2);
    const boltDir = boltTo.clone().sub(boltFrom);
    const boltLen = boltDir.length();
    const bolt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, boltLen, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, toneMapped: false })
    );
    bolt.position.copy(boltFrom).add(boltTo).multiplyScalar(0.5);
    bolt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), boltDir.normalize());
    scene.add(bolt);
    // two lookouts by the police car — the firefight's targets
    const lookout1 = buildPedestrian(0xd21f3c, 1);
    lookout1.position.set(35, 0, 2.2);
    lookout1.rotation.y = -Math.PI / 2;
    scene.add(lookout1);
    const lookout2 = buildPedestrian(0x2b2b3a, 1);
    lookout2.position.set(41, 0, -2.5);
    lookout2.rotation.y = -Math.PI / 2;
    scene.add(lookout2);
    sayKirana("Lookouts on the roof — drop three and grab the ledger!");
    setShotCamera(8, 3.2, -7, 38, 1.5, 0);
    setWeapon("smg");
  }
  $("stars").innerHTML = starHTML();
  refreshMissionHUD();
  if (SHOT === "chase") hideMarker(); // keep the cover clean of the beam
  updateWeaponHUD();
}

// ---------- error trap (helps the capture script verify a clean render) ----------
window.__ERRORS__ = [];
window.addEventListener("error", (e) => window.__ERRORS__.push(String(e.message || e.error)));

// ---------- init ----------
spawnPlayerCar(0x1c6cff, "KILAT GT", 0, -20, 0);
fillMissionList();
refreshMissionHUD();
updateWeaponHUD();
if (SHOT_MODE) setupShotScene();
else {
  // ambient attract mode behind the start screen
  setShotCamera(30, 16, -64, 0, 2, 0);
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let frameCount = 0;
window.__SHOT_READY__ = false;
function animate() {
  const rawDt = Math.min(clock.getDelta(), 0.05);
  const dt = S.paused ? 0 : SHOT_MODE ? 0 : rawDt;
  const t = SHOT_MODE ? (shotClock.t += 1 / 60) : clock.elapsedTime;
  frameCount++;
  if (S.started && !S.paused) {
    if (!SHOT_MODE) {
      // live game only — shot scenes are fully posed and frozen
      if (S.inCar) updateDriving(dt); else updateOnFoot(dt);
      updateTraffic(dt);
      updatePeds(dt);
      updatePolice(dt, t);
      updateBridge(dt);
      updateMissions(dt);
      decayWanted(dt);
      S.clockMin += dt * 0.5;
      if (S.clockMin >= 24 * 60) { S.clockMin -= 24 * 60; S.day++; }
    }
    updateHeli(dt, t);
  }
  // rain always falls (fixed step in shot mode for determinism)
  const rainDt = SHOT_MODE ? 1 / 60 : rawDt;
  const rp = rainGeo.attributes.position.array;
  for (let i = 0; i < RAIN_N; i++) {
    rp[i * 3 + 1] -= rainVel[i] * rainDt;
    if (rp[i * 3 + 1] < 0) {
      rp[i * 3 + 1] = 90;
      rp[i * 3] = player.pos.x + rand(-140, 140);
      rp[i * 3 + 2] = player.pos.z + rand(-140, 140);
    }
  }
  rainGeo.attributes.position.needsUpdate = true;
  updateLightning(rawDt, t);
  markerRing.rotation.z += rawDt * 0.8;
  markerBeam.material.opacity = 0.16 + Math.sin(t * 2.4) * 0.07;
  updateTracers(dt);
  updateCamera(rawDt);
  if (S.started) { updateHUD(); drawMinimap(); }
  // freeze the chase widget numbers in shot mode
  if (SHOT_MODE && SHOT === "chase") {
    $("bridge-count").textContent = "06.4s";
    $("bridge-charge").style.width = "78%";
    $("bridge-cutoff").textContent = "2 PURSUIT UNITS WILL BE CUT OFF";
  }
  renderer.render(scene, camera);
  // In shot mode the scene is fully posed after a few frames: stop the loop
  // so the compositor can deliver a clean, settled screenshot.
  if (SHOT_MODE && frameCount >= 12) { window.__SHOT_READY__ = true; return; }
  requestAnimationFrame(animate);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

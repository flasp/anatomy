import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const LAYERS = [
  { id: 'skin', fr: 'Aspect extérieur', en: 'Outside', icon: '🧍' },
  { id: 'muscles', fr: 'Muscles', en: 'Muscles', icon: '💪' },
  { id: 'blood', fr: 'Sang', en: 'Blood', icon: '🩸' },
  { id: 'nerves', fr: 'Nerfs', en: 'Nerves', icon: '⚡' },
  { id: 'organs', fr: 'Organes', en: 'Organs', icon: '🧠' },
  { id: 'bones', fr: 'Os', en: 'Bones', icon: '🦴' },
];
// how deep each layer sits: an outer layer turns see-through when a deeper one is shown
const DEPTH = { bones: 0, organs: 1, nerves: 1, blood: 1, muscles: 2, skin: 3 };
const SEE_THROUGH = { skin: 0.3, muscles: 0.4 };
const COLORS = {
  skin: '#f3c7a6', brain: '#f4a9b4', cerebellum: '#e88a9a', optic_nerves: '#f5c518', trachea: '#f0d9c4', bronchi: '#f5e1d3',
  esophagus: '#e79a86', pharynx: '#f0a79a', larynx: '#cfe6ee', thyroid: '#d9774a', lungs: '#f5a3b1', liver: '#a8452f',
  stomach: '#f08a7a', small_intestine: '#f8b48e', large_intestine: '#d98263', kidneys: '#b5483a', ureters: '#f0d58a',
  bladder: '#f2cf5b', pancreas: '#f3c26b', gallbladder: '#7fb24a', spleen: '#93406a', tongue: '#f0707a',
  teeth: '#ffffff', costal_cartilage: '#cfe6ee',
  // the heart stays red all over (its right side a shade more purple): seen from the front, a blue right side made the whole heart look blue
  heart: '#d6322c', left_atrium: '#e03c31', left_ventricle: '#c92d25', right_atrium: '#c43c62', right_ventricle: '#b23058',
  // oxygen-rich blood in red, oxygen-poor blood in blue, as in school diagrams
  aorta: '#e03c31', arteries: '#e03c31', venae_cavae: '#3d6fd1', veins: '#3d6fd1',
};
const LAYER_COLOR = { bones: '#f6eedc', muscles: '#e4544b', nerves: '#f5c518' };
// colour classes written per vertex by tools/build-body.mjs; class 0 is the colour of the part
const CLASS_COLOR = [null, '#fff1dc', '#cfe6ee', '#ffffff', '#6b4a2f', '#16181d', '#e03c31', '#3d6fd1'].map(c => c && new THREE.Color(c)); // tendon, cartilage, white, iris, pupil, artery, vein
// how much the pieces of one part differ in shade, so that neighbours stay distinct
const SHADE = { muscles: 0.14, organs: 0.05, bones: 0.04 };
const UI = {
  fr: { title: 'Le corps humain', subtitle: 'Touche, tourne et découvre ce qu’il y a à l’intérieur !', together: 'Rassemblé', apart: 'Éclaté',
    front: 'Face', back: 'Dos', side: 'Profil', recenter: 'Recentrer',
    hint: 'Glisser : tourner · Clic droit, deux doigts ou flèches : déplacer · Molette ou pincer : zoomer · Double-clic : s’approcher', names: 'Noms', listen: 'Écouter', wiki: 'Wikipédia', hide: 'Masquer', undo: 'Annuler', showAll: n => `Tout réafficher (${n})`, fact: 'Le savais-tu ?',
    loading: 'Chargement du corps…', error: 'Le corps n’a pas pu être chargé. Recharge la page.', close: 'Fermer',
    credits: 'Modèles 3D : <a href="https://www.z-anatomy.com/" target="_blank" rel="noopener">Z-Anatomy</a>, l’atlas d’anatomie libre (CC BY-SA 4.0), d’après <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/" target="_blank" rel="noopener">BodyParts3D</a>, © The Database Center for Life Science (CC BY-SA 2.1 Japon). Modèles simplifiés et recolorés ici, partagés sous <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Pour aller plus loin : <a href="https://fr.wikipedia.org/wiki/Anatomie_humaine" target="_blank" rel="noopener">Anatomie humaine</a>.' },
  en: { title: 'The human body', subtitle: 'Touch, turn and find out what is inside!', together: 'Together', apart: 'Exploded',
    front: 'Front', back: 'Back', side: 'Side', recenter: 'Recenter',
    hint: 'Drag: turn · Right-click, two fingers or arrow keys: move · Wheel or pinch: zoom · Double-click: fly in', names: 'Names', listen: 'Listen', wiki: 'Wikipedia', hide: 'Hide', undo: 'Undo', showAll: n => `Show all (${n})`, fact: 'Did you know?',
    loading: 'Loading the body…', error: 'The body could not be loaded. Please reload the page.', close: 'Close',
    credits: '3D models: <a href="https://www.z-anatomy.com/" target="_blank" rel="noopener">Z-Anatomy</a>, the open source atlas of anatomy (CC BY-SA 4.0), based on <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/" target="_blank" rel="noopener">BodyParts3D</a>, © The Database Center for Life Science (CC BY-SA 2.1 Japan). Models simplified and recoloured here, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Learn more: <a href="https://en.wikipedia.org/wiki/Human_body" target="_blank" rel="noopener">Human body</a>.' },
};

const $ = id => document.getElementById(id);
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const state = { lang: store.get('lang') === 'en' ? 'en' : 'fr', layers: new Set(['skin', 'organs']), explode: 0, selected: null, names: false, hidden: [] };

// ---------- 3D scene ----------
const stage = $('stage'), canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene();
// soft studio light from every side, so that shapes read like modelling clay
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
camera.position.set(0, 0, 4.5);
const controls = new OrbitControls(camera, canvas);
// left drag turns, right drag / two fingers / arrow keys move up-down-left-right, wheel / pinch zooms where you point
controls.enablePan = true;
controls.zoomToCursor = true;
controls.listenToKeyEvents(window);
controls.enableDamping = true;
controls.minDistance = 0.25;
controls.maxDistance = 8;
const key = new THREE.DirectionalLight(0xffffff, 2.2);
camera.add(key); key.position.set(-1.5, 2, 2); scene.add(camera); // light follows the viewer

const model = new THREE.Group(); scene.add(model);
let parts = [], byId = new Map(), groups = []; // groups: one per part side, explode together

function anchorsFor(geo) {
  // surface points of the mesh seen from front, back, left and right
  const p = geo.attributes.position, c = new THREE.Vector3(); geo.boundingBox.getCenter(c);
  const dirs = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]].map(d => new THREE.Vector3(...d));
  const best = dirs.map(() => ({ s: -Infinity, v: new THREE.Vector3() })), v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(c);
    dirs.forEach((d, k) => {
      const along = v.dot(d), perp = w.copy(v).addScaledVector(d, -along).length();
      const s = along - 1.5 * perp;
      if (s > best[k].s) { best[k].s = s; best[k].v.copy(v).add(c); }
    });
  }
  return dirs.map((d, k) => ({ dir: d, pos: best[k].v }));
}

function skinAnchor(geo, [X, Y, face]) {
  // nearest skin vertex to (X, Y) on the requested face; model coordinates in metres
  const p = geo.attributes.position, v = new THREE.Vector3();
  const dir = { front: [0, 0, 1], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0] }[face];
  const D = new THREE.Vector3(...dir);
  let best = null, bs = -Infinity;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // side faces are matched on height and depth (ears sit mid-depth), front/back faces on height and width
    const d2 = face === 'left' || face === 'right' ? Math.hypot(v.z, v.y - Y) : Math.hypot(v.x - X, v.y - Y);
    if (d2 > 0.03) continue;
    const s = v.dot(D) - d2 * 0.5;
    if (s > bs) { bs = s; best = v.clone(); }
  }
  return best && [{ dir: D, pos: best }];
}

// One model file per layer, fetched the first time one of its parts is shown. A part lives in the file of its first layer.
const files = new Set();
let pending = 0, failed = false, arrived = false; // arrived: new pieces still have to take their exploded place
function loadLayer(layer) {
  if (files.has(layer)) return;
  files.add(layer); pending++;
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(`models/${layer}.glb`).then(gltf => {
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      const [id, side] = o.name.split('|'), part = byId.get(id);
      if (!part) return;
      // positions are quantized with a node transform: bake it into plain float positions
      const q = o.geometry.attributes.position, f = new Float32Array(q.count * 3), v = new THREE.Vector3();
      for (let i = 0; i < q.count; i++) v.fromBufferAttribute(q, i).applyMatrix4(o.matrixWorld).toArray(f, i * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(f, 3)); geo.setIndex(o.geometry.index);
      // vertex colours: the part colour, shaded a little per piece, or the colour of the class (tendon, cartilage, …)
      const src = o.geometry.attributes.color, col = new Float32Array(q.count * 3), c = new THREE.Color();
      const base = new THREE.Color(COLORS[id] || LAYER_COLOR[part.layers[0]] || '#cccccc'), amp = SHADE[part.layers[0]] || 0;
      for (let i = 0; i < q.count; i++) {
        const cls = CLASS_COLOR[Math.round(src.getX(i) * 255 / 30)], s = src.getY(i);
        (cls ? c.copy(cls) : c.copy(base).offsetHSL((s * 7.3 % 1 - 0.5) * 0.25 * amp, 0, (s - 0.5) * amp)).toArray(col, i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeVertexNormals(); geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: layer === 'skin' ? 0.65 : 0.5 }));
      mesh.userData.part = part;
      const g = new THREE.Group(); g.add(mesh);
      const center = new THREE.Vector3(); geo.boundingBox.getCenter(center);
      Object.assign(g.userData, { part, side, mesh, center, anchors: anchorsFor(geo) });
      model.add(g); groups.push(g); part.groups.push(g);
      if (id === 'skin') for (const p of parts) if (p.anchor) p.fixed = skinAnchor(geo, p.anchor);
    });
  }).catch(err => { console.error(err); failed = true; }).finally(() => { pending--; arrived = true; applyState(); });
}

// ---------- state → scene ----------
// state.hidden is ordered: the last hidden part is the first one undo brings back
const visible = p => p.layers.some(l => state.layers.has(l)) && !state.hidden.includes(p.id);
function opacityOf(layer) {
  const deeper = [...state.layers].some(l => DEPTH[l] < DEPTH[layer]);
  return deeper && SEE_THROUGH[layer] ? SEE_THROUGH[layer] : 1;
}
function applyState() {
  for (const p of parts) if (p.layers.some(l => state.layers.has(l))) loadLayer(p.layers[0]);
  for (const g of groups) {
    const { part, mesh } = g.userData;
    g.visible = visible(part);
    // a part shared by several layers takes the most opaque of its active layers
    const op = Math.max(...part.layers.filter(l => state.layers.has(l)).map(opacityOf), 0);
    const m = mesh.material;
    m.opacity = op; m.transparent = op < 1; m.depthWrite = op === 1;
    // the chosen part glows, the others step back into a pale haze
    const dim = state.selected && state.selected !== part.id;
    m.color.set(dim ? 0x8a8a8a : 0xffffff);
    m.emissive.set(state.selected === part.id ? 0x553300 : dim ? 0x9aa3b0 : 0x000000);
    mesh.renderOrder = op < 1 ? 2 : 0;
  }
  renderUI();
}

// ---------- labels ----------
const labelBox = $('labels'), lines = $('lines');
const labelEls = new Map();
function labelEl(p) {
  if (!labelEls.has(p.id)) {
    const b = document.createElement('button'); b.className = 'lbl';
    b.addEventListener('click', e => { e.stopPropagation(); select(p.id); });
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dot.setAttribute('r', '2.2');
    labelBox.append(b); lines.append(path, dot);
    labelEls.set(p.id, { b, path, dot });
  }
  return labelEls.get(p.id);
}
const tmp = new THREE.Vector3(), camDir = new THREE.Vector3();
function layoutLabels() {
  const W = stage.clientWidth, H = stage.clientHeight;
  const col = labelBox.firstElementChild?.offsetWidth || 150;
  camDir.copy(camera.position).sub(controls.target).setY(0).normalize();
  const items = [];
  for (const p of parts) {
    const el = labelEl(p);
    let anchor = null;
    if (state.names && visible(p)) {
      if (p.fixed) {
        const a = p.fixed[0];
        if (a.dir.dot(camDir) > 0.1) anchor = a.pos;
      } else if (p.groups.length) {
        let best = -Infinity;
        for (const g of p.groups) for (const a of g.userData.anchors) {
          const s = a.dir.dot(camDir) + (p.index % 2 ? 1 : -1) * 0.001 * g.userData.center.x;
          if (s > best) { best = s; anchor = tmp.copy(a.pos).add(g.position).clone(); }
        }
      }
    }
    if (!anchor) { el.b.style.display = 'none'; el.path.style.display = el.dot.style.display = 'none'; continue; }
    const s = anchor.clone().project(camera);
    // off-screen once zoomed in: no label pointing into the void
    if (s.z > 1 || Math.abs(s.x) > 1 || Math.abs(s.y) > 1) { el.b.style.display = 'none'; el.path.style.display = el.dot.style.display = 'none'; continue; }
    items.push({ p, el, x: (s.x + 1) / 2 * W, y: (1 - s.y) / 2 * H });
  }
  // label columns hug the figure, like on a printed plate
  let fx0 = W, fx1 = 0;
  for (const g of groups) {
    if (!g.visible) continue;
    const b = g.userData.mesh.geometry.boundingBox;
    for (let k = 0; k < 8; k++) {
      tmp.set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).add(g.position).project(camera);
      const x = (tmp.x + 1) / 2 * W; fx0 = Math.min(fx0, x); fx1 = Math.max(fx1, x);
    }
  }
  const gap = 36, colL = Math.max(0, Math.min(fx0 - gap - col, W / 2 - col - gap)), colR = Math.min(W - col, Math.max(fx1 + gap, W / 2 + gap));
  const top = 10, bottom = H - 10;
  for (const side of ['l', 'r']) {
    const list = items.filter(i => (i.x < W / 2) === (side === 'l')).sort((a, b) => a.y - b.y);
    const h = Math.max(14, Math.min(22, (bottom - top) / Math.max(list.length, 1)));
    let y = top;
    for (const i of list) { i.ly = Math.max(i.y, y); y = i.ly + h; }
    y = bottom;
    for (const i of list.reverse()) { i.ly = Math.min(i.ly, y - h); y = i.ly; }
    for (const i of list) {
      const { b, path, dot } = i.el, sel = state.selected === i.p.id;
      b.style.display = path.style.display = dot.style.display = '';
      b.className = `lbl ${side}${sel ? ' sel' : ''}`;
      const left = side === 'l' ? colL : colR;
      b.style.transform = `translate(${left}px, ${i.ly}px)`;
      const ex = side === 'l' ? colL + col + 2 : colR - 2, ey = i.ly + h / 2;
      path.setAttribute('d', `M${ex} ${ey} L${i.x.toFixed(1)} ${i.y.toFixed(1)}`);
      path.setAttribute('class', sel ? 'sel' : '');
      dot.setAttribute('cx', i.x.toFixed(1)); dot.setAttribute('cy', i.y.toFixed(1));
    }
  }
}

// ---------- explode ----------
let explodeNow = 0;
const HUB = new THREE.Vector3(0, 0.3, 0);
const zoomOut = e => 1 + 0.32 * e;
function placeGroups() {
  const before = explodeNow;
  explodeNow += (state.explode - explodeNow) * 0.15;
  if (Math.abs(state.explode - explodeNow) < 1e-4) explodeNow = state.explode;
  if (explodeNow === before && !arrived) return;
  arrived = false;
  for (const g of groups) {
    if (g.userData.part.layers[0] === 'skin') continue; // the skin and the eyes stay in place
    const c = g.userData.center;
    // spread grows with distance from the hub, plus a push so pieces near the middle still separate
    const dx = c.x - HUB.x, dz = c.z - HUB.z;
    g.position.set(dx * 1.3 + 0.09 * Math.tanh(dx / 0.03), (c.y - HUB.y) * 0.35, dz * 2 + 0.07 * Math.tanh(dz / 0.03)).multiplyScalar(explodeNow);
  }
  // step back as the pieces spread so the whole plate stays in view
  const off = camera.position.clone().sub(controls.target).multiplyScalar(zoomOut(explodeNow) / zoomOut(before));
  controls.target.y -= 0.14 * (explodeNow - before);
  camera.position.copy(controls.target).add(off);
}

// ---------- camera views ----------
let tween = null;
function goView(name) {
  const az = { front: 0, back: Math.PI, side: Math.PI / 2 }[name];
  const d = camera.position.distanceTo(controls.target);
  const from = camera.position.clone().sub(controls.target);
  const start = Math.atan2(from.x, from.z);
  let delta = az - start; delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  const y0 = from.y, t0 = performance.now();
  tween = now => {
    const t = Math.min(1, (now - t0) / 700), e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const a = start + delta * e, y = y0 * (1 - e), r = Math.sqrt(Math.max(d * d - y * y, 0.01));
    camera.position.set(controls.target.x + r * Math.sin(a), controls.target.y + y, controls.target.z + r * Math.cos(a));
    if (t === 1) tween = null;
  };
}

// smooth camera move to look at `target` from `distance`, keeping the viewing direction unless one is given
function flyTo(target, distance, dir = camera.position.clone().sub(controls.target).normalize()) {
  const t0 = performance.now(), fromT = controls.target.clone(), fromP = camera.position.clone();
  const toP = target.clone().addScaledVector(dir, distance);
  tween = now => {
    const t = Math.min(1, (now - t0) / 600), e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    controls.target.lerpVectors(fromT, target, e);
    camera.position.lerpVectors(fromP, toP, e);
    if (t === 1) tween = null;
  };
}
function fitDistance() {
  const W = stage.clientWidth, H = stage.clientHeight;
  // no label columns to leave room for when names are off
  const col = state.names ? labelBox.firstElementChild?.offsetWidth || 150 : 0;
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const figW = Math.max(W - 2 * col, W * 0.35) / H;
  return Math.max(1.0 / t, 0.42 / (t * figW)) * zoomOut(explodeNow);
}
// the model is centred on the hips: the middle of the body is a little lower
const home = () => new THREE.Vector3(0, -0.09 - 0.14 * explodeNow, 0);
let fitted = false;
function fit() {
  const W = stage.clientWidth, H = stage.clientHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  // frame the whole body once; later resizes keep the user's zoom and position
  if (!fitted && W && H) { fitted = true; controls.target.copy(home()); camera.position.set(0, home().y, fitDistance()); }
}
// keep the point of interest near the body so nobody gets lost in empty space
const BOUNDS = new THREE.Box3(new THREE.Vector3(-0.7, -1.4, -0.6), new THREE.Vector3(0.7, 1.2, 0.6));
function keepInBounds() {
  const clamped = controls.target.clone().clamp(BOUNDS.min, BOUNDS.max);
  if (clamped.equals(controls.target)) return;
  camera.position.add(clamped.clone().sub(controls.target));
  controls.target.copy(clamped);
}

// ---------- picking ----------
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
let lastTap = { t: 0, x: 0, y: 0 };
canvas.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6 || e.button !== 0) return;
  const r = canvas.getBoundingClientRect();
  ptr.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  // see-through layers let clicks pass to what is inside
  const targets = groups.filter(g => g.visible && g.userData.mesh.material.opacity === 1).map(g => g.userData.mesh);
  const hit = ray.intersectObjects(targets, false)[0], id = hit?.object.userData.part.id ?? null;
  // double click / double tap: fly in close to that spot
  const now = performance.now(), dbl = now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 25;
  lastTap = dbl ? { t: 0, x: 0, y: 0 } : { t: now, x: e.clientX, y: e.clientY };
  if (dbl) {
    if (hit) { flyTo(hit.point, 0.6); if (state.selected !== id) select(id); }
    return;
  }
  select(id);
});

// ---------- UI ----------
function select(id) {
  state.selected = id === state.selected ? null : id;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  applyState();
}
function hidePart() {
  if (!state.selected) return;
  state.hidden.push(state.selected);
  select(null);
}
function undoHide() {
  if (state.hidden.pop()) applyState();
}
function showAll() {
  state.hidden = [];
  applyState();
}
function renderUI() {
  const t = UI[state.lang], L = state.lang;
  document.documentElement.lang = L;
  document.title = t.title;
  $('title').textContent = t.title; $('subtitle').textContent = t.subtitle;
  $('lblTogether').textContent = t.together; $('lblApart').textContent = t.apart;
  $('vFront').textContent = t.front; $('vBack').textContent = t.back; $('vSide').textContent = t.side;
  $('recenter').textContent = t.recenter; $('hint').textContent = t.hint;
  $('toggleNames').textContent = t.names; $('toggleNames').setAttribute('aria-pressed', state.names);
  $('speakLabel').textContent = t.listen; $('wikiLabel').textContent = t.wiki; $('hideLabel').textContent = t.hide;
  $('undoLabel').textContent = t.undo; $('showAll').textContent = t.showAll(state.hidden.length);
  $('undo').hidden = $('showAll').hidden = !state.hidden.length;
  $('cardClose').setAttribute('aria-label', t.close);
  $('status').textContent = failed ? t.error : t.loading; $('status').hidden = !failed && !pending && parts.length > 0;
  $('credits').innerHTML = t.credits;
  document.querySelectorAll('.lang button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === L));
  const nav = $('layers');
  if (!nav.children.length) for (const l of LAYERS) {
    const b = document.createElement('button'); b.className = 'layer'; b.dataset.layer = l.id;
    b.innerHTML = `<span aria-hidden="true">${l.icon}</span><span></span>`;
    b.addEventListener('click', () => {
      state.layers.has(l.id) ? state.layers.delete(l.id) : state.layers.add(l.id);
      if (state.selected && !visible(byId.get(state.selected))) state.selected = null;
      applyState();
    });
    nav.append(b);
  }
  for (const b of nav.children) {
    const l = LAYERS.find(x => x.id === b.dataset.layer);
    b.lastChild.textContent = l[L]; b.setAttribute('aria-pressed', state.layers.has(l.id));
  }
  for (const [id, el] of labelEls) el.b.textContent = byId.get(id)[L].name;
  for (const p of parts) if (p[L]) labelEl(p).b.textContent = p[L].name;
  const p = state.selected && byId.get(state.selected), card = $('card');
  card.hidden = !p;
  if (p) {
    const txt = p[L];
    $('cardLayer').textContent = p.layers.map(id => LAYERS.find(l => l.id === id)[L]).join(' · ');
    $('cardName').textContent = txt.name;
    $('cardText').textContent = txt.text;
    $('cardFact').hidden = !txt.fact;
    $('cardFact').innerHTML = txt.fact ? `<b>${t.fact}</b> ` : '';
    if (txt.fact) $('cardFact').append(txt.fact);
    $('wiki').href = `https://${L}.wikipedia.org/wiki/${encodeURIComponent(txt.wiki.replaceAll(' ', '_'))}`;
  }
}

function speak() {
  const p = byId.get(state.selected); if (!p) return;
  const txt = p[state.lang], u = new SpeechSynthesisUtterance([txt.name, txt.text, txt.fact].filter(Boolean).join('. '));
  u.lang = state.lang === 'fr' ? 'fr-FR' : 'en-GB';
  const voice = speechSynthesis.getVoices().find(v => v.lang.replace('_', '-').startsWith(state.lang));
  if (voice) u.voice = voice;
  u.rate = 0.92;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
if (!('speechSynthesis' in window)) $('speak').hidden = true;
$('speak').addEventListener('click', speak);
$('cardClose').addEventListener('click', () => select(null));
$('hide').addEventListener('click', hidePart);
$('undo').addEventListener('click', undoHide);
$('showAll').addEventListener('click', showAll);
document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', () => {
  state.lang = b.dataset.lang; store.set('lang', state.lang); if ('speechSynthesis' in window) speechSynthesis.cancel(); renderUI();
}));
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => goView(b.dataset.view)));
$('recenter').addEventListener('click', () => flyTo(home(), fitDistance(), new THREE.Vector3(0, 0, 1)));
$('toggleNames').addEventListener('click', () => { state.names = !state.names; renderUI(); });
$('explode').addEventListener('input', e => { state.explode = e.target.value / 100; });
addEventListener('keydown', e => {
  if (e.key === 'Escape') select(null);
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undoHide(); }
});

new ResizeObserver(fit).observe(stage);
renderer.setAnimationLoop(now => {
  if (tween) tween(now);
  controls.update();
  keepInBounds();
  placeGroups();
  renderer.render(scene, camera);
  layoutLabels();
});

renderUI();
fetch('data/parts.json').then(r => r.json()).then(data => {
  parts = data.parts;
  parts.forEach((p, i) => { p.index = i; p.groups = []; byId.set(p.id, p); });
  applyState();
}).catch(err => { console.error(err); failed = true; renderUI(); });

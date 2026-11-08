// Builds models/body.glb from BodyParts3D OBJ files + data/parts.json.
// Usage: node build-model.mjs <bp3d-dir> [--dry]
//   <bp3d-dir> holds isa_/partof_element_parts.txt and obj/{isa,partof}_BP3D_4.0_obj_99/*.obj
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const [dir, flag] = process.argv.slice(2);
const dry = flag === '--dry';
if (!dir) throw new Error('usage: node build-model.mjs <bp3d-dir> [--dry]');
const root = path.resolve(import.meta.dirname, '..');
const { parts } = JSON.parse(fs.readFileSync(path.join(root, 'data/parts.json'), 'utf8'));

// element file -> concept names; leaf = most specific concept (fewest elements)
const conceptFiles = new Map(), fileConcepts = new Map();
for (const fn of ['isa_element_parts.txt', 'partof_element_parts.txt']) {
  for (const line of fs.readFileSync(path.join(dir, fn), 'utf8').split(/\r?\n/).slice(1)) {
    const [, name, file] = line.split('\t');
    if (!file) continue;
    if (!conceptFiles.has(name)) conceptFiles.set(name, new Set());
    conceptFiles.get(name).add(file);
    if (!fileConcepts.has(file)) fileConcepts.set(file, new Set());
    fileConcepts.get(file).add(name);
  }
}
const leafOf = f => [...fileConcepts.get(f)].sort((a, b) => conceptFiles.get(a).size - conceptFiles.get(b).size)[0];
const full = s => new RegExp(`^(?:${s})$`, 'i');

function readObj(file) {
  for (const sub of ['isa_BP3D_4.0_obj_99', 'partof_BP3D_4.0_obj_99']) {
    const p = path.join(dir, 'obj', sub, file + '.obj');
    if (!fs.existsSync(p)) continue;
    const pos = [], idx = [];
    for (const l of fs.readFileSync(p, 'utf8').split('\n')) {
      if (l.startsWith('v ')) { const [, x, y, z] = l.split(/\s+/); pos.push(+x, +y, +z); }
      else if (l.startsWith('f ')) {
        const f = l.trim().split(/\s+/).slice(1).map(t => parseInt(t) - 1);
        for (let i = 1; i < f.length - 1; i++) idx.push(f[0], f[i], f[i + 1]);
      }
    }
    return { pos, idx };
  }
  throw new Error('missing obj ' + file);
}

// BP3D: mm, x = body left (+), y = back (+), z = up. Three: m, y up, body faces +z.
const C = [0, -101, 781.5];
const toThree = (x, y, z) => [(x - C[0]) / 1000, (z - C[2]) / 1000, -(y - C[1]) / 1000];
const sideOf = x => (x < -12 ? 'R' : x > 12 ? 'L' : 'C');

// The skin is a thick shell (outer + inner surface): keep only the connected surface holding the outermost vertex.
function outerShell(m) {
  const parent = new Int32Array(m.pos.length / 3).map((_, i) => i);
  const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (let t = 0; t < m.idx.length; t += 3) for (let e = 1; e < 3; e++) parent[find(m.idx[t + e])] = find(m.idx[t]);
  let minX = 0;
  for (let i = 0; i < parent.length; i++) if (m.pos[3 * i] < m.pos[3 * minX]) minX = i;
  const root = find(minX), idx = [];
  for (let t = 0; t < m.idx.length; t += 3) if (find(m.idx[t]) === root) idx.push(m.idx[t], m.idx[t + 1], m.idx[t + 2]);
  console.log(`skin: kept outer shell, ${idx.length / 3} of ${m.idx.length / 3} triangles`);
  return { pos: m.pos, idx };
}

// Smooth mannequin: remove the genital region of the skin and close it with a relaxed membrane.
function neuterSkin(m) {
  m = outerShell(m);
  const inBox = i => {
    const x = m.pos[3 * i], y = m.pos[3 * i + 1], z = m.pos[3 * i + 2];
    return ((x / 32) ** 2 + ((y + 148) / 62) ** 2 + ((z - 728) / 64) ** 2) < 1; // ellipsoid around the genitals
  };
  let kept = [];
  for (let t = 0; t < m.idx.length; t += 3) {
    const tri = m.idx.slice(t, t + 3);
    if (!tri.some(inBox)) kept.push(...tri);
  }
  kept = outerShell({ pos: m.pos, idx: kept }).idx; // drop floating leftovers
  // boundary edges near the cut, oriented as in their remaining triangle
  const count = new Map();
  for (let t = 0; t < kept.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = kept[t + e], b = kept[t + (e + 1) % 3], k = Math.min(a, b) + ',' + Math.max(a, b);
      count.set(k, (count.get(k) || 0) + 1);
    }
  const next = new Map();
  const near = i => Math.abs(m.pos[3 * i]) < 60 && m.pos[3 * i + 2] > 650 && m.pos[3 * i + 2] < 830;
  for (let t = 0; t < kept.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = kept[t + e], b = kept[t + (e + 1) % 3];
      if (count.get(Math.min(a, b) + ',' + Math.max(a, b)) === 1 && near(a)) next.set(a, b);
    }
  const loops = [];
  while (next.size) {
    const start = next.keys().next().value, loop = [];
    for (let v = start; next.has(v); ) { loop.push(v); const n = next.get(v); next.delete(v); v = n; }
    if (loop.length > 8) loops.push(loop);
  }
  if (!loops.length) throw new Error('skin: no hole found');
  const pos = m.pos.slice(), R = 8;
  for (const loop of loops) {
    const n = loop.length, c = [0, 0, 0];
    for (const v of loop) for (let k = 0; k < 3; k++) c[k] += pos[3 * v + k] / n;
    const ring = [loop];
    for (let r = 1; r < R; r++) {
      const t = r / R, row = [];
      for (const v of loop) { row.push(pos.length / 3); for (let k = 0; k < 3; k++) pos.push(pos[3 * v + k] * (1 - t) + c[k] * t); }
      ring.push(row);
    }
    const centre = pos.length / 3; pos.push(...c);
    for (let r = 0; r < R; r++)
      for (let i = 0; i < n; i++) {
        const a = ring[r][i], b = ring[r][(i + 1) % n];
        if (r === R - 1) { kept.push(b, a, centre); continue; }
        const a2 = ring[r + 1][i], b2 = ring[r + 1][(i + 1) % n];
        kept.push(b, a, a2, b, a2, b2);
      }
    // relax interior vertices (boundary ring fixed) into a smooth membrane
    const nb = new Map();
    const link = (a, b) => { (nb.get(a) || nb.set(a, []).get(a)).push(b); (nb.get(b) || nb.set(b, []).get(b)).push(a); };
    for (let r = 1; r < R; r++) for (let i = 0; i < n; i++) { link(ring[r][i], ring[r][(i + 1) % n]); link(ring[r][i], ring[r - 1][i]); if (r === R - 1) link(ring[r][i], centre); }
    const fixed = new Set(loop);
    for (let it = 0; it < 300; it++)
      for (const [v, ns] of nb) if (!fixed.has(v)) for (let k = 0; k < 3; k++) pos[3 * v + k] = ns.reduce((s, u) => s + pos[3 * u + k], 0) / ns.length;
    // cap triangles reuse each boundary edge reversed, so their winding already matches the skin
  }
  console.log(`skin: closed ${loops.length} hole(s), ${loops.map(l => l.length)} edges`);
  return { pos, idx: kept };
}

// Envelope around a cloud of meshes (BP3D lungs are only bronchial/vessel trees): distance field + surface nets.
function blob(g, r = 14, cell = 4, iso = 0.3) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < g.pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], g.pos[i + k]); mx[k] = Math.max(mx[k], g.pos[i + k]); }
  const o = mn.map(v => v - 2 * r), [nx, ny, nz] = mx.map((v, k) => Math.ceil((v + 2 * r - o[k]) / cell) + 1);
  const id = (x, y, z) => x + nx * (y + ny * z);
  let F = new Float32Array(nx * ny * nz);
  const R = Math.ceil(r / cell);
  for (let i = 0; i < g.pos.length; i += 3) {
    const c = [0, 1, 2].map(k => Math.round((g.pos[i + k] - o[k]) / cell));
    for (let z = c[2] - R; z <= c[2] + R; z++) for (let y = c[1] - R; y <= c[1] + R; y++) for (let x = c[0] - R; x <= c[0] + R; x++) {
      const d = Math.hypot(o[0] + x * cell - g.pos[i], o[1] + y * cell - g.pos[i + 1], o[2] + z * cell - g.pos[i + 2]);
      if (d < r) F[id(x, y, z)] = Math.max(F[id(x, y, z)], 1 - d / r);
    }
  }
  for (let pass = 0; pass < 2; pass++) { // box blur for a rounder surface
    const B = new Float32Array(F.length);
    for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
      let s = 0; for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += F[id(x + dx, y + dy, z + dz)];
      B[id(x, y, z)] = s / 27;
    }
    F = B;
  }
  const vid = new Int32Array(F.length).fill(-1), pos = [], idx = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    const v = corners.map(([a, b, c]) => F[id(x + a, y + b, z + c)]);
    if (v.every(f => f > iso) || v.every(f => f <= iso)) continue;
    const p = [0, 0, 0]; let n = 0;
    for (const [a, b] of edges) {
      if ((v[a] > iso) === (v[b] > iso)) continue;
      const t = (iso - v[a]) / (v[b] - v[a]);
      for (let k = 0; k < 3; k++) p[k] += corners[a][k] + t * (corners[b][k] - corners[a][k]);
      n++;
    }
    vid[id(x, y, z)] = pos.length / 3;
    pos.push(o[0] + (x + p[0] / n) * cell, o[1] + (y + p[1] / n) * cell, o[2] + (z + p[2] / n) * cell);
  }
  // one quad per grid edge crossing the surface, joining the 4 cells around it; winding faces outwards
  const axes = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const P = [x, y, z], f0 = F[id(x, y, z)] > iso;
    for (const [e, a, b] of axes) {
      const Q = P.slice(); Q[e]++;
      if ((F[id(...Q)] > iso) === f0) continue;
      const cell4 = [[-1, -1], [0, -1], [0, 0], [-1, 0]].map(([da, db]) => { const c = P.slice(); c[a] += da; c[b] += db; return vid[id(...c)]; });
      if (cell4.some(i => i < 0)) continue;
      const [q0, q1, q2, q3] = f0 ? cell4 : cell4.reverse();
      idx.push(q0, q1, q2, q0, q2, q3);
    }
  }
  return { pos, idx };
}

function tube(pts, radiusMm) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, pts.length * 12, radiusMm, 8, false);
  return { pos: [...g.attributes.position.array], idx: [...g.index.array] };
}

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;

// Per-element look, stored in COLOR_0: rgb = main axis of the element (muscle fibre direction, Three.js axes, 0..1),
// a = a stable random value the app turns into a slight tint so neighbouring elements stand apart.
const NEUTRAL = [0.5, 1, 0.5, 0.5];
// `fibre` (optional, Three.js axes, body's right side) overrides the guessed axis for fan-shaped muscles.
function elementLook(m, key, fibre) {
  const n = m.pos.length / 3, c = [0, 0, 0];
  for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) c[k] += m.pos[i + k] / n;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < m.pos.length; i += 3) {
    const d = [0, 1, 2].map(k => m.pos[i + k] - c[k]);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += d[a] * d[b];
  }
  let v = [0.3, 0.9, 0.2]; // power iteration: largest eigenvector of the covariance
  for (let it = 0; it < 30; it++) {
    const w = C.map(row => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]), l = Math.hypot(...w) || 1;
    v = w.map(x => x / l);
  }
  let axis = [v[0], v[2], -v[1]]; // BP3D -> Three.js axes
  if (fibre) { const l = Math.hypot(...fibre), side = c[0] > 0 ? -1 : 1; axis = [side * fibre[0] / l, fibre[1] / l, fibre[2] / l]; }
  let h = 2166136261; for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return [...axis.map(x => x * 0.5 + 0.5), (h >>> 0) / 2 ** 32];
}

const claimed = new Set();
const groups = []; // {part, side, pos, idx}
for (const p of parts) {
  const meshes = [];
  if (p.bp3d || p.leaf) {
    const only = p.only && full(p.only);
    const files = new Set();
    for (const [name, fs_] of conceptFiles) if (p.bp3d?.some(r => full(r).test(name))) fs_.forEach(f => files.add(f));
    if (p.leaf) for (const f of fileConcepts.keys()) if (p.leaf.some(r => full(r).test(leafOf(f)))) files.add(f);
    for (const f of files) {
      // an envelope (blob) may wrap elements already shown by another part, e.g. lungs around the bronchi
      if ((claimed.has(f) && !p.blob) || (only && ![...fileConcepts.get(f)].some(n => only.test(n)))) continue;
      if (!p.blob) claimed.add(f);
      meshes.push({ file: f, ...readObj(f) });
    }
    if (!meshes.length) throw new Error(`part ${p.id}: nothing selected`);
  }
  for (const t of p.tubes || []) {
    meshes.push(tube(t, p.radius || 2));
    if (p.mirror) meshes.push(tube(t.map(([x, y, z]) => [-x, y, z]), p.radius || 2));
  }
  if (!meshes.length) continue; // label-only part (skin landmarks)
  const bySide = {};
  meshes.forEach((m, mi) => {
    let sx = 0; for (let i = 0; i < m.pos.length; i += 3) sx += m.pos[i];
    const s = p.noSplit ? 'C' : sideOf(sx / (m.pos.length / 3));
    const g = (bySide[s] ||= { pos: [], idx: [], look: [] }), off = g.pos.length / 3;
    const look = elementLook(m, m.file || `${p.id}${mi}`, p.fibre);
    for (const v of m.pos) g.pos.push(v);
    for (const i of m.idx) g.idx.push(i + off);
    for (let i = 0; i < m.pos.length / 3; i++) g.look.push(...look);
  });
  for (const [side, g] of Object.entries(bySide)) {
    const out = p.id === 'skin' ? neuterSkin(g) : p.blob ? blob(g, p.blob) : g;
    // generated surfaces (skin cap, lung envelope) get the neutral look
    const look = p.blob ? [] : g.look.slice();
    while (look.length < out.pos.length / 3 * 4) look.push(...NEUTRAL);
    groups.push({ part: p.id, side, pos: out.pos, idx: out.idx, look });
  }
  console.log(p.id.padEnd(14), meshes.length, 'meshes', Object.keys(bySide).join(''),
    dry && meshes[0].file ? [...new Set(meshes.map(m => leafOf(m.file)))].slice(0, 6).join(' | ') : '');
}
if (dry) process.exit(0);

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('body');
let tris = 0;
for (const g of groups) {
  const v = new Float32Array(g.pos.length);
  for (let i = 0; i < g.pos.length; i += 3) v.set(toThree(g.pos[i], g.pos[i + 1], g.pos[i + 2]), i);
  let idx = new Uint32Array(g.idx);
  // keep full definition: only drop triangles whose removal moves the surface by less than half a millimetre
  const budget = 0;
  [idx] = MeshoptSimplifier.simplify(idx, v, 3, budget, 0.0005, ['ErrorAbsolute']);
  // drop vertices no longer referenced
  const remap = new Int32Array(v.length / 3).fill(-1), nv = [], nl = [];
  const ni = idx.map(i => {
    if (remap[i] < 0) { remap[i] = nv.push(v[3 * i], v[3 * i + 1], v[3 * i + 2]) / 3 - 1; for (let k = 0; k < 4; k++) nl.push(Math.round(g.look[4 * i + k] * 255)); }
    return remap[i];
  });
  tris += ni.length / 3;
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(nv)).setBuffer(buffer))
    .setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(new Uint8Array(nl)).setNormalized(true).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(ni)).setBuffer(buffer));
  const name = `${g.part}|${g.side}`;
  scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
}
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const out = path.join(root, 'models/body.glb');
await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder }).write(out, doc);
console.log(`${groups.length} meshes, ${tris} triangles, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);

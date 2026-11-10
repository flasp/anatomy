// Builds one model per layer from the Z-Anatomy FBX exports: models/<layer>.glb
// Usage: node build-body.mjs <dir with Regions.fbx, Muscular.fbx, Skeletal.fbx, Joints.fbx, Visceral.fbx, Lymphoid.fbx, Cardio.fbx, Nervous.fbx>
// Each part of data/parts.json picks its meshes with `za`: regexes on "File:group/path/name"; the first part that matches wins.
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import * as THREE from 'three';
import { loadFbx } from './fbx.mjs';

const dir = process.argv[2];
const root = path.resolve(import.meta.dirname, '..');
const { parts } = JSON.parse(fs.readFileSync(path.join(root, 'data/parts.json'), 'utf8'));
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;

// Z-Anatomy: cm, y up, body faces +z, its left is +x. Output: m, centred on the hips.
const SCALE = 0.01, CY = 0.95;
// Largest simplification error in metres, per layer: thin tubes and deep muscles can take more than the skin.
const ERR = { skin: 0.0002, muscles: 0.0004, blood: 0.00012, nerves: 0.00012, organs: 0.0003, bones: 0.0003 };

// Neutral mannequin: no genitals, no reproductive organs, nothing of the perineum. The ear models are non-commercial.
const EXCLUDE = /genital|penis|scrot|testic|testis|sperm|prostat|semin|deferen|epididym|ejaculat|clitor|vagin|uter(us|ine)|ovar|pudend|perine|urethr|(?<![a-z])anal|anorectal|pararectal|cremaster|cavernos|spongios|^Muscular:Pelvic_part|^Regions:Hairs|Urogenital_region|Sense_organsg\/Earg|Auditory_ossicles/i;
for (const [key, out] of [['Visceral:Digestive_canalg/Small_intestineg/Jejunum', false], ['Visceral:Urinary_systemg/Ureterl', false], ['Nervous:Spinal_cordg/Central_canal', false],
  ['Muscular:Pelvic_part_of_muscular_systemg/External_anal_sphincter', true], ['Visceral:Urinary_systemg/Urethra', true], ['Cardio:Arterial_systemg/Left_testicular_artery', true]])
  console.assert(EXCLUDE.test(key) === out, 'EXCLUDE is wrong for', key);

// Label anchors, muscle attachment patches on the bones, and the wrappings that would hide the muscles.
const SKIP_MAT = /^__DEFAULT$|^Origin|^End-|Muscular origin|Bursa|Fascia|capsule|Ligament|sheath/i;
// Colour class of a material, stored per vertex; the app owns the palette. 0 is the colour of the part.
const CLASS = [[/^Tendon/, 1], [/^Cartilage/, 2], [/^Teeth|^Dentine|^Eye$/, 3], [/^Iris/, 4], [/^Cornea/, 5], [/^Artery|^Pulmonary vein/, 6], [/^Vein|^Pulmonary artery/, 7]];
const classOf = mat => CLASS.find(([re]) => re.test(mat))?.[1] ?? 0;
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) % 256; };

// Triangles of one FBX mesh in world space, with the material name of each triangle.
function triangles(m) {
  const g = m.geometry, p = g.attributes.position, v = new THREE.Vector3();
  const flip = m.matrix.determinant() < 0; // mirrored right/left copies
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  const groups = g.groups.length ? g.groups : [{ start: 0, count: p.count, materialIndex: 0 }];
  const out = [];
  for (const gr of groups) {
    const mat = mats[gr.materialIndex]?.name ?? '';
    for (let i = gr.start; i < gr.start + gr.count; i += 3) {
      const tri = [0, 1, 2].map(k => { v.fromBufferAttribute(p, i + k).applyMatrix4(m.matrix); return [v.x * SCALE, v.y * SCALE - CY, v.z * SCALE]; });
      if (flip) tri.reverse();
      out.push({ tri, mat });
    }
  }
  return out;
}

// Weld identical positions; cls[i] is the highest colour class of the triangles at that vertex.
function weld(tris) {
  const ids = new Map(), pos = [], cls = [], idx = [];
  for (const { tri, mat } of tris) {
    const c = classOf(mat);
    const t = tri.map(p => {
      const k = p.map(x => Math.round(x * 1e5)).join(',');
      let i = ids.get(k);
      if (i === undefined) { i = pos.length / 3; ids.set(k, i); pos.push(p[0], p[1], p[2]); cls.push(0); }
      if (c > cls[i]) cls[i] = c;
      return i;
    });
    if (t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]) idx.push(t[0], t[1], t[2]);
  }
  return { pos, cls, idx };
}

// Close open boundary loops inside `near` with a relaxed membrane.
function capHoles(m, near) {
  const { pos, idx, cls } = m, count = new Map(), key = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const k = key(idx[t + e], idx[t + (e + 1) % 3]); count.set(k, (count.get(k) || 0) + 1); }
  // boundary edges grouped into connected outlines; an outline may branch, so it is never walked as a loop
  const edges = [], group = new Map(), find = v => { while (group.get(v) !== v) v = group.get(v); return v; };
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = idx[t + e], b = idx[t + (e + 1) % 3];
    if (count.get(key(a, b)) !== 1 || !near(pos[3 * a], pos[3 * a + 1], pos[3 * a + 2])) continue;
    edges.push([a, b]);
    for (const v of [a, b]) if (!group.has(v)) group.set(v, v);
    group.set(find(a), find(b));
  }
  const holes = new Map();
  for (const e of edges) { const g = find(e[0]); (holes.get(g) || holes.set(g, []).get(g)).push(e); }
  const R = 8, sizes = [];
  for (const hole of holes.values()) {
    if (hole.length <= 8) continue; // slivers between regions, not holes
    sizes.push(hole.length);
    const verts = [...new Set(hole.flat())], c = [0, 0, 0];
    for (const v of verts) for (let k = 0; k < 3; k++) c[k] += pos[3 * v + k] / verts.length;
    // ring[r] maps each outline vertex to its copy r steps towards the centre
    const ring = [new Map(verts.map(v => [v, v]))];
    for (let r = 1; r < R; r++) {
      const t = r / R, row = new Map();
      for (const v of verts) { row.set(v, pos.length / 3); cls.push(0); for (let k = 0; k < 3; k++) pos.push(pos[3 * v + k] * (1 - t) + c[k] * t); }
      ring.push(row);
    }
    const centre = pos.length / 3; pos.push(...c); cls.push(0);
    const nb = new Map(), link = (a, b) => { (nb.get(a) || nb.set(a, []).get(a)).push(b); (nb.get(b) || nb.set(b, []).get(b)).push(a); };
    for (let r = 0; r < R; r++) for (const [u, w] of hole) {
      const a = ring[r].get(u), b = ring[r].get(w);
      if (r === R - 1) { idx.push(b, a, centre); link(a, centre); } else { const a2 = ring[r + 1].get(u), b2 = ring[r + 1].get(w); idx.push(b, a, a2, b, a2, b2); link(a, a2); }
      link(a, b);
    }
    const fixed = new Set(verts);
    for (let it = 0; it < 300; it++) for (const [v, ns] of nb) if (!fixed.has(v)) for (let k = 0; k < 3; k++) pos[3 * v + k] = ns.reduce((s, u) => s + pos[3 * u + k], 0) / ns.length;
  }
  console.assert(sizes.length === 2, 'expected to close the groin and the crown, got', sizes);
  console.log(`skin: closed ${sizes.length} hole(s), ${sizes} edges`);
}

// Each skin region is a solidified shell: N outer triangles, then their N inner copies, then the rim.
// The "Skin-in" material does not mark every inner copy, so N is found by pairing triangles with their copies.
function outerCount(tris) {
  const T = tris.map(t => new THREE.Triangle(...t.tri.map(p => new THREE.Vector3(...p))));
  const mid = T.map(t => t.getMidpoint(new THREE.Vector3())), nor = T.map(t => t.getNormal(new THREE.Vector3()));
  const pair = (a, b) => nor[a].dot(nor[b]) < -0.7 && mid[a].distanceTo(mid[b]) < 0.02;
  for (let n = 1; 2 * n <= T.length; n++) if (pair(0, n) && pair(n - 1, 2 * n - 1) && pair(n >> 1, n + (n >> 1))) return n;
  return tris.length; // not a shell (nails): every triangle is outside
}

// One node per part and side; every source mesh is simplified on its own, then appended to its node.
const nodes = new Map(), claimed = new Map(parts.map(p => [p.id, 0]));
function add(part, side, name, m) {
  const v = new Float32Array(m.pos);
  const [idx] = MeshoptSimplifier.simplify(new Uint32Array(m.idx), v, 3, 0, ERR[part.layers[0]], ['ErrorAbsolute']);
  const key = `${part.id}|${side}`, n = nodes.get(key) || nodes.set(key, { part, pos: [], col: [], idx: [] }).get(key);
  const remap = new Int32Array(v.length / 3).fill(-1), shade = hash(name);
  for (const i of idx) {
    // COLOR_0: r = colour class, g = a shade per source mesh so that neighbours stay distinct
    if (remap[i] < 0) { remap[i] = n.pos.push(v[3 * i], v[3 * i + 1], v[3 * i + 2]) / 3 - 1; n.col.push(m.cls[i] * 30, shade, 0, 255); }
    n.idx.push(remap[i]);
  }
  claimed.set(part.id, claimed.get(part.id) + 1);
}

// --- skin: outer faces of every region, without hair and without the genital patches
{
  const tris = [], flat = [];
  for (const m of loadFbx(path.join(dir, 'Regions.fbx'))) {
    // only the hair and the genital patches go: dropping more skin regions here would leave holes in the body
    if (/^Hairs/.test(m.path) || /^Urogenital_region/.test(m.name) || /j$/.test(m.name) || !m.geometry.attributes.normal) continue;
    const all = triangles(m), n = outerCount(all);
    if (n === all.length) flat.push(m.name);
    for (const t of all.slice(0, n)) if (/^Skin-\d/.test(t.mat) || t.mat === 'Nail') tris.push(t);
  }
  console.log('skin: not shells:', flat.join(' '));
  const skin = weld(tris);
  // the groin (genital patches removed: neutral mannequin) and a slit the source leaves under the hair
  capHoles(skin, (x, y, z) => Math.abs(x) < 0.05 && ((y > -0.25 && y < -0.08 && z > -0.03) || y > 0.74));
  add(parts.find(p => p.id === 'skin'), 'C', 'skin', skin);
}

// --- everything else
const select = parts.filter(p => p.za && p.id !== 'skin').map(p => ({ p, re: p.za.map(s => new RegExp(s)) }));
const unclaimed = {};
for (const file of ['Muscular', 'Skeletal', 'Joints', 'Visceral', 'Lymphoid', 'Cardio', 'Nervous']) {
  for (const m of loadFbx(path.join(dir, file + '.fbx'))) {
    const key = `${file}:${m.path}/${m.name}`;
    if (EXCLUDE.test(key) || !m.geometry.attributes.normal) continue;
    const tris = triangles(m).filter(t => !SKIP_MAT.test(t.mat) && !(file === 'Muscular' && /Cartilage/.test(t.mat)));
    if (tris.length < 20) continue;
    const part = select.find(s => s.re.some(r => r.test(key)))?.p;
    if (!part) { const g = key.split('/').slice(0, 3).join('/'); unclaimed[g] = (unclaimed[g] || 0) + tris.length; continue; }
    const w = weld(tris), box = new THREE.Box3().setFromArray(w.pos), cx = (box.min.x + box.max.x) / 2;
    add(part, part.noSplit ? 'C' : cx > 0.01 ? 'L' : cx < -0.01 ? 'R' : 'C', m.name.replace(/[lr]$/, ''), w);
  }
}
for (const [id, n] of claimed) console.assert(n > 0 || !parts.find(p => p.id === id).za, 'no mesh for part', id);
for (const key of nodes.keys()) console.assert(!EXCLUDE.test(key), 'excluded name in output', key);
console.log('left out (triangles):', unclaimed);

// --- one file per layer: a part lives in the file of its first layer
for (const layer of Object.keys(ERR)) {
  const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene(layer);
  let tris = 0;
  for (const [name, n] of nodes) {
    if (n.part.layers[0] !== layer) continue;
    tris += n.idx.length / 3;
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(n.pos)).setBuffer(buffer))
      .setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(new Uint8Array(n.col)).setNormalized(true).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(n.idx)).setBuffer(buffer));
    scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
  }
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(root, `models/${layer}.glb`);
  await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder }).write(out, doc);
  console.log(`${layer}: ${tris} triangles, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
}

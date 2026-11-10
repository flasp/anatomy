// Loads a binary FBX in Node with three's FBXLoader and returns its meshes in world space.
import fs from 'node:fs';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// FBXLoader only touches the DOM for textures, which we do not use.
const img = () => ({ addEventListener() {}, removeEventListener() {}, style: {} });
globalThis.document ??= { createElementNS: img, createElement: img };
globalThis.window ??= globalThis;

export function loadFbx(file) {
  const buf = fs.readFileSync(file);
  const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    const path = [];
    for (let p = o.parent; p && p !== root; p = p.parent) path.unshift(p.name);
    meshes.push({ name: o.name, path: path.join('/'), geometry: o.geometry, material: o.material, matrix: o.matrixWorld });
  });
  return meshes;
}

// node fbx.mjs <file.fbx> : inventory
if (process.argv[1]?.endsWith('fbx.mjs')) {
  const meshes = loadFbx(process.argv[2]);
  const box = new THREE.Box3();
  let tris = 0;
  for (const m of meshes) {
    const n = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    tris += n;
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrix);
    box.union(b);
    const c = b.getCenter(new THREE.Vector3());
    const mats = [m.material].flat(), groups = m.geometry.groups.length ? m.geometry.groups : [{ count: n * 3, materialIndex: 0 }];
    const use = {};
    for (const g of groups) { const k = mats[g.materialIndex]?.name ?? ''; use[k] = (use[k] || 0) + g.count / 3; }
    console.log(`${String(n).padStart(7)}  [${c.x.toFixed(2)} ${c.y.toFixed(2)} ${c.z.toFixed(2)}]  ${m.path} :: ${m.name} :: ${Object.entries(use).map(([k, v]) => k + '=' + v).join(',')}`);
  }
  console.log(`${meshes.length} meshes, ${tris} triangles, bounds`, box.min.toArray().map(v => +v.toFixed(2)), box.max.toArray().map(v => +v.toFixed(2)));
}

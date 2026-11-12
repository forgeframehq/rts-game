// Shrinks a Meshy rig for the RTS: fewer triangles (meshoptimizer), paint moved from the texture to the vertices.
// node shrink.mjs in.glb out.glb [targetTris=3000]
import { NodeIO } from '@gltf-transform/core';
import { weld, prune, textureCompress, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [,, src, dst, tgt = '3000'] = process.argv;   // tgt 'anim': keep only the skeleton and its clips
await MeshoptSimplifier.ready;
const io = new NodeIO();
const doc = await io.read(src);
if (tgt === 'anim') {
  for (const n of doc.getRoot().listNodes()) { n.setMesh(null); n.setSkin(null); }
  for (const m of doc.getRoot().listMeshes()) m.dispose();
  for (const t of doc.getRoot().listTextures()) t.dispose();
  for (const m of doc.getRoot().listMaterials()) m.dispose();
  for (const k of doc.getRoot().listSkins()) k.dispose();
  await doc.transform(prune({ keepLeaves: true }));
  await io.write(dst, doc);
  console.log(dst, doc.getRoot().listAnimations().map(a => a.getName()).join(' '));
  process.exit(0);
}
await doc.transform(weld());
// Meshy paints its models on thousands of tiny texture islands, which do not survive heavy
// simplification. So the paint is copied onto the vertices first (COLOR_0, sRGB bytes) and the
// texture is dropped: at the size units are drawn, vertex colour holds all the detail that shows.
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const mat = prim.getMaterial(), texr = mat && mat.getBaseColorTexture(), uv = prim.getAttribute('TEXCOORD_0');
  if (!texr || !uv) continue;
  const S = 1024;
  const raw = await sharp(Buffer.from(texr.getImage())).resize(S, S).removeAlpha().raw().toBuffer();
  const n = uv.getCount(), col = new Uint8Array(n * 4), u = uv.getArray();
  for (let i = 0; i < n; i++) {
    const x = Math.min(S - 1, Math.max(0, Math.floor((u[i * 2] % 1 + 1) % 1 * S))), y = Math.min(S - 1, Math.max(0, Math.floor((u[i * 2 + 1] % 1 + 1) % 1 * S)));
    const o = (y * S + x) * 3;
    col[i * 4] = raw[o]; col[i * 4 + 1] = raw[o + 1]; col[i * 4 + 2] = raw[o + 2]; col[i * 4 + 3] = 255;
  }
  prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setNormalized(true).setArray(col));
  prim.setAttribute('TEXCOORD_0', null);
  mat.setBaseColorTexture(null);
}
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
  const ind = new Uint32Array(idx.getArray()), p = new Float32Array(pos.getArray());
  const want = Math.min(ind.length, (+tgt) * 3);
  // the careful simplifier first; it stops early on Meshy's many texture seams, so finish with the sloppy one
  let [out] = MeshoptSimplifier.simplify(ind, p, 3, Math.max(want, 0), 0.05, []);
  if (out.length > want * 1.3) [out] = MeshoptSimplifier.simplifySloppy(out, p, 3, null, want, 0.08);
  // keep only the vertices the remaining triangles use
  const map = new Int32Array(pos.getCount()).fill(-1); let n = 0;
  const ni = new Uint32Array(out.length);
  for (let i = 0; i < out.length; i++) { const v = out[i]; if (map[v] < 0) map[v] = n++; ni[i] = map[v]; }
  for (const sem of prim.listSemantics()) {
    const a = prim.getAttribute(sem), es = a.getElementSize(), old = a.getArray(), na = new old.constructor(n * es);
    for (let v = 0; v < map.length; v++) if (map[v] >= 0) for (let k = 0; k < es; k++) na[map[v] * es + k] = old[v * es + k];
    prim.setAttribute(sem, a.clone().setArray(na));
  }
  prim.setIndices(idx.clone().setArray(n > 65535 ? ni : new Uint16Array(ni)));
}
await doc.transform(prune(), dedup());
await io.write(dst, doc);
let t = 0; for (const m of doc.getRoot().listMeshes()) for (const pr of m.listPrimitives()) t += pr.getIndices().getCount() / 3;
console.log(dst, 'tris', t);

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import draco from 'draco3dgltf';
import sharp from 'sharp';
import { mkdir, readFile, writeFile, stat, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const inputs = {
  'apollo-11': 'public/models/apollo-11-lm/scene.gltf',
  'viking-1': 'assets/Viking Lander.glb',
  'mars-pathfinder': 'assets/Pathfinder_&_Sojourner.glb',
  'mars-exploration-rovers': 'assets/mars_exploration_rover.glb',
  insight: 'assets/24880_InSight_deployed.glb',
  ingenuity: 'assets/25043_Ingenuity_v3.glb',
  'pioneer-10': 'assets/Pioneer 10.glb',
  'near-shoemaker': 'assets/NEAR Shoemaker.glb',
};
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
  'draco3d.decoder': await draco.createDecoderModule(),
});
const output = 'public/models/optimized';
await mkdir(output, { recursive: true });
const manifest = {};
for (const [slug, input] of Object.entries(inputs)) {
  let sourceBytes = (await stat(input)).size;
  if (input.endsWith('.gltf')) {
    const json = JSON.parse(await readFile(input, 'utf8'));
    const uris = new Set([...json.buffers ?? [], ...json.images ?? []].map(x => x.uri).filter(x => x && !x.startsWith('data:')));
    for (const uri of uris) sourceBytes += (await stat(resolve(dirname(input), uri))).size;
  }
  const doc = await io.read(input);
  for (const texture of doc.getRoot().listTextures()) {
    if (!texture.getImage()?.length) throw new Error(`${slug}: missing texture ${texture.getName()}`);
  }
  await doc.transform(dedup(), prune(), weld());
  if (slug === 'apollo-11') await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: 0.75, error: 0.001 }));
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 85, slots: /^(?!normalTexture).*$/ }),
    textureCompress({ encoder: sharp, targetFormat: 'png', resize: [2048, 2048], slots: /^normalTexture$/ }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === 'KHR_draco_mesh_compression') ext.dispose();
  await doc.transform(prune());
  const bytes = await io.writeBinary(doc);
  const file = `${output}/${slug}.glb`;
  await writeFile(file, bytes);
  const jsonLength = new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  if ([...json.buffers ?? [], ...json.images ?? []].some(x => x.uri)) throw new Error(`${slug}: external resource`);
  if (json.extensionsRequired?.includes('KHR_draco_mesh_compression')) throw new Error(`${slug}: Draco remains`);
  const decoded = await io.read(file);
  if (!decoded.getRoot().listMeshes().length) throw new Error(`${slug}: no meshes`);
  manifest[slug] = { src: `/models/optimized/${slug}.glb`, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'), sourceBytes };
}
const totals = Object.values(manifest).reduce((a, x) => ({ sourceBytes: a.sourceBytes + x.sourceBytes, bytes: a.bytes + x.bytes }), { sourceBytes: 0, bytes: 0 });
if (totals.bytes >= totals.sourceBytes) throw new Error('Aggregate optimization did not reduce bytes');
await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
await copyFile('public/models/apollo-11-lm/license.txt', `${output}/apollo-11-license.txt`);
console.table([...Object.entries(manifest).map(([slug, x]) => ({ slug, sourceBytes: x.sourceBytes, bytes: x.bytes })), { slug: 'TOTAL', ...totals }]);

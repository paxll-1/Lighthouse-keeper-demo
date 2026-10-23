import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';

// Authored models are metre-scale, +Y up, grounded at the origin and face +Z.
// Animation is in place: only the game may move an actor through the world.
export const AUTHORED_MANIFEST = Object.freeze({
  keeper: Object.freeze({ url: './assets/models/keeper.glb', requiredClips: Object.freeze(['Idle', 'Walk', 'Chop', 'Saw', 'CarryIdle', 'CarryWalk', 'Sit', 'Repair', 'Collect']), requiredBones: Object.freeze(['hand.L', 'hand.R']), maxInstances: 1, maxTriangles: 24000, maxMaterials: 2, maxMeshes: 4,
    dimension: 'height', expectedSize: 2.02, sizeTolerance: .15 }),
  crab: Object.freeze({ url: './assets/models/crab.glb', requiredClips: Object.freeze(['Idle', 'Scuttle', 'Retreat', 'Emerge']), maxInstances: 4, maxTriangles: 12000, maxMaterials: 1, maxMeshes: 4,
    dimension: 'width', expectedSize: .63, sizeTolerance: .2 }),
});

export class AuthoredAssetError extends Error {
  constructor(message, cause) { super(message, { cause }); this.name = 'AuthoredAssetError'; }
}

export function inspectGLB(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 20) throw new AuthoredAssetError('Expected a complete binary glTF 2.0 file.');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) throw new AuthoredAssetError('Invalid GLB 2.0 header or truncated file.');
  if (view.getUint32(16, true) !== 0x4e4f534a) throw new AuthoredAssetError('GLB must begin with its JSON manifest.');
  const length = view.getUint32(12, true);
  if (length > buffer.byteLength - 20) throw new AuthoredAssetError('GLB JSON chunk exceeds file length.');
  let json;
  try { json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length))); }
  catch (error) { throw new AuthoredAssetError('Invalid GLB JSON.', error); }
  // No texture servers, decoder downloads or implicit network dependencies.
  for (const resource of [...(json.buffers || []), ...(json.images || [])]) if (resource.uri) throw new AuthoredAssetError('Authored GLB resources must be embedded in the binary file.');
  const unsupported = (json.extensionsRequired || []).filter(name => !['KHR_materials_unlit'].includes(name));
  if (unsupported.length) throw new AuthoredAssetError(`Unsupported required GLB extensions: ${unsupported.join(', ')}`);
  return json;
}

export function validateAuthoredAsset(kind, gltf, spec) {
  if (!gltf?.scene?.isObject3D) throw new AuthoredAssetError(`${kind}: no native Three scene.`);
  const geometries = new Set(), materials = new Set(), bones = new Set();
  let meshes = 0, skinnedMeshes = 0, triangles = 0;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(node => {
    if (node.isLight || node.isCamera) throw new AuthoredAssetError(`${kind}: asset may not override the game's camera or light rig.`);
    if (!node.isMesh) return;
    meshes++;
    const geometry = node.geometry, position = geometry?.getAttribute('position'), normal = geometry?.getAttribute('normal');
    if (!position || !normal || normal.count !== position.count) throw new AuthoredAssetError(`${kind}/${node.name}: authored vertex normals are required.`);
    if (Array.from(position.array).some(n => !Number.isFinite(n)) || Array.from(normal.array).some(n => !Number.isFinite(n))) throw new AuthoredAssetError(`${kind}/${node.name}: non-finite vertex data.`);
    geometries.add(geometry); triangles += (geometry.index?.count || position.count) / 3;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material || !(material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)) throw new AuthoredAssetError(`${kind}/${node.name}: use authored glTF metallic/roughness materials.`);
      materials.add(material);
    }
    if (node.isSkinnedMesh) {
      skinnedMeshes++;
      const weights = geometry.getAttribute('skinWeight'), indices = geometry.getAttribute('skinIndex');
      if (!node.skeleton?.bones.length || !weights || !indices || weights.count !== position.count || indices.count !== position.count) throw new AuthoredAssetError(`${kind}/${node.name}: incomplete native skin and rig.`);
      node.skeleton.bones.forEach(bone => bones.add(bone));
      for (let i = 0; i < weights.count; i++) {
        let total = 0;
        for (let j = 0; j < 4; j++) {
          const weight = weights.getComponent(i, j), index = indices.getComponent(i, j);
          if (!Number.isFinite(weight) || weight < 0 || !Number.isInteger(index) || index < 0 || index >= node.skeleton.bones.length) throw new AuthoredAssetError(`${kind}/${node.name}: invalid skin influence.`);
          total += weight;
        }
        if (Math.abs(total - 1) > .01) throw new AuthoredAssetError(`${kind}/${node.name}: skin weights must sum to one.`);
      }
    }
  });
  if (!meshes || !skinnedMeshes) throw new AuthoredAssetError(`${kind}: an authored SkinnedMesh is required.`);
  for (const name of spec.requiredBones || []) if (![...bones].some(bone => bone.name === name || bone.userData.name === name)) throw new AuthoredAssetError(`${kind}: missing attachment bone ${name}.`);
  if (meshes > spec.maxMeshes || triangles > spec.maxTriangles || materials.size > spec.maxMaterials) throw new AuthoredAssetError(`${kind}: asset exceeds its mesh/material/triangle budget.`);
  const clips = gltf.animations || [], names = clips.map(clip => clip.name);
  if (new Set(names).size !== names.length) throw new AuthoredAssetError(`${kind}: duplicate clip names.`);
  for (const name of spec.requiredClips) if (!names.includes(name)) throw new AuthoredAssetError(`${kind}: missing named animation ${name}.`);
  for (const clip of clips) if (!clip.name || !(clip.duration > 0) || !clip.tracks.length || !clip.validate()) throw new AuthoredAssetError(`${kind}: invalid named animation clip.`);
  const box = new THREE.Box3().setFromObject(gltf.scene, true), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const dimension = spec.dimension === 'width' ? size.x : size.y;
  if (!(dimension > 0) || Math.abs(dimension - spec.expectedSize) > spec.expectedSize * spec.sizeTolerance) throw new AuthoredAssetError(`${kind}: ${spec.dimension} ${dimension.toFixed(3)}m disagrees with manifest ${spec.expectedSize}m.`);
  if (Math.abs(box.min.y) > .12 || Math.abs(center.x) > .2 || Math.abs(center.z) > .25) throw new AuthoredAssetError(`${kind}: origin must be grounded and centered in the authored bind pose.`);
  return Object.freeze({ kind, meshes, skinnedMeshes, bones: bones.size, triangles, materials: materials.size, geometries: geometries.size,
    clips: names, attachments: (spec.requiredBones || []).slice(), bounds: { min: box.min.toArray(), max: box.max.toArray(), size: size.toArray() }, expectedSize: spec.expectedSize, dimension: spec.dimension });
}

export function disposeAuthoredAssets(assets) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  for (const asset of Object.values(assets || {})) asset.scene?.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.skeleton) skeletons.add(node.skeleton);
    for (const material of node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const item of [...skeletons, ...geometries, ...materials, ...textures]) item.dispose();
}

export async function loadAuthoredAssets({ manifest = AUTHORED_MANIFEST, baseURL = import.meta.url, build, onProgress } = {}) {
  const loader = new GLTFLoader(), assets = {};
  try {
    // Sequential bounded loads keep peak parse memory predictable on mobile.
    for (const [kind, spec] of Object.entries(manifest)) {
      onProgress?.({ kind, stage: 'loading' });
      const url = new URL(spec.url, baseURL);
      if (build !== undefined && build !== null && build !== '') url.searchParams.set('build', String(build));
      const response = await fetch(url);
      if (!response.ok) throw new AuthoredAssetError(`${kind}: failed to load GLB (${response.status}).`);
      const buffer = await response.arrayBuffer(); inspectGLB(buffer);
      const gltf = await loader.parseAsync(buffer, new URL('.', url).href);
      // Own it before validation so partial failure releases all parsed assets.
      assets[kind] = { scene: gltf.scene, animations: gltf.animations, spec, url: url.href };
      assets[kind].report = validateAuthoredAsset(kind, gltf, spec);
      onProgress?.({ kind, stage: 'ready', report: assets[kind].report });
    }
    return Object.freeze(assets);
  } catch (error) {
    disposeAuthoredAssets(assets);
    throw error instanceof AuthoredAssetError ? error : new AuthoredAssetError(`Authored asset loading failed: ${error.message}`, error);
  }
}

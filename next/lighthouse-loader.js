import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { AuthoredAssetError, inspectGLB, disposeAuthoredAssets } from './asset-loader.js';

// A static building has a separate contract: actor skin/clip validation stays
// strict, and this asset may not install cameras, lights or animation owners.
export const LIGHTHOUSE_SPEC = Object.freeze({ url: './assets/models/lighthouse.glb', maxHeight: 7.5,
  lods: Object.freeze({ LighthouseNear: Object.freeze({ maxTriangles: 12000, maxDraws: 6 }), LighthouseFar: Object.freeze({ maxTriangles: 2500, maxDraws: 3 }) }) });
export const authoredName = node => node.userData?.name || node.name;
export const isLightCore = node => /^LightCore(?:[._]\d+)?$/.test(authoredName(node));

export function galleryState(node, root) {
  for (let parent = node; parent && parent !== root; parent = parent.parent) {
    if (authoredName(parent) === 'GalleryBroken') return 'broken';
    if (authoredName(parent) === 'GalleryRepaired') return 'repaired';
  }
  return null;
}

export function validateLighthouseAsset(gltf, spec = LIGHTHOUSE_SPEC) {
  const fail = message => { throw new AuthoredAssetError(`lighthouse: ${message}`); };
  if (!gltf?.scene?.isObject3D) fail('no native Three scene.');
  if (gltf.animations?.length) fail('static building may not contain animation clips.');
  const scene = gltf.scene, meshes = [], materials = new Set(), geometries = new Set(), lods = {};
  const identity = new THREE.Matrix4(); scene.updateMatrixWorld(true);
  if (!scene.matrix.equals(identity)) fail('scene root must have identity transform.');
  for (const name of Object.keys(spec.lods)) {
    const roots = scene.children.filter(node => authoredName(node) === name);
    if (roots.length !== 1 || !roots[0].matrix.equals(identity)) fail(`expected one identity ${name} root.`);
    const root = roots[0], groups = {};
    for (const state of ['Broken', 'Repaired']) {
      const found = []; root.traverse(node => { if (authoredName(node) === `Gallery${state}`) found.push(node); });
      if (found.length !== 1) fail(`${name}: expected one Gallery${state} subtree.`);
      groups[state.toLowerCase()] = found[0];
    }
    let cores = 0; const coreMaterials = new Set(), otherMaterials = new Set(), counts = { broken: { triangles: 0, draws: 0 }, repaired: { triangles: 0, draws: 0 } };
    root.traverse(node => {
      if (node.isLight || node.isCamera || node.isBone || node.isSkinnedMesh) fail('only static meshes are allowed; no rig/camera/light.');
      if (isLightCore(node)) cores++;
      if (!node.isMesh) return;
      meshes.push(node); geometries.add(node.geometry);
      const position = node.geometry?.getAttribute('position'), normal = node.geometry?.getAttribute('normal');
      if (!position || !normal || position.count !== normal.count || !position.count) fail(`${node.name}: authored vertex normals are required.`);
      for (const attribute of [position, normal]) for (const value of attribute.array) if (!Number.isFinite(value)) fail(`${node.name}: non-finite vertex data.`);
      const index = node.geometry.index;
      if ((index?.count || position.count) % 3) fail(`${node.name}: incomplete triangles.`);
      if (index) for (const value of index.array) if (!Number.isInteger(value) || value < 0 || value >= position.count) fail(`${node.name}: invalid triangle index.`);
      const slots = Array.isArray(node.material) ? node.material : [node.material];
      let core = false; for (let parent = node; parent && parent !== root; parent = parent.parent) if (isLightCore(parent)) core = true;
      for (const material of slots) {
        if (!material?.isMeshStandardMaterial) fail(`${node.name}: authored PBR materials required.`);
        for (const value of Object.values(material)) if (value?.isTexture) fail('this bounded building uses embedded vertex colours, without textures.');
        materials.add(material);
        (core ? coreMaterials : otherMaterials).add(material);
      }
      const state = galleryState(node, root), triangles = (index?.count || position.count) / 3, draws = Array.isArray(node.material) ? node.geometry.groups.length : 1;
      for (const variant of ['broken', 'repaired']) if (!state || state === variant) { counts[variant].triangles += triangles; counts[variant].draws += draws; }
    });
    if (!cores) fail(`${name}: missing LightCore.`);
    if (!coreMaterials.size || [...coreMaterials].some(material => otherMaterials.has(material) || material.emissive.getHex() === 0)) fail(`${name}: LightCore needs a dedicated emissive material.`);
    for (const [state, count] of Object.entries(counts)) if (!count.draws || count.triangles > spec.lods[name].maxTriangles || count.draws > spec.lods[name].maxDraws) fail(`${name}/${state}: exceeds triangle/draw budget.`);
    for (const [state, group] of Object.entries(groups)) {
      if (!meshes.some(node => galleryState(node, root) === state && group.getObjectById(node.id))) fail(`${name}: empty ${state} gallery.`);
      const box = new THREE.Box3().setFromObject(group, true);
      if (box.max.y > 6.4) fail(`${name}/${state}: gallery must keep the frozen 6.8m eye clear.`);
    }
    const box = new THREE.Box3().setFromObject(root, true);
    if (box.min.y < -.025 || box.max.y > spec.maxHeight || box.max.y < 6 || box.min.x < -2.08 || box.max.x > 2.08 || box.min.z < -1.35 || box.max.z > 2.08) fail(`${name}: bounds disagree with the retained tower/gallery placement.`);
    // Outside the explicitly tagged timber gallery the original tower footprint
    // remains inside the existing navigation obstacle.
    root.traverse(node => {
      if (!node.isMesh || galleryState(node, root)) return;
      const attribute = node.geometry.getAttribute('position'), point = new THREE.Vector3();
      for (let i = 0; i < attribute.count; i++) {
        point.fromBufferAttribute(attribute, i).applyMatrix4(node.matrixWorld);
        if (Math.hypot(point.x, point.z) > 1.31) fail(`${name}: tower exceeds retained footprint.`);
      }
    });
    lods[name] = { ...counts, bounds: { min: box.min.toArray(), max: box.max.toArray() } };
  }
  if (scene.children.some(node => !Object.hasOwn(spec.lods, authoredName(node)))) fail('unexpected root outside the two static LODs.');
  return Object.freeze({ kind: 'lighthouse', static: true, skinnedMeshes: 0, clips: [], meshes: meshes.length, geometries: geometries.size, materials: materials.size, lods });
}

export async function loadLighthouseAsset({ spec = LIGHTHOUSE_SPEC, baseURL = import.meta.url, build, onProgress } = {}) {
  let asset;
  try {
    onProgress?.({ kind: 'lighthouse', stage: 'loading' });
    const url = new URL(spec.url, baseURL);
    if (build !== undefined && build !== null && build !== '') url.searchParams.set('build', String(build));
    const response = await fetch(url);
    if (!response.ok) throw new AuthoredAssetError(`lighthouse: failed to load GLB (${response.status}).`);
    const buffer = await response.arrayBuffer(); inspectGLB(buffer);
    const gltf = await new GLTFLoader().parseAsync(buffer, new URL('.', url).href);
    asset = { scene: gltf.scene, animations: gltf.animations, spec, url: url.href };
    asset.report = validateLighthouseAsset(gltf, spec);
    onProgress?.({ kind: 'lighthouse', stage: 'ready', report: asset.report });
    return Object.freeze(asset);
  } catch (error) {
    if (asset) disposeAuthoredAssets({ lighthouse: asset });
    throw error instanceof AuthoredAssetError ? error : new AuthoredAssetError(`lighthouse: asset loading failed: ${error.message}`, error);
  }
}

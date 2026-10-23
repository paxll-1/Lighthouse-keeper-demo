import * as THREE from './vendor/three.module.min.js';
import { bridgeAuthoredMaterial } from './authored-renderer.js';
import { disposeAuthoredAssets } from './asset-loader.js';
import { authoredName, galleryState, isLightCore } from './lighthouse-loader.js';

const PLACEMENT = Object.freeze([10, 0, -7]);
const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const visible = node => { for (let parent = node; parent; parent = parent.parent) if (!parent.visible) return false; return true; };

// Preserve the existing small dither window when the keeper passes behind the
// building. This is static-occluder presentation only; picking remains solid.
// Actors retain their untouched shader bridge and separate program cache key.
export function bridgeLighthouseMaterial(source, shared, focus, quality = 'standard', focusEnabled = true) {
  // Broad matte plaster/stone/timber need diffuse form shading, not a PBR
  // specular evaluation on every magnified pixel. Preserve the authored PBR
  // master; metal/glass/optic retain Standard in normal quality.
  const diffuse = source.name === 'lighthouseSurface' || source.name === 'lighthouseGallery';
  const material = bridgeAuthoredMaterial(source, shared, diffuse ? 'lighter' : quality), compile = material.onBeforeCompile, programKey = material.customProgramCacheKey;
  material.onBeforeCompile = shader => {
    compile(shader);
    if (!focusEnabled) return;
    Object.assign(shader.uniforms, focus);
    shader.fragmentShader = 'uniform vec3 uFocus;\nuniform float uDpr;\nuniform float uLighthouseFocusScale;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      if (uFocus.z > 0.0 && vArtWorld.y > 0.7 && vArtDepth < uFocus.z - 0.35) {
        vec2 p = (gl_FragCoord.xy / uDpr - uFocus.xy) / (vec2(27.0, 44.0) * uLighthouseFocusScale);
        float fade = 0.68 * (1.0 - smoothstep(0.72, 1.08, length(p)));
        vec2 cell = floor(gl_FragCoord.xy / uDpr);
        float pattern = mod(cell.x + mod(cell.y, 2.0) * 2.0, 4.0) / 4.0;
        if (fade > 0.0 && pattern < fade) discard;
      }`);
  };
  material.customProgramCacheKey = () => `${programKey()}:static-lighthouse-focus-v2:${focusEnabled ? 'opaque' : 'clear'}`;
  return material;
}

// Pixel height, rather than orbit distance, also responds to optical zoom,
// viewport height and the existing off-axis native camera.
export function projectedBuildingHeight(camera, viewportHeight, corners, point = new THREE.Vector3()) {
  let minY = Infinity, maxY = -Infinity, minDepth = Infinity, maxDepth = -Infinity;
  for (const corner of corners) {
    point.copy(corner).applyMatrix4(camera.matrixWorldInverse);
    const depth = -point.z; minDepth = Math.min(minDepth, depth); maxDepth = Math.max(maxDepth, depth);
    point.applyMatrix4(camera.projectionMatrix); minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
  }
  if (maxDepth < camera.near || minDepth > camera.far) return 0;
  if (minDepth <= camera.near) return Infinity;
  return Math.max(0, maxY - minY) * viewportHeight / 2;
}

export class LighthouseRenderer {
  constructor(scene, camera, asset, sharedUniforms, focusUniforms) {
    if (!asset?.report?.static || !camera?.isPerspectiveCamera || !sharedUniforms?.uArtNight || !focusUniforms?.uFocus || !focusUniforms?.uDpr) throw new Error('Static lighthouse requires its validated asset, existing camera and shared lighting/focus uniforms.');
    this.scene = scene; this.camera = camera; this.asset = asset; this.uniforms = sharedUniforms;
    this.focusScale = { value: 1 };
    const boundedFocus = { ...focusUniforms, uLighthouseFocusScale: this.focusScale };
    this.object = asset.scene.clone(true);
    this.group = new THREE.Group(); this.group.name = 'authored-lighthouse'; this.group.position.fromArray(PLACEMENT); this.group.add(this.object); scene.add(this.group);
    this.lods = {}; this.meshes = []; this.bindings = []; this.materials = new Map(); this.lighterMaterials = new Map(); this.cores = new Set();
    this.quality = 'standard'; this.lod = null; this.galleryRepaired = false; this.night = 0; this.projectedHeight = 0; this.switches = 0; this.frames = 0; this.disposed = false; this.lastPick = null;
    this.raycaster = new THREE.Raycaster(); this.origin = new THREE.Vector3(); this.direction = new THREE.Vector3(); this.scratch = new THREE.Vector3();
    for (const name of ['LighthouseNear', 'LighthouseFar']) {
      const root = this.object.children.find(node => authoredName(node) === name); this.lods[name] = root;
      root.traverse(node => {
        if (!node.isMesh) return;
        const state = galleryState(node, root); node.userData.lighthouseTag = state ? 'gallery' : 'lighthouse';
        this.meshes.push(node);
        let core = false; for (let parent = node; parent && parent !== root; parent = parent.parent) if (isLightCore(parent)) core = true;
        const sources = Array.isArray(node.material) ? node.material : [node.material];
        for (const source of sources) {
          if (!this.materials.has(source)) {
            const focusEnabled = !core && !source.transparent;
            this.materials.set(source, bridgeLighthouseMaterial(source, sharedUniforms, boundedFocus, 'standard', focusEnabled)); this.lighterMaterials.set(source, bridgeLighthouseMaterial(source, sharedUniforms, boundedFocus, 'lighter', focusEnabled));
            // Clear panes keep the opaque frame/core depth intact and remain a
            // single transparent draw even when the authored pane is two-sided.
            if (source.transparent) for (const material of [this.materials.get(source), this.lighterMaterials.get(source)]) { material.depthWrite = false; material.forceSinglePass = true; }
          }
          if (core) for (const material of [this.materials.get(source), this.lighterMaterials.get(source)]) this.cores.add(material);
        }
        const standard = sources.map(source => this.materials.get(source)), lighter = sources.map(source => this.lighterMaterials.get(source));
        this.bindings.push({ node, standard: Array.isArray(node.material) ? standard : standard[0], lighter: Array.isArray(node.material) ? lighter : lighter[0] });
        node.material = this.bindings[this.bindings.length - 1].standard;
      });
    }
    const bounds = asset.report.lods.LighthouseNear.bounds, box = new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max));
    this.corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) this.corners.push(new THREE.Vector3(x + 10, y, z - 7));
    this.group.visible = false;
  }

  begin() { if (!this.disposed) this.group.visible = false; }

  draw({ galleryRepaired = false, night = 0, selected = null } = {}) {
    if (this.disposed) return false;
    this.group.visible = true; this.galleryRepaired = galleryRepaired === true; this.night = clamp(night); this.frames++;
    this.selected = selected === 'light' || selected === 'gallery-repair' || selected === 'gallery-view' ? selected : null;
    for (const root of Object.values(this.lods)) root.traverse(node => {
      const name = authoredName(node);
      if (name === 'GalleryBroken') node.visible = !this.galleryRepaired;
      if (name === 'GalleryRepaired') node.visible = this.galleryRepaired;
    });
    for (const material of this.cores) material.emissiveIntensity = .08 + this.night * 1.42;
    return true;
  }

  environment({ quality = 'standard', height = 1, hover = null, keeperPixels = 80 } = {}) {
    if (this.disposed) return;
    // The inherited 88px opening must not erase a 75px distant tower around a
    // 12px keeper. Keep the original close-view cap and solid action picking.
    this.focusScale.value = Math.max(.12, Math.min(1, (Number.isFinite(keeperPixels) ? keeperPixels : 0) / 80));
    const nextQuality = quality === 'lighter' ? 'lighter' : 'standard';
    if (this.quality !== nextQuality) {
      this.quality = nextQuality;
      for (const binding of this.bindings) binding.node.material = binding[this.quality === 'lighter' ? 'lighter' : 'standard'];
    }
    this.hover = hover === 'lighthouse' || hover === 'gallery' ? hover : null;
    this.projectedHeight = projectedBuildingHeight(this.camera, height, this.corners, this.scratch);
    const threshold = this.quality === 'lighter' ? 230 : 150, lower = threshold * .82, upper = threshold * 1.18;
    const next = this.lod === null ? (this.projectedHeight >= threshold ? 'near' : 'far')
      : this.lod === 'near' ? (this.projectedHeight < lower ? 'far' : 'near') : (this.projectedHeight > upper ? 'near' : 'far');
    if (next !== this.lod) { this.lod = next; this.switches++; }
    this.lods.LighthouseNear.visible = this.lod === 'near'; this.lods.LighthouseFar.visible = this.lod === 'far';
    this.group.updateMatrixWorld(true);
  }

  // Only the current visible static variant participates. Transparent panes and
  // the lamp core do not hide actionable surfaces through clear glass.
  pick(eye, ray, rawHit) {
    if (this.disposed || !this.group.visible) return rawHit;
    this.origin.fromArray(eye); this.direction.fromArray(ray);
    const length = this.direction.length(); this.direction.divideScalar(length);
    this.raycaster.set(this.origin, this.direction); this.raycaster.camera = this.camera;
    const intersections = this.raycaster.intersectObjects(this.meshes.filter(visible), false);
    let native = null;
    for (const hit of intersections) {
      const material = Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material;
      if (!material.visible || material.transparent || material.opacity < .5) continue;
      let core = false; for (let node = hit.object; node && node !== this.group; node = node.parent) if (isLightCore(node)) core = true;
      if (core) continue;
      const depth = -this.scratch.copy(hit.point).applyMatrix4(this.camera.matrixWorldInverse).z;
      if (depth < this.camera.near || depth > this.camera.far) continue;
      native = { tag: hit.object.userData.lighthouseTag, distance: hit.distance / length }; break;
    }
    const result = native && (!rawHit || native.distance < rawHit.distance) ? native : rawHit;
    this.lastPick = result ? { ...result, source: result === native ? 'lighthouse' : 'retained' } : null;
    return result;
  }

  inspect() {
    let meshes = 0, triangles = 0, draws = 0;
    for (const node of this.meshes) if (visible(node)) { meshes++; triangles += (node.geometry.index?.count || node.geometry.getAttribute('position').count) / 3; draws += Array.isArray(node.material) ? node.geometry.groups.length : 1; }
    return { ready: !this.disposed, static: true, lod: this.lod, projectedHeight: this.projectedHeight, quality: this.quality, galleryRepaired: this.galleryRepaired, night: this.night,
      visible: this.group.visible, visibleMeshes: meshes, triangles, drawCallsUpperBound: draws, materials: this.materials.size, cachedMaterials: this.materials.size + this.lighterMaterials.size,
      lodSwitches: this.switches, frames: this.frames, ownFrameLoop: false, ownLights: 0, shadowMaps: false, focusFade: true,
      focusScale: this.focusScale.value, materialModel: this.quality === 'lighter' ? 'Lambert' : 'MatteDiffuse + Standard metal/glass/optic', placement: [...PLACEMENT], lightCenter: [10, 5.65, -7],
      picking: 'nearest-visible-static-and-retained', hover: this.hover || null, selected: this.selected || null, lastPick: this.lastPick ? { ...this.lastPick } : null, asset: this.asset?.report || null };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.scene.remove(this.group); this.group.clear(); this.group.visible = false; this.object.clear(); this.object = null;
    for (const material of [...this.materials.values(), ...this.lighterMaterials.values()]) material.dispose();
    disposeAuthoredAssets({ lighthouse: this.asset }); this.asset = null;
    this.materials.clear(); this.lighterMaterials.clear(); this.meshes.length = this.bindings.length = 0; this.cores.clear(); this.lods = {}; this.corners.length = 0;
  }
}

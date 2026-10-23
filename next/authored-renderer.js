import * as THREE from './vendor/three.module.min.js';
import { clone as cloneSkeleton } from './vendor/utils/SkeletonUtils.js';
import { mergeGeometries } from './vendor/utils/BufferGeometryUtils.js';
import { disposeAuthoredAssets } from './asset-loader.js';

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const SHADER_KEY = 'lighthouse-authored-standard-r180-v1';
const SINGLE_PLAY_CLIPS = new Set(['Collect', 'Retreat', 'Emerge']);

function propGeometry(parts) {
  const geometries = parts.map(([shape, position, scale, color, rotation = [0, 0, 0]]) => {
    const source = shape === 'round' ? new THREE.CylinderGeometry(.5, .5, 1, 12) : new THREE.BoxGeometry(1, 1, 1);
    const geometry = source.index ? source.toNonIndexed() : source;
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale)));
    const rgb = new THREE.Color(color), colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) rgb.toArray(colors, i);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (source !== geometry) source.dispose();
    return geometry;
  });
  const merged = mergeGeometries(geometries, false); geometries.forEach(geometry => geometry.dispose()); return merged;
}

// Tiny repeatable working objects remain native retained meshes. Each prop is
// merged into one draw, with vertex colors rather than a draw per little part.
function keeperPropLibrary(uniforms) {
  const wood = '#98734e', pale = '#d7b983', metal = '#829e98', dark = '#405951';
  const definitions = {
    axe: [['round', [0, -.22, 0], [.038, .62, .038], wood], ['box', [.07, -.47, 0], [.26, .16, .09], metal], ['box', [.22, -.47, 0], [.06, .18, .045], '#bdcbb7']],
    hammer: [['round', [0, -.16, 0], [.04, .42, .04], wood], ['box', [0, -.34, 0], [.28, .12, .13], metal]],
    saw: [['box', [0, -.02, 0], [.13, .21, .085], wood], ['box', [0, -.015, .36], [.028, .17, .65], metal],
      ...Array.from({ length: 11 }, (_, i) => ['box', [0, -.105, .07 + i * .055], [.028, .04, .025], metal, [Math.PI / 4, 0, 0]])],
    logs: [['round', [0, 0, .09], [.27, 1.15, .27], wood, [0, 0, Math.PI / 2]], ['round', [-.579, 0, .09], [.239, .012, .239], pale, [0, 0, Math.PI / 2]], ['round', [.579, 0, .09], [.239, .012, .239], pale, [0, 0, Math.PI / 2]]],
    board: [['box', [0, 0, .09], [1.08, .12, .27], pale]],
    lantern: [['box', [0, 0, 0], [.16, .23, .14], '#a58759'], ['box', [0, .01, .076], [.1, .14, .018], '#f6d487'], ['round', [0, .16, 0], [.14, .025, .14], dark]],
  };
  const source = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .83, metalness: 0 });
  const material = bridgeAuthoredMaterial(source, uniforms), lighterMaterial = bridgeAuthoredMaterial(source, uniforms, 'lighter'); source.dispose();
  return { material, lighterMaterial, geometries: Object.fromEntries(Object.entries(definitions).map(([name, parts]) => [name, propGeometry(parts)])) };
}

// This bridge retains the authored Standard material, UVs, vertex normals and
// native skinning. Fog/lantern use the exact cheap world-space batch contract.
export function bridgeAuthoredMaterial(source, shared, quality = 'standard') {
  let material;
  if (quality === 'lighter') {
    material = new THREE.MeshLambertMaterial();
    THREE.Material.prototype.copy.call(material, source);
    // The explicit lighter mode derives a diffuse material from the validated
    // authored PBR source. Color/texture/normal/raster properties survive;
    // roughness and metalness deliberately have no Lambert equivalents.
    for (const key of ['color', 'map', 'lightMap', 'lightMapIntensity', 'aoMap', 'aoMapIntensity', 'emissive', 'emissiveIntensity', 'emissiveMap',
      'bumpMap', 'bumpScale', 'normalMap', 'normalMapType', 'normalScale', 'displacementMap', 'displacementScale', 'displacementBias', 'alphaMap',
      'wireframe', 'wireframeLinewidth', 'wireframeLinecap', 'wireframeLinejoin', 'flatShading']) {
      if (material[key]?.isColor || material[key]?.isVector2) material[key].copy(source[key]);
      else material[key] = source[key];
    }
  } else material = source.clone();
  material.toneMapped = false; material.fog = false;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = 'varying vec3 vArtWorld;\nvarying float vArtDepth;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vArtWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vArtDepth = -mvPosition.z;`);
    shader.fragmentShader = `varying vec3 vArtWorld;
      varying float vArtDepth;
      uniform float uArtNight, uArtDistance, uArtLanternStrength, uArtLanternRadius;
      uniform vec3 uArtLanternPosition;\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', `
      float artFog = clamp((vArtDepth - uArtDistance - 12.0) / 120.0, 0.0, 0.45);
      vec3 artMist = mix(vec3(0.76, 0.83, 0.73), vec3(0.34, 0.47, 0.5), smoothstep(0.35, 0.65, uArtNight));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, artMist, artFog);
      if (uArtLanternStrength > 0.0) {
        vec3 artDelta = vArtWorld - uArtLanternPosition;
        float artDistanceSquared = dot(artDelta, artDelta);
        if (artDistanceSquared < uArtLanternRadius * uArtLanternRadius) {
          float artFalloff = 1.0 - smoothstep(0.2, uArtLanternRadius, sqrt(artDistanceSquared));
          gl_FragColor.rgb += vec3(0.26, 0.17, 0.075) * (uArtLanternStrength * artFalloff * artFalloff);
        }
      }
      gl_FragColor.rgb = clamp(gl_FragColor.rgb, 0.0, 1.0);`);
  };
  material.customProgramCacheKey = () => quality === 'lighter' ? `${SHADER_KEY}:lambert` : SHADER_KEY;
  return material;
}

export class AuthoredRenderer {
  constructor(scene, assets) {
    this.scene = scene; this.assets = assets; this.actors = new Map(); this.materials = new Map(); this.lighterMaterials = new Map(); this.materialBindings = []; this.quality = 'standard';
    this.frame = 0; this.elapsed = 0; this.updates = 0; this.disposed = false; this.props = null;
    this.uniforms = {
      uArtNight: { value: 0 }, uArtDistance: { value: 20 }, uArtLanternPosition: { value: new THREE.Vector3() },
      uArtLanternStrength: { value: 0 }, uArtLanternRadius: { value: 4 },
    };
    this.group = new THREE.Group(); this.group.name = 'authored-actors'; this.scene.add(this.group);
    this.hemi = new THREE.HemisphereLight(0xd7e6d3, 0x52635c, 2.2); this.hemi.name = 'authored-hemi';
    this.sun = new THREE.DirectionalLight(0xffe7b1, 2.4); this.sun.name = 'authored-sun'; this.sun.position.set(-3, 7, 5);
    this.daySun = new THREE.Color(0xffe7b1); this.nightSun = new THREE.Color(0xb8d0df);
    this.scene.add(this.hemi, this.sun);
  }

  ready(kind) { return !this.disposed && !!this.assets[kind]; }
  begin() { this.frame++; for (const actor of this.actors.values()) actor.root.visible = false; }

  _bindMaterials(node, standard, lighter) {
    this.materialBindings.push({ node, standard, lighter });
    node.material = this.quality === 'lighter' ? lighter : standard;
  }

  _setQuality(quality) {
    const next = quality === 'lighter' ? 'lighter' : 'standard';
    if (this.quality === next) return;
    this.quality = next;
    for (const binding of this.materialBindings) binding.node.material = next === 'lighter' ? binding.lighter : binding.standard;
  }

  _create(kind, id) {
    const asset = this.assets[kind];
    if (!asset) throw new Error(`Authored asset is not ready: ${kind}`);
    if ([...this.actors.values()].filter(actor => actor.kind === kind).length >= asset.spec.maxInstances) throw new Error(`Authored ${kind} instance budget exceeded.`);
    const object = cloneSkeleton(asset.scene), root = new THREE.Group(); root.name = `authored:${kind}:${id}`; root.add(object);
    object.traverse(node => {
      if (!node.isMesh) return;
      const bridge = material => {
        if (!this.materials.has(material)) this.materials.set(material, bridgeAuthoredMaterial(material, this.uniforms));
        if (!this.lighterMaterials.has(material)) this.lighterMaterials.set(material, bridgeAuthoredMaterial(material, this.uniforms, 'lighter'));
        return this.materials.get(material);
      };
      const source = node.material, standard = Array.isArray(source) ? source.map(bridge) : bridge(source);
      const lighter = Array.isArray(source) ? source.map(material => this.lighterMaterials.get(material)) : this.lighterMaterials.get(source);
      this._bindMaterials(node, standard, lighter);
      node.castShadow = node.receiveShadow = false; node.renderOrder = 2;
      // The animated bind-pose bbox may not enclose a bent arm/leg. The small
      // bounded actor set is deliberately kept whole through camera frusta.
      node.frustumCulled = false; node.userData.actionPicking = false; node.userData.focusFade = false;
    });
    root.userData.actionPicking = false; root.userData.focusFade = false;
    const mixer = new THREE.AnimationMixer(object), actions = new Map(asset.animations.map(clip => {
      const action = mixer.clipAction(clip);
      // glTF carries animation tracks, not Blender's playback-loop metadata.
      // Short AI/state transitions must hold their final pose until the game
      // changes state, including the last fraction of a frame past duration.
      if (SINGLE_PLAY_CLIPS.has(clip.name)) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
      return [clip.name, action];
    }));
    const actor = { kind, id, root, object, mixer, actions, clip: null, phaseLocked: false, submitted: -1 };
    this.group.add(root); this.actors.set(`${kind}:${id}`, actor);
    if (kind === 'keeper') this._createProps(actor);
    return actor;
  }

  _createProps(actor) {
    this.props ||= keeperPropLibrary(this.uniforms);
    const hands = {};
    actor.object.traverse(node => { for (const side of ['L', 'R']) if (node.isBone && (node.name === `hand.${side}` || node.userData.name === `hand.${side}`)) hands[side] = node; });
    if (!hands.L || !hands.R) throw new Error('Keeper props require hand.L and hand.R attachment bones.');
    actor.root.updateMatrixWorld(true);
    const inverseBind = hands.R.getWorldQuaternion(new THREE.Quaternion()).invert(), tools = new THREE.Group(), cargo = new THREE.Group();
    tools.name = 'keeper-tools'; cargo.name = 'keeper-cargo'; tools.quaternion.copy(inverseBind); hands.R.add(tools, cargo);
    cargo.matrixAutoUpdate = false;
    const meshes = {};
    for (const name of ['axe', 'saw', 'hammer', 'logs', 'board0', 'board1', 'lantern']) {
      const geometry = this.props.geometries[name.startsWith('board') ? 'board' : name], mesh = new THREE.Mesh(geometry, this.props.material);
      mesh.name = `keeper-prop:${name}`; mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 2;
      mesh.userData.actionPicking = false; mesh.userData.focusFade = false;
      this._bindMaterials(mesh, this.props.material, this.props.lighterMaterial);
      (['axe', 'saw', 'hammer'].includes(name) ? tools : name === 'lantern' ? actor.root : cargo).add(mesh); meshes[name] = mesh;
    }
    meshes.board0.position.y = -.055; meshes.board1.position.y = .085; meshes.lantern.position.set(-.39, .77, .05);
    actor.props = { hands, tools, cargo, meshes, sawParentRotation: new THREE.Quaternion(), actorRotation: new THREE.Quaternion(),
      state: { cargo: { kind: null, amount: 0 }, tool: null, lantern: false } };
  }

  _syncProps(actor, state) {
    if (!actor.props) return;
    const { hands, tools, cargo, meshes, sawParentRotation, actorRotation } = actor.props;
    if (state) {
      const tool = state.tool || null, item = state.cargo || { kind: null, amount: 0 }, amount = item.amount || 0;
      if (tool && !['axe', 'saw', 'hammer'].includes(tool)) throw new Error(`Unknown keeper tool: ${tool}`);
      if (!Number.isInteger(amount) || amount < 0 || amount > (item.kind === 'logs' ? 1 : 2) || (amount > 0 && !['logs', 'boards'].includes(item.kind))) throw new Error('Keeper cargo must match the existing one-log/two-board capacity.');
      for (const name of ['axe', 'saw', 'hammer']) meshes[name].visible = tool === name;
      meshes.logs.visible = item.kind === 'logs' && amount === 1;
      meshes.board0.visible = item.kind === 'boards' && amount >= 1; meshes.board1.visible = item.kind === 'boards' && amount >= 2;
      meshes.lantern.visible = !!state.lantern;
      actor.props.state = { cargo: { kind: amount ? item.kind : null, amount }, tool, lantern: !!state.lantern };
    }
    const hasCargo = meshes.logs.visible || meshes.board0.visible;
    if (!hasCargo && !meshes.saw.visible) return;
    actor.root.updateWorldMatrix(true, true);
    if (meshes.saw.visible) {
      // The grip follows the wrist, but the working blade stays along actor
      // +Z with teeth down -Y. Axe/hammer keep their wrist-driven rotation.
      meshes.saw.quaternion.copy(tools.getWorldQuaternion(sawParentRotation)).invert().multiply(actor.root.getWorldQuaternion(actorRotation));
      meshes.saw.updateMatrixWorld(true);
    }
    if (!hasCargo) return;
    const center = hands.L.getWorldPosition(new THREE.Vector3()).add(hands.R.getWorldPosition(new THREE.Vector3())).multiplyScalar(.5);
    const desired = actor.root.matrixWorld.clone().setPosition(center);
    cargo.matrix.copy(hands.R.matrixWorld).invert().multiply(desired); cargo.matrixWorldNeedsUpdate = true;
  }

  draw(kind, id, pose = {}) {
    if (this.disposed) return false;
    const key = `${kind}:${id}`, actor = this.actors.get(key) || this._create(kind, id), p = pose.position;
    if (!p || p.length !== 3 || !p.every(Number.isFinite)) throw new Error(`${key}: finite world position is required.`);
    const name = pose.clip || 'Idle', action = actor.actions.get(name);
    if (!action) throw new Error(`${key}: missing authored clip ${name}.`);
    if (actor.clip !== name) {
      const previous = actor.actions.get(actor.clip); action.reset().setEffectiveWeight(1).play();
      if (previous) { previous.fadeOut(.14); action.fadeIn(.14); }
      actor.clip = name;
    }
    actor.phaseLocked = Number.isFinite(pose.phase);
    if (actor.phaseLocked) {
      action.time = clamp(pose.phase, 0, 1) * Math.max(0, action.getClip().duration - 1e-7);
      // Phase-locked existing work is sampled exactly, without an independent
      // timeline or blending delay changing the tool's contact frame.
      for (const other of actor.actions.values()) other.setEffectiveWeight(other === action ? 1 : 0);
      action.stopFading(); actor.mixer.update(0);
    }
    action.setEffectiveTimeScale(Number.isFinite(pose.speed) ? clamp(pose.speed, 0, 4) : 1);
    actor.root.position.fromArray(p); actor.root.rotation.set(0, Number.isFinite(pose.heading) ? pose.heading : 0, 0);
    actor.root.scale.setScalar(Number.isFinite(pose.scale) ? clamp(pose.scale, .1, 5) : 1);
    actor.root.visible = pose.visible !== false; actor.submitted = this.frame;
    this._syncProps(actor, pose.props || { cargo: { kind: null, amount: 0 }, tool: null, lantern: false });
    return true;
  }

  // Called by the sole game update with its own dt. No timers, Clock or RAF.
  update(dt) {
    if (this.disposed) return;
    if (!Number.isFinite(dt) || dt < 0 || dt > .25) throw new Error('Authored animation dt must be finite and between 0 and .25 seconds.');
    this.elapsed += dt; this.updates++;
    for (const actor of this.actors.values()) if (actor.root.visible && !actor.phaseLocked) { actor.mixer.update(dt); this._syncProps(actor); }
  }

  environment({ night = 0, distance = 20, lantern, quality = 'standard' }) {
    this._setQuality(quality);
    const n = clamp(night, 0, 1);
    this.uniforms.uArtNight.value = n; this.uniforms.uArtDistance.value = distance;
    this.hemi.intensity = 2.2 * (1 - n * .45); this.sun.intensity = 2.4 * (1 - n * .5); this.sun.color.copy(this.daySun).lerp(this.nightSun, n);
    this.uniforms.uArtLanternPosition.value.fromArray(lantern.position);
    this.uniforms.uArtLanternStrength.value = lantern.strength; this.uniforms.uArtLanternRadius.value = lantern.radius;
  }

  inspect() {
    let visibleMeshes = 0, drawCallsUpperBound = 0, skinnedMeshes = 0;
    this.group.traverseVisible(node => {
      if (!node.isMesh) return;
      visibleMeshes++; if (node.isSkinnedMesh) skinnedMeshes++;
      drawCallsUpperBound += Array.isArray(node.material) ? node.geometry.groups.length : 1;
    });
    return { ready: !this.disposed, quality: this.quality, kinds: Object.keys(this.assets), frame: this.frame, elapsed: this.elapsed, updates: this.updates, ownFrameLoop: false,
      visibleMeshes, skinnedMeshes, drawCallsUpperBound, actionPicking: false, focusFade: false,
      lighting: { directional: 1, hemisphere: 1, shadowMaps: false, postProcessing: false, materialModel: this.quality === 'lighter' ? 'Lambert' : 'StandardPBR' },
      materials: this.materials.size + (this.props ? 1 : 0), cachedMaterials: this.materials.size + this.lighterMaterials.size + (this.props ? 2 : 0),
      assets: Object.fromEntries(Object.entries(this.assets).map(([kind, asset]) => [kind, asset.report])),
      actors: [...this.actors.values()].map(actor => ({ kind: actor.kind, id: actor.id, visible: actor.root.visible, clip: actor.clip,
        position: actor.root.position.toArray(), heading: actor.root.rotation.y, phaseLocked: actor.phaseLocked, time: actor.actions.get(actor.clip)?.time || 0,
        props: actor.props ? { ...actor.props.state, attachments: Object.fromEntries(Object.entries(actor.props.hands).map(([side, bone]) => [side, { name: bone.userData.name || bone.name, worldPosition: bone.getWorldPosition(new THREE.Vector3()).toArray() }])) } : null })) };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const actor of this.actors.values()) {
      actor.mixer.stopAllAction(); actor.mixer.uncacheRoot(actor.object);
      actor.object.traverse(node => { if (node.isSkinnedMesh) node.skeleton.dispose(); });
    }
    for (const material of this.materials.values()) material.dispose();
    for (const material of this.lighterMaterials.values()) material.dispose();
    if (this.props) { this.props.material.dispose(); this.props.lighterMaterial.dispose(); for (const geometry of Object.values(this.props.geometries)) geometry.dispose(); }
    this.scene.remove(this.group, this.hemi, this.sun); this.group.clear();
    disposeAuthoredAssets(this.assets); this.assets = {}; this.props = null; this.actors.clear(); this.materials.clear(); this.lighterMaterials.clear(); this.materialBindings.length = 0;
  }
}

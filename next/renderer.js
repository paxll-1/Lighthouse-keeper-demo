import * as THREE from './vendor/three.module.min.js';

// The game owns time, animation, audio and the frame loop. This adapter owns only
// the visible WebGL2 canvas, retained triangle batches and world-space picking.
const ID = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const CONTEXT = { alpha: false, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: false };
const NEAR = .3, FAR = 800, MAX_CACHE_CHUNKS = 96, MAX_CACHE_VERTICES = 500000;
const EMISSIVE = new Set(['#edca83', '#efbb6d', '#f2ce7d', '#ffe1a0', '#ffe0a1']);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = v => { const d = Math.hypot(...v) || 1; return v.map(n => n / d); };

export function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) out[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
  return out;
}

// Deliberately preserve the legacy row-major T * Ry * Rx * Rz convention.
export function affine(t) {
  const x = t.rx || 0, y = t.ry || 0, z = t.rz || 0;
  const sx = Math.sin(x), cx = Math.cos(x), sy = Math.sin(y), cy = Math.cos(y), sz = Math.sin(z), cz = Math.cos(z);
  return multiply([1, 0, 0, t.x || 0, 0, 1, 0, t.y || 0, 0, 0, 1, t.z || 0, 0, 0, 0, 1],
    multiply([cy, 0, sy, 0, 0, 1, 0, 0, -sy, 0, cy, 0, 0, 0, 0, 1],
      multiply([1, 0, 0, 0, 0, cx, -sx, 0, 0, sx, cx, 0, 0, 0, 0, 1], [cz, -sz, 0, 0, sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])));
}

export function transform(m, p) {
  return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
}

export function cameraFrame(width, height, target, distance, yaw, pitch) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const eye = [target.x + Math.sin(yaw) * distance * cp, target.y + distance * sp, target.z + Math.cos(yaw) * distance * cp];
  const forward = norm([target.x - eye[0], target.y - eye[1], target.z - eye[2]]);
  const right = norm(cross(forward, [0, 1, 0])), up = cross(right, forward), portrait = width < height * .82;
  return { eye, forward, right, up, scale: height / (2 * Math.tan(portrait ? .58 : .48)), centerY: height * (portrait ? .53 : height < 500 ? .48 : .52), yaw, pitch, distance };
}

// Observation changes direction and focal length only. Its eye never orbits a
// target or advances through scenery, even while yaw/pitch/zoom are changing.
export function observationFrame(width, height, observation, distance = 20) {
  const source = observation?.eye;
  if (!source || source.length !== 3 || ![0, 1, 2].every(k => Number.isFinite(source[k]))) return null;
  const eye = Array.from(source), yaw = Number.isFinite(observation.yaw) ? observation.yaw : 0;
  const pitch = clamp(Number.isFinite(observation.pitch) ? observation.pitch : 0, -.15, .55);
  const opticalZoom = clamp(Number.isFinite(observation.zoom) ? observation.zoom : 2, 1, 7);
  const cp = Math.cos(pitch), forward = norm([-Math.sin(yaw) * cp, -Math.sin(pitch), -Math.cos(yaw) * cp]);
  const right = norm(cross(forward, [0, 1, 0])), up = cross(right, forward), portrait = width < height * .82;
  // Multiplying focal length gives a true 1–7× perspective projection. The
  // shader and projectPoint share this scale; the canvas itself is never scaled.
  return { eye, forward, right, up, scale: height / (2 * Math.tan(portrait ? .58 : .48)) * opticalZoom,
    centerX: Number.isFinite(observation.centerX) ? clamp(observation.centerX, 0, width) : width * .5,
    centerY: Number.isFinite(observation.centerY) ? clamp(observation.centerY, 0, height) : height * (portrait ? .53 : height < 500 ? .48 : .52),
    yaw, pitch, distance, opticalZoom, observation: true };
}

export function lanternState(lantern, quality = 'standard') {
  const source = lantern?.position, valid = source?.length === 3 && [0, 1, 2].every(k => Number.isFinite(source[k]));
  return { position: valid ? Array.from(source) : [0, 0, 0],
    strength: valid && Number.isFinite(lantern.strength) ? clamp(lantern.strength, 0, 1) : 0,
    radius: quality === 'lighter' ? 3 : 4 };
}

export function projectPoint(view, width, p) {
  if (!view) return null;
  const d = sub(p, view.eye), z = dot(d, view.forward);
  return z < NEAR ? null : { x: (view.centerX ?? width * .5) + dot(d, view.right) * view.scale / z, y: view.centerY - dot(d, view.up) * view.scale / z, z };
}

function screenRay(view, width, x, y) {
  const dx = (x - (view.centerX ?? width * .5)) / view.scale, dy = -(y - view.centerY) / view.scale;
  return [0, 1, 2].map(k => view.forward[k] + view.right[k] * dx + view.up[k] * dy);
}

export function groundPoint(view, width, x, y, heightAt) {
  if (!view) return null;
  const dir = screenRay(view, width, x, y);
  if (dir[1] >= -.005) return null;
  let t = -view.eye[1] / dir[1];
  if (heightAt) {
    let lo = 0, hi = Math.max(1, t + 4 / Math.abs(dir[1]));
    for (let i = 0; i < 32; i++) {
      const m = (lo + hi) / 2, xx = view.eye[0] + dir[0] * m, zz = view.eye[2] + dir[2] * m;
      if (view.eye[1] + dir[1] * m > heightAt(xx, zz)) lo = m; else hi = m;
    }
    t = (lo + hi) / 2;
  }
  return { x: view.eye[0] + dir[0] * t, z: view.eye[2] + dir[2] * t };
}

// Both sides of every triangle participate, including untagged blockers.
export function pickFaces(faces, eye, ray) {
  let best = Infinity, tagged = null;
  for (const f of faces) {
    if (f.tag === 'keeper' || f.opacity < .5) continue;
    let lo = 0, hi = best;
    for (let k = 0; k < 3 && hi >= lo; k++) {
      if (Math.abs(ray[k]) < 1e-12) {
        if (eye[k] < f.min[k] || eye[k] > f.max[k]) hi = -1;
      } else {
        let a = (f.min[k] - eye[k]) / ray[k], b = (f.max[k] - eye[k]) / ray[k];
        if (a > b) [a, b] = [b, a];
        lo = Math.max(lo, a); hi = Math.min(hi, b);
      }
    }
    if (hi < lo) continue;
    const a = f.v[0];
    for (let i = 1; i < f.v.length - 1; i++) {
      const e1 = sub(f.v[i], a), e2 = sub(f.v[i + 1], a), h = cross(ray, e2), det = dot(e1, h);
      if (Math.abs(det) < 1e-8) continue;
      const inv = 1 / det, s = sub(eye, a), u = dot(s, h) * inv;
      if (u < 0 || u > 1) continue;
      const q = cross(s, e1), v = dot(ray, q) * inv;
      if (v < 0 || u + v > 1) continue;
      const t = dot(e2, q) * inv;
      if (t > .01 && t < best) { best = t; tagged = f.tag || null; }
    }
  }
  return tagged;
}

function parseColor(value) {
  if (typeof value !== 'string' || !/^#[\da-f]{3,4}$|^#[\da-f]{6}([\da-f]{2})?$/i.test(value)) throw new Error(`Unsupported renderer color: ${value}`);
  let s = value.slice(1);
  if (s.length <= 4) s = [...s].map(c => c + c).join('');
  return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255, s.length === 8 ? parseInt(s.slice(6, 8), 16) / 255 : 1];
}

const VERTEX_SHADER = `
precision highp float;
in vec3 position;
in vec4 aColor;
in vec4 aInfo;
uniform vec3 uEye, uRight, uUp, uForward;
uniform vec2 uScale;
uniform float uShift, uShiftX;
out vec4 vColor;
out vec4 vInfo;
out float vDepth;
out vec3 vWorld;
void main() {
  vec3 d = position - uEye;
  float z = dot(d, uForward);
  gl_Position = vec4(dot(d, uRight) * uScale.x + uShiftX * z, dot(d, uUp) * uScale.y + uShift * z,
    ${((FAR + NEAR) / (FAR - NEAR)).toFixed(12)} * z - ${((2 * FAR * NEAR) / (FAR - NEAR)).toFixed(12)}, z);
  vColor = aColor;
  vInfo = aInfo;
  vDepth = z;
  vWorld = position;
}`;

const FRAGMENT_SHADER = `
precision highp float;
in vec4 vColor;
in vec4 vInfo;
in float vDepth;
in vec3 vWorld;
uniform float uNight, uDistance, uHover, uKeeperTag, uDpr;
uniform vec3 uFocus;
uniform vec3 uLanternPosition;
uniform float uLanternStrength, uLanternRadius;
out vec4 outputColor;
void main() {
  if (vColor.a <= 0.001) discard;
  // Open a local, softly dithered window around the keeper. The rest of the
  // occluder stays solid, keeps its depth, and still blocks action picking.
  if (uFocus.z > 0.0 && vInfo.y > 0.7 && abs(vInfo.z - uKeeperTag) > 0.25 && vInfo.w >= 0.0 && vDepth < uFocus.z - 0.35) {
    vec2 p = (gl_FragCoord.xy / uDpr - uFocus.xy) / vec2(27.0, 44.0);
    float fade = 0.68 * (1.0 - smoothstep(0.72, 1.08, length(p)));
    vec2 cell = floor(gl_FragCoord.xy / uDpr);
    float pattern = mod(cell.x + mod(cell.y, 2.0) * 2.0, 4.0) / 4.0;
    if (fade > 0.0 && pattern < fade) discard;
  }
  vec3 rgb = vColor.rgb;
  if (vInfo.w >= 0.0) {
    float light = mix(vInfo.x * (1.0 - uNight * 0.37), 1.0, vInfo.w);
    if (uHover > 0.0 && abs(vInfo.z - uHover) < 0.25) light += 0.07;
    vec3 warm = mix(vec3(1.035, 1.012, 0.94), vec3(0.86, 0.95, 1.06), smoothstep(0.35, 0.65, uNight));
    float fog = clamp((vDepth - uDistance - 12.0) / 120.0, 0.0, 0.45);
    vec3 mist = mix(vec3(0.76, 0.83, 0.73), vec3(0.34, 0.47, 0.5), smoothstep(0.35, 0.65, uNight));
    rgb = mix(rgb * light * warm, mist, fog);
    // A small soft pool, without shadow maps or additional geometry/passes.
    // Emissive windows/beacon and screen overlays keep their authored light.
    if (uLanternStrength > 0.0 && vInfo.w < 0.5) {
      vec3 delta = vWorld - uLanternPosition;
      float distanceSquared = dot(delta, delta);
      if (distanceSquared < uLanternRadius * uLanternRadius) {
        float falloff = 1.0 - smoothstep(0.2, uLanternRadius, sqrt(distanceSquared));
        rgb += vec3(0.26, 0.17, 0.075) * (uLanternStrength * falloff * falloff);
      }
    }
  }
  outputColor = vec4(clamp(rgb, 0.0, 1.0), vColor.a);
}`;

const BACKGROUND_VERTEX = `
precision highp float;
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.99999, 1.0); }`;

const BACKGROUND_FRAGMENT = `
precision highp float;
in vec2 vUv;
uniform vec2 uSize;
uniform float uHorizon, uNight, uDaylight, uTime, uYaw;
out vec4 outputColor;
void main() {
  float y = (1.0-vUv.y) * uSize.y;
  float h = max(1.0, uHorizon);
  float dusk = smoothstep(0.55, 0.8, uDaylight), night = smoothstep(0.25, 0.8, uNight);
  vec3 skyTop = mix(mix(vec3(0.62,0.78,0.82), vec3(0.78,0.71,0.68), dusk), vec3(0.15,0.24,0.35), night);
  vec3 skyEdge = mix(mix(vec3(0.96,0.94,0.84), vec3(0.95,0.84,0.68), dusk), vec3(0.51,0.58,0.58), night);
  vec3 seaEdge = mix(mix(vec3(0.57,0.75,0.71), vec3(0.62,0.73,0.67), dusk), vec3(0.40,0.53,0.55), night);
  vec3 seaNear = mix(vec3(0.30,0.58,0.60), vec3(0.19,0.37,0.42), night);
  vec3 color;
  if (y < uHorizon) {
    color = mix(skyTop, skyEdge, clamp(y/h,0.0,1.0));
    vec2 sun = vec2((0.77-sin(uYaw)*0.15)*uSize.x, uHorizon-uSize.y*0.17);
    float d = length((vec2(vUv.x*uSize.x,y)-sun)/uSize.y);
    color = mix(color, mix(vec3(1.0,0.95,0.77),vec3(0.98,0.93,0.80),night), 0.25*exp(-d*d*20.0));
    color = mix(color, vec3(1.0,0.95,0.79), 1.0-smoothstep(0.022,0.024,d));
    for (int layer=0; layer<3; layer++) {
      float l=float(layer), x=vUv.x*24.0;
      float edge=uHorizon-uSize.y*(0.014+l*0.005+0.013*sin(x*0.63+l)+0.008*cos(x*1.37+l));
      vec3 ridge=mix(vec3(0.76-l*0.09,0.82-l*0.06,0.74-l*0.05),vec3(0.44-l*0.05,0.52-l*0.035,0.55-l*0.035),night);
      color=mix(color,ridge,smoothstep(edge-0.8,edge+0.8,y));
    }
  } else {
    color=mix(seaEdge,seaNear,clamp((y-max(0.0,uHorizon))/max(1.0,uSize.y-max(0.0,uHorizon)),0.0,1.0));
    float band=floor(y/15.0), drift=uTime*mix(2.0,-1.5,mod(band,2.0));
    float streak=1.0-smoothstep(0.4,1.1,abs(mod(y,15.0)-7.5));
    float segment=smoothstep(0.0,0.1,mod(vUv.x*4.7+band*0.37+drift/uSize.x,1.0))* (1.0-smoothstep(0.20,0.34,mod(vUv.x*4.7+band*0.37+drift/uSize.x,1.0)));
    color=mix(color,vec3(0.86,0.91,0.81),streak*segment*0.12);
  }
  outputColor=vec4(color,1.0);
}`;

function verticesIn(faces) { let n = 0; for (const f of faces) n += (f.v.length - 2) * 3; return n; }

// Mesh identities and materials never change. Attribute capacity grows only
// when needed, with geometric headroom, then is reused by subsequent frames.
class Batch {
  constructor(owner, name, material, order, indexed = false) {
    this.owner = owner; this.name = name; this.indexed = indexed; this.capacity = this.count = this.growths = 0;
    this.positions = new Float32Array(0); this.colors = new Float32Array(0); this.info = new Float32Array(0); this.indices = new Uint32Array(0);
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.name = name; this.mesh.renderOrder = order; this.mesh.frustumCulled = false; this.mesh.visible = false;
    owner._scene.add(this.mesh);
  }
  ensure(count) {
    if (count <= this.capacity) return false;
    const capacity = Math.max(256, 2 ** Math.ceil(Math.log2(count)));
    const positions = new Float32Array(capacity * 3), colors = new Float32Array(capacity * 4), info = new Float32Array(capacity * 4);
    positions.set(this.positions); colors.set(this.colors); info.set(this.info);
    const geometry = new THREE.BufferGeometry();
    for (const [name, data, size] of [['position', positions, 3], ['aColor', colors, 4], ['aInfo', info, 4]]) {
      geometry.setAttribute(name, new THREE.BufferAttribute(data, size).setUsage(this.name === 'static' ? THREE.StaticDrawUsage : THREE.DynamicDrawUsage));
    }
    this.indices = new Uint32Array(this.indexed ? capacity : 0);
    if (this.indexed) geometry.setIndex(new THREE.BufferAttribute(this.indices, 1).setUsage(THREE.DynamicDrawUsage));
    this.mesh.geometry.dispose(); this.mesh.geometry = geometry;
    this.positions = positions; this.colors = colors; this.info = info; this.capacity = capacity; this.growths++;
    return true;
  }
  dirty(start, count) {
    if (!count) return;
    for (const attr of Object.values(this.mesh.geometry.attributes)) {
      attr.addUpdateRange(start * attr.itemSize, count * attr.itemSize); attr.needsUpdate = true;
    }
  }
  packed(packs) {
    let count = 0; for (const p of packs) count += p.count;
    this.ensure(count);
    let at = 0;
    for (const p of packs) {
      this.positions.set(p.positions, at * 3); this.colors.set(p.colors, at * 4); this.info.set(p.info, at * 4); at += p.count;
    }
    this.dirty(0, count); this.setCount(count); return count;
  }
  faces(faces, start = 0) {
    const count = verticesIn(faces); this.ensure(start + count);
    let at = start;
    for (const f of faces) {
      for (let i = 1; i < f.v.length - 1; i++) for (const corner of [0, i, i + 1]) {
        const p = f.v[corner], c = f.colors ? f.colors[corner] : f.color;
        this.positions[at * 3] = p[0]; this.positions[at * 3 + 1] = p[1]; this.positions[at * 3 + 2] = p[2];
        this.colors[at * 4] = c[0]; this.colors[at * 4 + 1] = c[1]; this.colors[at * 4 + 2] = c[2]; this.colors[at * 4 + 3] = c[3] * f.alpha;
        this.info[at * 4] = f.light; this.info[at * 4 + 1] = f.top; this.info[at * 4 + 2] = f.tagId; this.info[at * 4 + 3] = f.lit;
        at++;
      }
    }
    this.dirty(start, count); this.setCount(at); return at;
  }
  setCount(count) { this.count = count; this.mesh.geometry.setDrawRange(0, count); this.mesh.visible = count > 0; }
  sort(view) {
    if (!this.count) return;
    const triangles = this.count / 3;
    if (!this.order || this.order.length < triangles) { this.order = new Uint32Array(this.capacity / 3 | 0); this.depths = new Float32Array(this.capacity / 3 | 0); }
    const p = this.positions, f = view.forward;
    for (let i = 0; i < triangles; i++) {
      const a = i * 9; this.order[i] = i;
      this.depths[i] = ((p[a] + p[a + 3] + p[a + 6]) * f[0] + (p[a + 1] + p[a + 4] + p[a + 7]) * f[1] + (p[a + 2] + p[a + 5] + p[a + 8]) * f[2]) / 3;
    }
    this.order.subarray(0, triangles).sort((a, b) => this.depths[b] - this.depths[a] || a - b);
    for (let i = 0; i < triangles; i++) { const a = this.order[i] * 3; this.indices[i * 3] = a; this.indices[i * 3 + 1] = a + 1; this.indices[i * 3 + 2] = a + 2; }
    const index = this.mesh.geometry.index; index.addUpdateRange(0, this.count); index.needsUpdate = true;
  }
  bytes() { return this.positions.byteLength + this.colors.byteLength + this.info.byteLength + this.indices.byteLength; }
  dispose() {
    const geometry = this.mesh.geometry; geometry.dispose();
    for (const name of Object.keys(geometry.attributes)) geometry.deleteAttribute(name);
    geometry.setIndex(null);
    this.positions = this.colors = this.info = new Float32Array(0); this.indices = new Uint32Array(0);
    this.order = this.depths = null; this.count = this.capacity = 0;
  }
}

function pack(faces) {
  const count = verticesIn(faces), positions = new Float32Array(count * 3), colors = new Float32Array(count * 4), info = new Float32Array(count * 4);
  let at = 0;
  for (const f of faces) for (let i = 1; i < f.v.length - 1; i++) for (const corner of [0, i, i + 1]) {
    positions.set(f.v[corner], at * 3); colors.set([f.color[0], f.color[1], f.color[2], f.color[3] * f.alpha], at * 4);
    info.set([f.light, f.top, f.tagId, f.lit], at * 4); at++;
  }
  return { count, positions, colors, info };
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', CONTEXT);
    if (!gl) { const error = new Error('Для Three.js-пробы нужен WebGL2. Откройте сохранённую исходную игру по ссылке ниже.'); error.name = 'WebGL2Unavailable'; throw error; }
    this.canvas = canvas;
    this.backend = new THREE.WebGLRenderer({ canvas, context: gl, ...CONTEXT });
    this.backend.setPixelRatio(1); this.backend.autoClear = true; this.backend.setClearColor(0x4c9399, 1);
    this.backend.outputColorSpace = THREE.LinearSRGBColorSpace; this.backend.toneMapping = THREE.NoToneMapping;
    this.mode = 'three-webgl2'; this.quality = 'standard'; this.detail = true; this.pixelRatio = 1;
    this.keeperFocus = this.observation = this.lantern = null; this.night = this.daylight = 0;
    this._width = this._height = 1; this._view = null; this._disposed = this._contextLost = false;
    this._frame = this._staticRebuilds = this._staticVertexCount = 0;
    this._cache = new Map(); this._active = []; this._lastActive = []; this._cachedVertices = 0;
    this._programIds = new WeakSet(); this._compilations = 0;
    this._faces = []; this._dynamic = []; this._effects = []; this._selection = [];
    this._stack = [ID]; this._tag = ''; this._colors = new Map(); this._tags = new Map(); this._staticAlpha = 0;
    this._scene = new THREE.Scene(); this._camera = new THREE.Camera();
    this._uniforms = {
      uEye: { value: new THREE.Vector3() }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uForward: { value: new THREE.Vector3(0, 0, -1) },
      uScale: { value: new THREE.Vector2(1, 1) }, uShift: { value: 0 }, uShiftX: { value: 0 }, uNight: { value: 0 }, uDistance: { value: 20 }, uHover: { value: 0 },
      uKeeperTag: { value: this._tagId('keeper') }, uFocus: { value: new THREE.Vector3(0, 0, -1) }, uDpr: { value: 1 },
      uLanternPosition: { value: new THREE.Vector3() }, uLanternStrength: { value: 0 }, uLanternRadius: { value: 4 },
    };
    const material = (transparent, overlay = false) => new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERTEX_SHADER, fragmentShader: FRAGMENT_SHADER, uniforms: this._uniforms,
      transparent, depthTest: !overlay, depthWrite: !transparent, depthFunc: THREE.LessEqualDepth, side: THREE.DoubleSide, forceSinglePass: true,
      blending: transparent ? THREE.NormalBlending : THREE.NoBlending, toneMapped: false,
    });
    this._materials = [material(false), material(true), material(true, true)];
    this._static = new Batch(this, 'static', this._materials[0], 1);
    this._stream = new Batch(this, 'dynamic', this._materials[0], 2);
    this._alpha = new Batch(this, 'alpha', this._materials[1], 3, true);
    this._overlay = new Batch(this, 'effects', this._materials[2], 4);
    this._batches = [this._static, this._stream, this._alpha, this._overlay];
    this._backgroundUniforms = { uSize: { value: new THREE.Vector2(1, 1) }, uHorizon: { value: 0 }, uNight: this._uniforms.uNight, uDaylight: { value: 0 }, uTime: { value: 0 }, uYaw: { value: 0 } };
    const backgroundGeometry = new THREE.BufferGeometry();
    backgroundGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this._background = new THREE.Mesh(backgroundGeometry, new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: BACKGROUND_VERTEX, fragmentShader: BACKGROUND_FRAGMENT, uniforms: this._backgroundUniforms, depthWrite: false, depthTest: false, toneMapped: false }));
    this._background.name = 'sky-sea'; this._background.renderOrder = 0; this._background.frustumCulled = false; this._scene.add(this._background);
    this.stats = { renderer: this.mode, webglVersion: 2, meshCount: 5, faces: 0, generatedFaces: 0, triangles: 0, drawCalls: 0 };
    this._onLost = event => { event.preventDefault(); this._contextLost = true; this._status('Графика WebGL2 приостановлена: потерян контекст. Ожидаем восстановления.'); this._emit('close-renderer-error', { reason: 'contextlost', message: 'Потерян контекст WebGL2', recoverable: true }); };
    this._onRestored = () => { this._contextLost = false; for (const b of this._batches) b.dirty(0, b.count); this._status(''); this._emit('close-renderer-restored', {}); };
    canvas.addEventListener('webglcontextlost', this._onLost, false); canvas.addEventListener('webglcontextrestored', this._onRestored, false);
  }

  _tagId(tag) { if (!tag) return 0; if (!this._tags.has(tag)) this._tags.set(tag, this._tags.size + 1); return this._tags.get(tag); }
  _emit(name, detail) { if (typeof CustomEvent !== 'undefined') this.canvas.dispatchEvent(new CustomEvent(name, { detail, bubbles: true })); }
  _status(message) {
    if (!this._statusNode && message && this.canvas.ownerDocument) {
      const node = this.canvas.ownerDocument.createElement('div'); node.setAttribute('role', 'status'); node.className = 'close-webgl-status';
      node.style.cssText = 'position:fixed;z-index:100;left:18px;right:18px;top:18px;padding:12px 16px;border-radius:12px;background:#243b40ed;color:#f6e7be;font:14px/1.4 system-ui;pointer-events:none';
      this.canvas.parentElement?.append(node); this._statusNode = node;
    }
    if (this._statusNode) { this._statusNode.textContent = message; this._statusNode.hidden = !message; }
  }

  resize(w, h) {
    if (this._disposed) return;
    this._width = Math.max(1, w); this._height = Math.max(1, h);
    const coarse = globalThis.matchMedia?.('(pointer:coarse)').matches || false;
    this.pixelRatio = Math.min(globalThis.devicePixelRatio || 1, this.quality === 'lighter' ? (coarse ? 1 : 1.25) : 1.5);
    this.backend.setSize(Math.round(this._width * this.pixelRatio), Math.round(this._height * this.pixelRatio), false);
    this._uniforms.uDpr.value = this.pixelRatio; this._backgroundUniforms.uSize.value.set(this._width, this._height);
    if (this._cameraArgs) this.camera(...this._cameraArgs);
  }

  camera(target, distance, yaw, pitch) {
    this._cameraArgs = [{ x: target.x, y: target.y, z: target.z }, distance, yaw, pitch];
    const v = this._view = observationFrame(this._width, this._height, this.observation, distance) || cameraFrame(this._width, this._height, target, distance, yaw, pitch), u = this._uniforms;
    u.uEye.value.fromArray(v.eye); u.uRight.value.fromArray(v.right); u.uUp.value.fromArray(v.up); u.uForward.value.fromArray(v.forward);
    u.uScale.value.set(2 * v.scale / this._width, 2 * v.scale / this._height);
    u.uShift.value = 1 - 2 * v.centerY / this._height; u.uShiftX.value = 2 * (v.centerX ?? this._width * .5) / this._width - 1; u.uDistance.value = distance;
    this._backgroundUniforms.uHorizon.value = v.centerY - Math.tan(v.pitch) * v.scale; this._backgroundUniforms.uYaw.value = v.yaw;
    this.detail = distance < 25 && this.quality !== 'lighter';
  }
  project(p) { return projectPoint(this._view, this._width, p); }
  ground(x, y, heightAt) { return groundPoint(this._view, this._width, x, y, heightAt); }
  visible(x, y, z, radius = 1) { const p = this.project([x, y, z]); if (!p) return false; const r = radius * this._view.scale / p.z; return p.x + r > 0 && p.x - r < this._width && p.y + r > 0 && p.y - r < this._height; }

  begin(night, daylight, time) {
    if (this._disposed) return;
    this._frame++; this.night = night; this.daylight = daylight;
    this._dynamic.length = this._effects.length = this._active.length = 0; this._faces = this._dynamic; this._stack = [ID]; this._tag = ''; this._flushed = false;
    this._uniforms.uNight.value = clamp(night || 0, 0, 1); this._backgroundUniforms.uDaylight.value = daylight || 0; this._backgroundUniforms.uTime.value = time || 0;
  }

  retain(key, fn) {
    if (this._disposed) return;
    if (this._capturing) throw new Error('Nested retain() is not supported; retain one complete static chunk.');
    let chunk = this._cache.get(key);
    if (!chunk) {
      const previous = this._faces, faces = []; this._faces = faces; this._capturing = true;
      try { fn(); } finally { this._faces = previous; this._capturing = false; }
      const opaque = faces.filter(f => f.opacity >= 1), alpha = faces.filter(f => f.opacity < 1);
      chunk = { key, faces, opaque: pack(opaque), alpha: pack(alpha), vertices: verticesIn(faces), touched: this._frame };
      this._cache.set(key, chunk); this._cachedVertices += chunk.vertices;
    }
    if (chunk.touched !== this._frame || !this._active.includes(chunk)) this._active.push(chunk);
    chunk.touched = this._frame;
  }

  invalidate(key) {
    const chunk = this._cache.get(key);
    if (!chunk) return;
    this._cache.delete(key); this._cachedVertices -= chunk.vertices;
  }

  poly(verts, color, opacity = 1) {
    if (this._disposed || verts.length < 3) return;
    const m = this._stack[this._stack.length - 1], v = verts.map(p => transform(m, p));
    let rgb = this._colors.get(color); if (!rgb) { rgb = parseColor(color); this._colors.set(color, rgb); }
    const normal = norm(cross(sub(v[1], v[0]), sub(v[2], v[0]))), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of v) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
    const alpha = clamp(opacity, 0, 1);
    this._faces.push({ v, min, max, color: rgb, alpha, opacity: alpha * rgb[3], top: max[1], light: .76 + .12 * normal[0] + .14 * normal[2] + .14 * Math.abs(normal[1]), tag: this._tag, tagId: this._tagId(this._tag), lit: EMISSIVE.has(color.toLowerCase()) ? 1 : 0 });
  }
  box(x, y, z, w, h, d, color) {
    const v = [[x-w/2,y-h/2,z-d/2],[x+w/2,y-h/2,z-d/2],[x+w/2,y+h/2,z-d/2],[x-w/2,y+h/2,z-d/2],[x-w/2,y-h/2,z+d/2],[x+w/2,y-h/2,z+d/2],[x+w/2,y+h/2,z+d/2],[x-w/2,y+h/2,z+d/2]];
    for (const f of [[0,1,2,3],[5,4,7,6],[4,0,3,7],[1,5,6,2],[3,2,6,7],[4,5,1,0]]) this.poly(f.map(i => v[i]), color);
  }
  cylinder(x, y, z, rt, rb, h, color, sides = 8) {
    const top = [], bottom = [];
    for (let i = 0; i < sides; i++) { const a = i * Math.PI * 2 / sides; top.push([x + Math.sin(a)*rt, y+h/2, z+Math.cos(a)*rt]); bottom.push([x+Math.sin(a)*rb, y-h/2, z+Math.cos(a)*rb]); }
    this.poly(top, color); this.poly([...bottom].reverse(), color);
    for (let i = 0; i < sides; i++) this.poly([bottom[i], bottom[(i+1)%sides], top[(i+1)%sides], top[i]], color);
  }
  group(t, fn) { this._stack.push(multiply(this._stack[this._stack.length - 1], affine(t))); try { fn(); } finally { this._stack.pop(); } }
  tag(id, fn) { const previous = this._tag; this._tag = id; try { fn(); } finally { this._tag = previous; } }
  blob(x, y, z, rx, ry, rz, color, opacity = 1) {
    const t = (1+Math.sqrt(5))/2, v = [[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(p => { const n = norm(p); return [x+n[0]*rx,y+n[1]*ry,z+n[2]*rz]; });
    for (const f of [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]]) this.poly(f.map(i => v[i]), color, opacity);
  }
  shadow(x, z, rx, rz, y = .012) {
    for (let ring = 0; ring < 3; ring++) { const v = [], k = 1.22-ring*.2; for (let i=0;i<12;i++) { const a=i*Math.PI/6; v.push([x+Math.cos(a)*rx*k,y+ring*.001,z+Math.sin(a)*rz*k]); } this.poly(v, '#3f5450', .07+ring*.035); }
  }

  flush(hover) {
    if (this._disposed || !this._view) return;
    const changed = this._lastActive.length !== this._active.length || this._active.some((c, i) => this._lastActive[i] !== c);
    if (changed) {
      this._static.packed(this._active.map(c => c.opaque));
      this._staticAlpha = this._alpha.packed(this._active.map(c => c.alpha));
      this._lastActive = this._active.slice(); this._staticRebuilds++;
    }
    const opaque = [], alpha = []; this._selection.length = 0;
    for (const c of this._active) for (const f of c.faces) this._selection.push(f);
    for (const f of this._dynamic) { this._selection.push(f); (f.opacity >= 1 ? opaque : alpha).push(f); }
    this._stream.faces(opaque); this._alpha.faces(alpha, this._staticAlpha); this._alpha.sort(this._view);
    this._uniforms.uHover.value = this._tagId(hover);
    const focus = this.keeperFocus && this.project(this.keeperFocus);
    this._uniforms.uFocus.value.set(focus?.x || 0, focus ? this._height - focus.y : 0, focus ? focus.z : -1);
    const lantern = lanternState(this.lantern, this.quality);
    this._uniforms.uLanternPosition.value.fromArray(lantern.position);
    this._uniforms.uLanternStrength.value = lantern.strength; this._uniforms.uLanternRadius.value = lantern.radius;
    this._flushed = true;
    // Bound historical state/quality variants. Current chunks stay available.
    if (this._cache.size > MAX_CACHE_CHUNKS || this._cachedVertices > MAX_CACHE_VERTICES) {
      const inactive = [...this._cache.values()].filter(c => c.touched !== this._frame).sort((a,b) => a.touched-b.touched);
      for (const c of inactive) { if (this._cache.size <= MAX_CACHE_CHUNKS && this._cachedVertices <= MAX_CACHE_VERTICES) break; this.invalidate(c.key); }
    }
  }

  pick(x, y) { return this._view && !this._disposed ? pickFaces(this._selection, this._view.eye, screenRay(this._view, this._width, x, y)) : null; }

  _screenWorld(x, y, depth) {
    const v = this._view, dx = (x-(v.centerX ?? this._width*.5))*depth/v.scale, dy = -(y-v.centerY)*depth/v.scale;
    return [0,1,2].map(k => v.eye[k]+v.forward[k]*depth+v.right[k]*dx+v.up[k]*dy);
  }
  _effect(points, colors) {
    if (this._disposed) return;
    const v = points.map(p => this._screenWorld(p.x, p.y, p.z));
    this._effects.push({ v, colors, alpha: 1, opacity: 0, light: 1, top: 0, tagId: 0, lit: -1 });
  }
  ring(x, z, color, radius, y = .045) {
    if (this._disposed || !this._view) return;
    const c = parseColor(color);
    for (let i=0;i<32;i++) {
      const a=i*Math.PI/16, b=(i+1)*Math.PI/16, p=this.project([x+Math.sin(a)*radius,y,z+Math.cos(a)*radius]), q=this.project([x+Math.sin(b)*radius,y,z+Math.cos(b)*radius]);
      if (!p || !q) continue;
      const len=Math.hypot(q.x-p.x,q.y-p.y)||1, dx=-(q.y-p.y)/len, dy=(q.x-p.x)/len;
      this._effect([{x:p.x+dx,y:p.y+dy,z:p.z},{x:q.x+dx,y:q.y+dy,z:q.z},{x:q.x-dx,y:q.y-dy,z:q.z},{x:p.x-dx,y:p.y-dy,z:p.z}], [c,c,c,c]);
    }
  }
  spark(point, radius, color) {
    if (this._disposed) return;
    const p=this.project(point); if (!p) return;
    const r=Math.max(1,radius*this._view.scale/p.z), c=parseColor(color);
    for (let i=0;i<10;i++) { const a=i*Math.PI/5,b=(i+1)*Math.PI/5; this._effect([p,{x:p.x+Math.cos(a)*r,y:p.y+Math.sin(a)*r,z:p.z},{x:p.x+Math.cos(b)*r,y:p.y+Math.sin(b)*r,z:p.z}], [c,c,c]); }
  }
  beam(point, end, night) {
    if (this._disposed) return;
    const a=this.project(point),b=this.project(end); if (!a||!b) return;
    const c=[1,224/255,150/255,clamp(night*.28,0,1)], clear=[1,224/255,150/255,0];
    this._effect([a,{x:b.x-65,y:b.y-50,z:b.z},{x:b.x+65,y:b.y+50,z:b.z}], [c,clear,clear]);
  }

  end() {
    if (this._disposed || this._contextLost || !this._view) return;
    if (!this._flushed) this.flush(null);
    const start = performance.now(); this._overlay.faces(this._effects);
    this.backend.render(this._scene, this._camera);
    const info = this.backend.info;
    for (const program of info.programs) if (!this._programIds.has(program)) { this._programIds.add(program); this._compilations++; }
    const bytes = this._batches.reduce((n,b) => n+b.bytes(), 0)+36;
    const packedBytes = [...this._cache.values()].reduce((n,c) => n+c.vertices*44,0);
    const sortingBytes = this._batches.reduce((n,b) => n+(b.order?.byteLength || 0)+(b.depths?.byteLength || 0),0);
    Object.assign(this.stats, {
      faces: this._selection.length, generatedFaces: this._selection.length, triangles: info.render.triangles, drawCalls: info.render.calls,
      meshCount: this._scene.children.length, retainedChunks: this._cache.size, activeChunks: this._active.length, cachedVertices: this._cachedVertices,
      staticRebuilds: this._staticRebuilds, bufferGrowths: this._batches.reduce((n,b) => n+b.growths, 0),
      bufferCapacities: Object.fromEntries(this._batches.map(b => [b.name,b.capacity])), activeVertices: Object.fromEntries(this._batches.map(b => [b.name,b.count])),
      geometryBytes: bytes, cpuGeometryBytes: bytes+packedBytes+sortingBytes, geometryBytesDefinition: 'Retained GPU attribute/index capacities; excludes driver overhead. CPU count includes typed arrays and excludes JS face metadata.',
      cpuRenderMs: performance.now()-start, timingDefinition: 'CPU submission time; not GPU completion or phone performance.',
      contextLost: this._contextLost, disposed: this._disposed,
      threeInfo: { render: {...info.render}, memory: {...info.memory}, programs: info.programs.length },
    });
  }

  inspect() {
    return { ...this.stats, mode: this.mode, quality: this.quality, width: this._width, height: this._height, pixelRatio: this.pixelRatio,
      canvasWidth: this.canvas.width, canvasHeight: this.canvas.height, context: this.backend.getContext().getParameter(this.backend.getContext().VERSION),
      view: this._view ? { ...this._view, eye: [...this._view.eye], forward: [...this._view.forward], right: [...this._view.right], up: [...this._view.up],
        opticalZoom: this._view.opticalZoom || 1, observation: !!this._view.observation } : null,
      lantern: { position: this._uniforms.uLanternPosition.value.toArray(), strength: this._uniforms.uLanternStrength.value, radius: this._uniforms.uLanternRadius.value, shadowRays: false },
      disposed: this._disposed, contextLost: this._contextLost };
  }

  diagnostics() {
    const info = this.backend.info, gl = this.backend.getContext();
    return { ...this.inspect(), backend: 'THREE.WebGLRenderer', threeRevision: THREE.REVISION, webglVersion: 2,
      directVisibleCanvas: this.backend.domElement === this.canvas && gl.canvas === this.canvas,
      canvasCopy: false, ownFrameLoop: false, meshCount: this._scene.children.length,
      memory: { ...info.memory }, render: { ...info.render }, programs: info.programs.length,
      compilations: this._compilations, compilationDefinition: 'Distinct Three shader program objects observed after render, including restored contexts; not a driver compile-time measurement.', antialias: gl.getContextAttributes()?.antialias ?? null,
      bufferCapacities: Object.fromEntries(this._batches.map(b => [b.name, b.capacity])),
      bufferGrowths: this._batches.reduce((n,b) => n+b.growths, 0), staticRebuilds: this._staticRebuilds,
      retainedChunks: this._cache.size, activeChunks: this._active.length };
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this._onLost); this.canvas.removeEventListener('webglcontextrestored', this._onRestored);
    this._statusNode?.remove(); this._background.geometry.dispose(); this._background.geometry.deleteAttribute('position'); this._background.material.dispose();
    for (const b of this._batches) b.dispose(); for (const m of this._materials) m.dispose();
    this._scene.clear(); this.backend.dispose(); this._cache.clear(); this._colors.clear(); this._tags.clear(); this._lastActive.length = this._active.length = this._dynamic.length = this._effects.length = this._selection.length = 0;
    this._cachedVertices = this._staticAlpha = 0;
    Object.assign(this.stats, { disposed: true, meshCount: 0, faces: 0, generatedFaces: 0, retainedChunks: 0, activeChunks: 0, cachedVertices: 0,
      bufferCapacities: { static: 0, dynamic: 0, alpha: 0, effects: 0 }, activeVertices: { static: 0, dynamic: 0, alpha: 0, effects: 0 },
      geometryBytes: 0, cpuGeometryBytes: 0, triangles: 0, drawCalls: 0,
      threeInfo: { render: {...this.backend.info.render}, memory: {...this.backend.info.memory}, programs: this.backend.info.programs.length } });
  }
}

globalThis.CloseRenderer = Renderer;
export default Renderer;

import { frameCamera, pose } from './math.js';

// EXP-002 only. The native path is derived from close-renderer (game lines
// 284–395): CPU projection, prelit colors, batched GL triangles. Unlike that
// renderer it retains geometry/buffers and draws directly onto the visible GL
// canvas. It is deliberately labelled as corrected, not as the original game.
//
// All paths use authored RGB values directly, without gamma/tone transforms.
// Light.direction points from the surface toward the directional light:
// rgb = clamp(palette * (ambient + diffuse * max(dot(normal, light), 0))).
// Flat face normals are used in baseline; authored normals in art. Linear fog
// is mixed in the fragment shader using interpolated per-vertex eye distance.

const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;
const NATIVE_STRIDE = 9; // clip.xyzw, prelit.rgba, world eye distance
const CONTEXT_OPTIONS = {
  alpha: true,
  antialias: true,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
};
const clamp01 = value => Math.max(0, Math.min(1, value));
const now = () => performance.now();

function unavailable(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

function normalize(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function prepareScene(scene) {
  const light = scene.light;
  const direction = normalize(...light.direction);
  const lists = new Map();
  for (const mesh of scene.meshes) {
    const length = mesh.positions.length;
    if (length % 9 || mesh.colors.length !== length ||
        mesh.artColors.length !== length || mesh.normals.length !== length) {
      throw new Error(`Invalid triangle attributes on scene mesh ${mesh.id}`);
    }
    if (!length || mesh.opacity <= 0) continue;
    // Static scenery (including every board) merges into one opaque batch.
    // Animated opaque geometry shares a second retained batch. All alpha
    // triangles share one batch, allowing global back-to-front ordering even
    // when their authored opacities and animation phases differ.
    const key = mesh.opacity < 1 ? 'alpha' : mesh.animation ? 'animated' : 'static';
    if (!lists.has(key)) lists.set(key, []);
    lists.get(key).push(mesh);
  }
  const batches = [];
  for (const key of ['static', 'animated', 'alpha']) {
    const meshes = lists.get(key);
    if (!meshes?.length) continue;
    const vertexCount = meshes.reduce((sum, mesh) => sum + mesh.positions.length / 3, 0);
    const positions = new Float32Array(vertexCount * 3);
    const baseline = new Float32Array(vertexCount * 4);
    const art = new Float32Array(vertexCount * 4);
    const ranges = [];
    let start = 0;
    for (const mesh of meshes) {
      positions.set(mesh.positions, start * 3);
      const count = mesh.positions.length / 3;
      ranges.push({ mesh, start, count });
      for (let triangle = 0; triangle < mesh.positions.length; triangle += 9) {
        const p = mesh.positions;
        const ax = p[triangle + 3] - p[triangle];
        const ay = p[triangle + 4] - p[triangle + 1];
        const az = p[triangle + 5] - p[triangle + 2];
        const bx = p[triangle + 6] - p[triangle];
        const by = p[triangle + 7] - p[triangle + 1];
        const bz = p[triangle + 8] - p[triangle + 2];
        const flat = normalize(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
        const flatLight = light.ambient + light.diffuse * Math.max(0,
          flat[0] * direction[0] + flat[1] * direction[1] + flat[2] * direction[2]);
        for (let corner = 0; corner < 3; corner++) {
          const source = triangle + corner * 3;
          const target = (start + source / 3) * 4;
          const smooth = normalize(mesh.normals[source], mesh.normals[source + 1], mesh.normals[source + 2]);
          const smoothLight = light.ambient + light.diffuse * Math.max(0,
            smooth[0] * direction[0] + smooth[1] * direction[1] + smooth[2] * direction[2]);
          for (let channel = 0; channel < 3; channel++) {
            baseline[target + channel] = clamp01(mesh.colors[source + channel] * flatLight);
            art[target + channel] = clamp01(mesh.artColors[source + channel] * smoothLight);
          }
          baseline[target + 3] = art[target + 3] = clamp01(mesh.opacity);
        }
      }
      start += count;
    }
    const animated = ranges.some(range => range.mesh.animation);
    const triangleCount = vertexCount / 3;
    const batch = {
      key, positions, baseline, art, ranges, vertexCount, triangleCount,
      world: animated ? positions.slice() : positions,
      animated,
      transparent: key === 'alpha',
    };
    if (batch.transparent) {
      batch.order = Uint32Array.from({ length: triangleCount }, (_, index) => index);
      batch.depths = new Float32Array(triangleCount);
    }
    batches.push(batch);
  }
  return batches;
}

function updateScene(batches, camera, time, motion) {
  const forward = normalize(
    camera.target[0] - camera.eye[0],
    camera.target[1] - camera.eye[1],
    camera.target[2] - camera.eye[2],
  );
  for (const batch of batches) {
    if (batch.animated) {
      for (const range of batch.ranges) {
        if (!range.mesh.animation) continue;
        const translation = pose(range.mesh, time, motion);
        const end = (range.start + range.count) * 3;
        for (let i = range.start * 3; i < end; i += 3) {
          batch.world[i] = batch.positions[i] + translation[0];
          batch.world[i + 1] = batch.positions[i + 1] + translation[1];
          batch.world[i + 2] = batch.positions[i + 2] + translation[2];
        }
      }
    }
    if (batch.transparent) {
      const p = batch.world;
      for (let triangle = 0; triangle < batch.triangleCount; triangle++) {
        const offset = triangle * 9;
        // Subtracting the eye would add the same constant to every depth.
        batch.depths[triangle] = (
          (p[offset] + p[offset + 3] + p[offset + 6]) * forward[0] +
          (p[offset + 1] + p[offset + 4] + p[offset + 7]) * forward[1] +
          (p[offset + 2] + p[offset + 5] + p[offset + 8]) * forward[2]
        ) / 3;
      }
      batch.order.sort((a, b) => batch.depths[b] - batch.depths[a] || a - b);
    }
  }
}

function projectBatch(batch, frame, artistic) {
  const matrix = frame.viewProjection;
  const eye = frame.eye;
  const p = batch.world;
  const colors = artistic ? batch.art : batch.baseline;
  const output = batch.projected;
  for (let destination = 0; destination < batch.vertexCount; destination++) {
    const source = batch.transparent
      ? batch.order[Math.floor(destination / 3)] * 3 + destination % 3
      : destination;
    const sourceP = source * 3;
    const sourceC = source * 4;
    const target = destination * NATIVE_STRIDE;
    const x = p[sourceP], y = p[sourceP + 1], z = p[sourceP + 2];
    output[target] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
    output[target + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
    output[target + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
    output[target + 3] = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
    output[target + 4] = colors[sourceC];
    output[target + 5] = colors[sourceC + 1];
    output[target + 6] = colors[sourceC + 2];
    output[target + 7] = colors[sourceC + 3];
    output[target + 8] = Math.hypot(x - eye[0], y - eye[1], z - eye[2]);
  }
}

function cpuBytes(batches) {
  const buffers = new Set();
  for (const batch of batches) {
    for (const value of Object.values(batch)) {
      if (ArrayBuffer.isView(value)) buffers.add(value.buffer);
    }
  }
  return [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
}

function commonStats(scene, batches, renderer, webglVersion, geometryBytes) {
  return {
    drawCalls: 0,
    triangles: 0,
    meshes: batches.length,
    sourceMeshes: scene.meshes.length,
    renderer,
    webglVersion,
    geometryBytes,
    geometryBytesDefinition: 'Retained GPU attribute bytes, excluding driver overhead; zero for Canvas2D',
    cpuGeometryBytes: cpuBytes(batches),
    submittedTriangles: batches.reduce((sum, batch) => sum + batch.triangleCount, 0),
    cpuRenderMs: 0,
    // CPU submission time is not a GPU timer and is not a phone benchmark.
    timingDefinition: 'CPU render/submit time only; GPU completion is asynchronous',
  };
}

function dimensions(canvas, width, height, dpr) {
  const size = {
    width: Math.max(1, width), height: Math.max(1, height),
    dpr: Math.max(0.1, dpr || 1),
  };
  canvas.width = Math.max(1, Math.round(size.width * size.dpr));
  canvas.height = Math.max(1, Math.round(size.height * size.dpr));
  return size;
}

function compileProgram(gl) {
  const shaders = [];
  const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision ? 'highp' : 'mediump';
  let program;
  try {
    const sources = [
      [gl.VERTEX_SHADER, `
        precision highp float;
        attribute vec4 aClip;
        attribute vec4 aColor;
        attribute float aDistance;
        varying ${precision} vec4 vColor;
        varying ${precision} float vDistance;
        void main() {
          gl_Position = aClip;
          vColor = aColor;
          vDistance = aDistance;
        }`],
      [gl.FRAGMENT_SHADER, `
        precision ${precision} float;
        varying ${precision} vec4 vColor;
        varying ${precision} float vDistance;
        uniform vec3 uFogColor;
        uniform vec2 uFogRange;
        void main() {
          float fog = clamp((vDistance - uFogRange.x) / max(0.0001, uFogRange.y - uFogRange.x), 0.0, 1.0);
          gl_FragColor = vec4(mix(vColor.rgb, uFogColor, fog), vColor.a);
        }`],
    ];
    for (const [type, source] of sources) {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`Native shader compilation failed: ${gl.getShaderInfoLog(shader)}`);
      }
    }
    program = gl.createProgram();
    for (const shader of shaders) gl.attachShader(program, shader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Native shader link failed: ${gl.getProgramInfoLog(program)}`);
    }
    return program;
  } catch (error) {
    if (program) gl.deleteProgram(program);
    throw error;
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

function createNative(canvas, scene) {
  const gl = canvas.getContext('webgl', CONTEXT_OPTIONS);
  if (!gl) throw unavailable('WebGL1Unavailable', 'Corrected native rendering requires WebGL1. Select the explicit Canvas2D fallback.');
  const batches = prepareScene(scene);
  const program = compileProgram(gl);
  const locations = {
    clip: gl.getAttribLocation(program, 'aClip'),
    color: gl.getAttribLocation(program, 'aColor'),
    distance: gl.getAttribLocation(program, 'aDistance'),
    fogColor: gl.getUniformLocation(program, 'uFogColor'),
    fogRange: gl.getUniformLocation(program, 'uFogRange'),
  };
  let disposed = false;
  let geometryBytes = 0;
  for (const batch of batches) {
    batch.projected = new Float32Array(batch.vertexCount * NATIVE_STRIDE);
    batch.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, batch.projected.byteLength, gl.DYNAMIC_DRAW);
    geometryBytes += batch.projected.byteLength;
  }
  const state = commonStats(scene, batches, 'Corrected game-derived CPU projection / batched direct WebGL1', 1, geometryBytes);
  state.antialias = gl.getContextAttributes().antialias;
  state.fragmentPrecision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision ? 'highp' : 'mediump';
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.CULL_FACE);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  gl.useProgram(program);
  gl.uniform3fv(locations.fogColor, scene.fog.color);
  gl.uniform2f(locations.fogRange, scene.fog.near, scene.fog.far);
  for (const attribute of [locations.clip, locations.color, locations.distance]) gl.enableVertexAttribArray(attribute);
  return {
    kind: 'native',
    label: 'Native · corrected direct WebGL1',
    resize(width, height, dpr) {
      if (disposed) return;
      dimensions(canvas, width, height, dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    render({ camera, aspect, time = 0, style = 'baseline', motion = false }) {
      if (disposed) return;
      const start = now();
      const frame = frameCamera(camera, aspect);
      updateScene(batches, camera, time, motion);
      gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      state.drawCalls = state.triangles = 0;
      for (const batch of batches) {
        projectBatch(batch, frame, style === 'art');
        gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.projected);
        gl.vertexAttribPointer(locations.clip, 4, gl.FLOAT, false, NATIVE_STRIDE * FLOAT_BYTES, 0);
        gl.vertexAttribPointer(locations.color, 4, gl.FLOAT, false, NATIVE_STRIDE * FLOAT_BYTES, 4 * FLOAT_BYTES);
        gl.vertexAttribPointer(locations.distance, 1, gl.FLOAT, false, NATIVE_STRIDE * FLOAT_BYTES, 8 * FLOAT_BYTES);
        if (batch.transparent) gl.enable(gl.BLEND);
        else gl.disable(gl.BLEND);
        gl.depthMask(!batch.transparent);
        gl.drawArrays(gl.TRIANGLES, 0, batch.vertexCount);
        state.drawCalls++;
        state.triangles += batch.triangleCount;
      }
      gl.depthMask(true);
      state.cpuRenderMs = now() - start;
    },
    stats: () => ({ ...state }),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const batch of batches) gl.deleteBuffer(batch.buffer);
      gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      batches.length = 0;
      state.geometryBytes = state.cpuGeometryBytes = state.meshes = 0;
      state.disposed = true;
    },
  };
}

async function createThree(canvas, scene) {
  const gl = canvas.getContext('webgl2', CONTEXT_OPTIONS);
  if (!gl) throw unavailable('WebGL2Unavailable', 'Three.js r180 requires WebGL2; this browser/device did not provide it. Choose Native or the explicit Canvas2D fallback.');
  const THREE = await import('./vendor/three.module.min.js');
  if (THREE.REVISION !== '180') throw new Error(`Visual lab requires vendored Three.js r180; found ${THREE.REVISION}.`);
  const batches = prepareScene(scene);
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, ...CONTEXT_OPTIONS });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.sortObjects = false;
  renderer.info.autoReset = true;
  const world = new THREE.Scene();
  // Raw shaders use the shared matrix directly. This camera supplies only the
  // renderer's required scene interface; Three projection/lighting is bypassed.
  const engineCamera = new THREE.Camera();
  const uniforms = {
    uViewProjection: { value: new THREE.Matrix4() },
    uEye: { value: new THREE.Vector3() },
    uFogColor: { value: new THREE.Vector3(...scene.fog.color) },
    uFogRange: { value: new THREE.Vector2(scene.fog.near, scene.fog.far) },
  };
  let geometryBytes = 0;
  let disposed = false;
  let lastStyle;
  for (const [index, batch] of batches.entries()) {
    const geometry = new THREE.BufferGeometry();
    if (batch.transparent) {
      batch.sortedPositions = new Float32Array(batch.vertexCount * 3);
      batch.sortedColors = new Float32Array(batch.vertexCount * 4);
    }
    const position = new THREE.BufferAttribute(batch.sortedPositions || batch.world, 3);
    const color = new THREE.BufferAttribute(batch.sortedColors || batch.baseline, 4);
    if (batch.animated || batch.transparent) position.setUsage(THREE.DynamicDrawUsage);
    color.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', position);
    geometry.setAttribute('aColor', color);
    geometryBytes += position.array.byteLength + color.array.byteLength;
    const material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms,
      vertexShader: `
        precision highp float;
        in vec3 position;
        in vec4 aColor;
        uniform mat4 uViewProjection;
        uniform vec3 uEye;
        out vec4 vColor;
        out float vDistance;
        void main() {
          gl_Position = uViewProjection * vec4(position, 1.0);
          vColor = aColor;
          vDistance = length(position - uEye);
        }`,
      fragmentShader: `
        precision highp float;
        in vec4 vColor;
        in float vDistance;
        uniform vec3 uFogColor;
        uniform vec2 uFogRange;
        out vec4 outputColor;
        void main() {
          float fog = clamp((vDistance - uFogRange.x) / max(0.0001, uFogRange.y - uFogRange.x), 0.0, 1.0);
          outputColor = vec4(mix(vColor.rgb, uFogColor, fog), vColor.a);
        }`,
      transparent: batch.transparent,
      depthTest: true,
      depthWrite: !batch.transparent,
      depthFunc: THREE.LessEqualDepth,
      side: THREE.DoubleSide,
      // Three otherwise submits transparent DoubleSide meshes twice.
      forceSinglePass: true,
      blending: batch.transparent ? THREE.NormalBlending : THREE.NoBlending,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false; // Same submitted triangles as native; GPU clips.
    mesh.renderOrder = index;
    world.add(mesh);
    batch.object = mesh;
  }
  const state = commonStats(scene, batches, 'Three.js r180 WebGLRenderer / shared prelit raw shader', 2, geometryBytes);
  state.antialias = gl.getContextAttributes().antialias;
  state.fragmentPrecision = 'highp';
  return {
    kind: 'three',
    label: 'Three.js r180 · WebGL2',
    resize(width, height, dpr) {
      if (disposed) return;
      const size = dimensions(canvas, width, height, dpr);
      const pixelWidth = canvas.width;
      const pixelHeight = canvas.height;
      // One explicit physical size keeps DPR rounding identical to native.
      renderer.setPixelRatio(1);
      renderer.setSize(pixelWidth, pixelHeight, false);
      state.dpr = size.dpr;
    },
    render({ camera, aspect, time = 0, style = 'baseline', motion = false }) {
      if (disposed) return;
      const start = now();
      const frame = frameCamera(camera, aspect);
      uniforms.uViewProjection.value.fromArray(frame.viewProjection);
      uniforms.uEye.value.fromArray(frame.eye);
      updateScene(batches, camera, time, motion);
      const artistic = style === 'art';
      for (const batch of batches) {
        const geometry = batch.object.geometry;
        const color = artistic ? batch.art : batch.baseline;
        if (batch.transparent) {
          for (let destination = 0; destination < batch.vertexCount; destination++) {
            const source = batch.order[Math.floor(destination / 3)] * 3 + destination % 3;
            for (let channel = 0; channel < 3; channel++) {
              batch.sortedPositions[destination * 3 + channel] = batch.world[source * 3 + channel];
              batch.sortedColors[destination * 4 + channel] = color[source * 4 + channel];
            }
            batch.sortedColors[destination * 4 + 3] = color[source * 4 + 3];
          }
          geometry.attributes.position.needsUpdate = true;
          geometry.attributes.aColor.needsUpdate = true;
        } else {
          if (batch.animated) geometry.attributes.position.needsUpdate = true;
          if (lastStyle !== artistic) {
            geometry.attributes.aColor.array = color;
            geometry.attributes.aColor.needsUpdate = true;
          }
        }
      }
      renderer.render(world, engineCamera);
      lastStyle = artistic;
      state.drawCalls = renderer.info.render.calls;
      state.triangles = renderer.info.render.triangles;
      state.meshes = world.children.length;
      state.cpuRenderMs = now() - start;
    },
    stats: () => ({ ...state }),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const batch of batches) {
        batch.object.geometry.dispose();
        batch.object.material.dispose();
      }
      world.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      batches.length = 0;
      state.geometryBytes = state.cpuGeometryBytes = state.meshes = 0;
      state.disposed = true;
    },
  };
}

const CLIP_PLANES = [
  vertex => vertex[3] + vertex[0], vertex => vertex[3] - vertex[0],
  vertex => vertex[3] + vertex[1], vertex => vertex[3] - vertex[1],
  vertex => vertex[3] + vertex[2], vertex => vertex[3] - vertex[2],
];

function clipTriangle(vertices) {
  let polygon = vertices;
  for (const distance of CLIP_PLANES) {
    if (!polygon.length) break;
    const output = [];
    let previous = polygon[polygon.length - 1];
    let previousDistance = distance(previous);
    for (const current of polygon) {
      const currentDistance = distance(current);
      if ((currentDistance >= 0) !== (previousDistance >= 0)) {
        const t = previousDistance / (previousDistance - currentDistance);
        output.push(previous.map((value, index) => value + (current[index] - value) * t));
      }
      if (currentDistance >= 0) output.push(current);
      previous = current;
      previousDistance = currentDistance;
    }
    polygon = output;
  }
  return polygon;
}

function createCanvas(canvas, scene) {
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw unavailable('Canvas2DUnavailable', 'This browser did not provide the requested Canvas2D fallback.');
  const batches = prepareScene(scene);
  for (const batch of batches) batch.projected = new Float32Array(batch.vertexCount * NATIVE_STRIDE);
  const state = commonStats(scene, batches, 'Canvas2D CPU painter / triangle color approximation', null, 0);
  state.approximation = 'Painter ordering has no depth buffer; smooth color and fog use the clipped triangle average.';
  let size = { width: 1, height: 1, dpr: 1 };
  let disposed = false;
  return {
    kind: 'canvas',
    label: 'Canvas2D · explicit painter fallback',
    resize(width, height, dpr) {
      if (disposed) return;
      size = dimensions(canvas, width, height, dpr);
    },
    render({ camera, aspect, time = 0, style = 'baseline', motion = false }) {
      if (disposed) return;
      const start = now();
      const frame = frameCamera(camera, aspect);
      updateScene(batches, camera, time, motion);
      const polygons = [];
      const forward = normalize(
        camera.target[0] - camera.eye[0], camera.target[1] - camera.eye[1], camera.target[2] - camera.eye[2],
      );
      for (const batch of batches) {
        projectBatch(batch, frame, style === 'art');
        for (let triangle = 0; triangle < batch.triangleCount; triangle++) {
          const offset = triangle * 3 * NATIVE_STRIDE;
          const vertices = [0, 1, 2].map(corner => Array.from(batch.projected.subarray(
            offset + corner * NATIVE_STRIDE, offset + (corner + 1) * NATIVE_STRIDE,
          )));
          const clipped = clipTriangle(vertices);
          if (clipped.length < 3) continue;
          const sourceTriangle = batch.transparent ? batch.order[triangle] : triangle;
          const p = sourceTriangle * 9;
          const positions = batch.world;
          const depth = (
            (positions[p] + positions[p + 3] + positions[p + 6]) * forward[0] +
            (positions[p + 1] + positions[p + 4] + positions[p + 7]) * forward[1] +
            (positions[p + 2] + positions[p + 5] + positions[p + 8]) * forward[2]
          ) / 3;
          polygons.push({ vertices: clipped, depth });
        }
      }
      polygons.sort((a, b) => b.depth - a.depth);
      context.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      context.clearRect(0, 0, size.width, size.height);
      state.drawCalls = state.triangles = 0;
      for (const polygon of polygons) {
        const color = [0, 0, 0, 0];
        for (const vertex of polygon.vertices) {
          const fog = clamp01((vertex[8] - scene.fog.near) / Math.max(0.0001, scene.fog.far - scene.fog.near));
          for (let channel = 0; channel < 3; channel++) {
            color[channel] += vertex[4 + channel] * (1 - fog) + scene.fog.color[channel] * fog;
          }
          color[3] += vertex[7];
        }
        const count = polygon.vertices.length;
        context.fillStyle = `rgba(${Math.round(color[0] / count * 255)},${Math.round(color[1] / count * 255)},${Math.round(color[2] / count * 255)},${color[3] / count})`;
        context.beginPath();
        polygon.vertices.forEach((vertex, index) => {
          const x = (vertex[0] / vertex[3] * 0.5 + 0.5) * size.width;
          const y = (0.5 - vertex[1] / vertex[3] * 0.5) * size.height;
          if (index) context.lineTo(x, y);
          else context.moveTo(x, y);
        });
        context.closePath();
        context.fill();
        state.drawCalls++;
        state.triangles += count - 2;
      }
      state.cpuRenderMs = now() - start;
    },
    stats: () => ({ ...state }),
    dispose() {
      if (disposed) return;
      disposed = true;
      context.clearRect(0, 0, canvas.width, canvas.height);
      batches.length = 0;
      state.cpuGeometryBytes = state.meshes = 0;
      state.disposed = true;
    },
  };
}

export async function createBackend(kind, canvas, scene) {
  if (kind === 'native') return createNative(canvas, scene);
  if (kind === 'three') return createThree(canvas, scene);
  if (kind === 'canvas') return createCanvas(canvas, scene);
  throw new Error(`Unknown visual lab backend: ${kind}`);
}

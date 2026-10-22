// EXP-002: original, shared geometry. There are no renderer or game dependencies.
// All positions are world-space, Y-up; every surface is an unindexed CCW list.
const TAU = Math.PI * 2;
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], clamp(t)));
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const unit = a => {
  const l = Math.hypot(...a) || 1;
  return a.map(v => v / l);
};
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const C = {
  sea: rgb('#508F98'), seaDeep: rgb('#357F8B'), seaFar: rgb('#A3C1BC'),
  foam: rgb('#C5DCD0'), glint: rgb('#8DBCB7'),
  stone: rgb('#7C8395'), stoneDark: rgb('#505F7C'), stoneWarm: rgb('#B8AEA6'),
  grass: rgb('#7F8D75'), grassLight: rgb('#B1B78C'), grassDark: rgb('#5C786F'),
  sand: rgb('#CEBF99'), chalk: rgb('#F0DDB9'), chalkLight: rgb('#FFF0CC'),
  shadow: rgb('#586782'), roof: rgb('#365965'), roofLight: rgb('#6C8988'),
  timber: rgb('#547375'), dark: rgb('#2C4C58'), ochre: rgb('#DBA344'),
  amber: rgb('#DFC27B'), skin: rgb('#DEB990'), coast: rgb('#A2B8B1')
};

// A flat base palette is stored alongside an independently shaded art palette.
// Lighting is left to the shared renderer in both cases.
function gradient(bottom, top, lo, hi, warmth = 0) {
  return (p, n) => {
    let t = clamp((p[1] - lo) / Math.max(hi - lo, .001));
    t = clamp(t + Math.sin(p[0] * .53 + p[2] * .31) * warmth + (n?.[1] || 0) * .025);
    return mix(bottom, top, t);
  };
}

class Batch {
  constructor(id, animation) {
    this.id = id;
    this.animation = animation;
    this.p = []; this.n = []; this.c = []; this.a = [];
  }
  tri(a, b, c, color, normals, art = color) {
    const normal = normals || unit(cross(sub(b, a), sub(c, a)));
    [a, b, c].forEach((p, i) => {
      const n = Array.isArray(normal[0]) ? normal[i] : normal;
      this.p.push(...p); this.n.push(...n); this.c.push(...color);
      this.a.push(...(typeof art === 'function' ? art(p, n) : art));
    });
  }
  quad(a, b, c, d, color, normals, art = color) {
    if (normals && Array.isArray(normals[0])) {
      this.tri(a, b, c, color, [normals[0], normals[1], normals[2]], art);
      this.tri(a, c, d, color, [normals[0], normals[2], normals[3]], art);
    } else {
      this.tri(a, b, c, color, normals, art);
      this.tri(a, c, d, color, normals, art);
    }
  }
  finish() {
    return {
      id: this.id, positions: new Float32Array(this.p), normals: new Float32Array(this.n),
      colors: new Float32Array(this.c), artColors: new Float32Array(this.a), opacity: 1,
      ...(this.animation ? {animation: this.animation, origin: [0, 0, 0]} : {})
    };
  }
}

function lathe(batch, cx, cz, profile, segments, color, art = color, angle = 0, caps = true) {
  const rings = profile.map(([y, rx, rz = rx]) => Array.from({length: segments}, (_, i) => {
    const a = angle + TAU * i / segments;
    return [cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz];
  }));
  const normals = profile.map(([y, rx, rz = rx], j) => {
    const before = profile[Math.max(j - 1, 0)], after = profile[Math.min(j + 1, profile.length - 1)];
    const slope = (after[1] - before[1]) / Math.max(after[0] - before[0], .0001);
    return Array.from({length: segments}, (_, i) => {
      const a = angle + TAU * i / segments;
      return unit([Math.cos(a), -slope, Math.sin(a) * rx / Math.max(rz, .001)]);
    });
  });
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < segments; i++) {
    const k = (i + 1) % segments;
    batch.quad(rings[j][i], rings[j + 1][i], rings[j + 1][k], rings[j][k], color,
      [normals[j][i], normals[j + 1][i], normals[j + 1][k], normals[j][k]], art);
  }
  if (caps) for (const j of [0, profile.length - 1]) for (let i = 0; i < segments; i++) {
    const k = (i + 1) % segments, center = [cx, profile[j][0], cz];
    if (j === 0) batch.tri(center, rings[j][i], rings[j][k], color, [0, -1, 0], art);
    else batch.tri(center, rings[j][k], rings[j][i], color, [0, 1, 0], art);
  }
}

function ellipsoid(batch, center, radii, color, art = color, segments = 12, bands = 7, yaw = 0, rough = 0) {
  const ca = Math.cos(yaw), sa = Math.sin(yaw);
  const sample = (j, i) => {
    const phi = -Math.PI / 2 + Math.PI * j / bands, a = TAU * i / segments;
    const noise = 1 + rough * (Math.sin(a * 3 + .7) + Math.cos(a * 5 - phi * 2)) * .5;
    const x = Math.cos(phi) * Math.cos(a) * radii[0] * noise;
    const z = Math.cos(phi) * Math.sin(a) * radii[2] * noise;
    const n = unit([Math.cos(phi) * Math.cos(a) / radii[0], Math.sin(phi) / radii[1], Math.cos(phi) * Math.sin(a) / radii[2]]);
    return {p: [center[0] + x * ca + z * sa, center[1] + Math.sin(phi) * radii[1], center[2] - x * sa + z * ca],
      n: [n[0] * ca + n[2] * sa, n[1], -n[0] * sa + n[2] * ca]};
  };
  for (let j = 0; j < bands; j++) for (let i = 0; i < segments; i++) {
    const a = sample(j, i), b = sample(j + 1, i), c = sample(j + 1, i + 1), d = sample(j, i + 1);
    if (j > 0) batch.tri(a.p, b.p, d.p, color, [a.n, b.n, d.n], art);
    if (j < bands - 1) batch.tri(d.p, b.p, c.p, color, [d.n, b.n, c.n], art);
  }
}

function branch(batch, a, b, r0, r1, color, art = color, sides = 6) {
  const axis = unit(sub(b, a));
  const u = unit(cross(axis, Math.abs(axis[1]) < .9 ? [0, 1, 0] : [1, 0, 0]));
  const v = cross(axis, u);
  const ring = (p, r) => Array.from({length: sides}, (_, i) => {
    const t = TAU * i / sides, n = u.map((x, k) => x * Math.cos(t) + v[k] * Math.sin(t));
    return {p: p.map((x, k) => x + n[k] * r), n};
  });
  const ra = ring(a, r0), rb = ring(b, r1);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    batch.quad(ra[i].p, ra[j].p, rb[j].p, rb[i].p, color, [ra[i].n, ra[j].n, rb[j].n, rb[i].n], art);
    batch.tri(a, ra[j].p, ra[i].p, color, axis.map(x => -x), art);
    batch.tri(b, rb[i].p, rb[j].p, color, axis, art);
  }
}

function torus(batch, x, y, z, major, minor, color, art = color, segments = 24, sides = 4) {
  const sample = (i, j) => {
    const a = TAU * i / segments, b = TAU * j / sides;
    return {p: [x + Math.cos(a) * (major + Math.cos(b) * minor), y + Math.sin(b) * minor, z + Math.sin(a) * (major + Math.cos(b) * minor)],
      n: [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)]};
  };
  for (let i = 0; i < segments; i++) for (let j = 0; j < sides; j++) {
    const a = sample(i, j), b = sample(i, j + 1), c = sample(i + 1, j + 1), d = sample(i + 1, j);
    batch.quad(a.p, b.p, c.p, d.p, color, [a.n, b.n, c.n, d.n], art);
  }
}

// A narrow, horizontal ribbon. Width may taper at either end.
function ribbon(batch, points, width, y, color, art = color, taper = true) {
  const edges = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    const w = width * (taper ? Math.max(.13, Math.sin(Math.PI * i / (points.length - 1)) ** .45) : 1) * .5;
    return [[p[0] - dz / l * w, y, p[1] + dx / l * w], [p[0] + dz / l * w, y, p[1] - dx / l * w]];
  });
  for (let i = 0; i < edges.length - 1; i++) batch.quad(edges[i][0], edges[i + 1][0], edges[i + 1][1], edges[i][1], color, [0, 1, 0], art);
}

function arch(batch, center, width, height, angle, color, art = color) {
  const r = width / 2, spring = height - r, points = [[-r, 0], [r, 0], [r, spring]];
  for (let i = 1; i <= 10; i++) {
    const a = Math.PI * i / 10;
    points.push([Math.cos(a) * r, spring + Math.sin(a) * r]);
  }
  const normal = [Math.sin(angle), 0, Math.cos(angle)];
  const p = ([x, y]) => [center[0] + x * Math.cos(angle), center[1] + y, center[2] - x * Math.sin(angle)];
  const mid = p([0, height * .45]);
  for (let i = 0; i < points.length; i++) batch.tri(mid, p(points[i]), p(points[(i + 1) % points.length]), color, normal, art);
}

function sea(meshes) {
  const water = new Batch('sea / quiet teal field');
  // The opaque sea continues beyond the camera's far plane. A finite visible
  // back edge produces an antialiased line against the CSS sky.
  const grid = [-360, -120, -55, -35, -21, -12, -5, 2, 10, 22, 42, 75, 120, 360];
  const shade = p => {
    const distance = clamp((-p[2] - 1) / 64);
    const shallow = Math.exp(-(p[0] * p[0] + p[2] * p[2]) / 170) * .15;
    return mix(mix(C.seaDeep, C.seaFar, distance), C.glint, shallow);
  };
  for (let z = 0; z < grid.length - 1; z++) for (let x = 0; x < grid.length - 1; x++) {
    water.quad([grid[x], -.055, grid[z]], [grid[x], -.055, grid[z + 1]], [grid[x + 1], -.055, grid[z + 1]], [grid[x + 1], -.055, grid[z]], C.sea, [0, 1, 0], shade);
  }
  meshes.push(water.finish());

  const waves = new Batch('sea / scattered long ripples', {kind: 'float', amplitude: .018, speed: .6, phase: 2.1});
  const ripples = [
    [-13, 7, 4.5, .08], [10, 4, 3.2, .06], [12, 11, 5.8, .1], [-7, 14, 4.3, .065],
    [-14, -5, 5.6, .07], [9, -11, 6.5, .07], [-2, -15, 5.2, .055], [18, -2, 4.7, .07],
    [-16, 19, 5.1, .08], [4, 22, 6.7, .075], [20, 22, 7.1, .085], [-22, -14, 7.2, .06],
    [1, -24, 7.6, .05], [24, -19, 9.5, .07], [-23, 3, 6.7, .065]
  ];
  ripples.forEach(([x, z, length, width], i) => {
    const points = Array.from({length: 13}, (_, j) => [x - length / 2 + j * length / 12, z + Math.sin(j / 12 * Math.PI * 1.4 + i) * .14]);
    ribbon(waves, points, width, .008, mix(C.sea, C.glint, .55), mix(C.seaFar, C.glint, .6));
  });
  meshes.push(waves.finish());
}

// A continuous shore bend opens toward the keeper, then turns back beneath
// the lighthouse projection. Its outer extent is the same bounded cape.
const OUTLINE = [[-5.25, -2.5], [-3.65, -3.55], [-1.4, -3.75], [.85, -3.45], [2.9, -2.75], [4.35, -1.35], [5.25, .1], [4.86, 1.55], [4.07, 2.48], [3.15, 3.82], [1.7, 3.92], [.15, 3.62], [-1.25, 3.08], [-2.95, 3.36], [-3.65, 2.97], [-4.65, 2.5], [-5.3, .3], [-5.6, -1.15]];

function island(meshes) {
  const rock = new Batch('cape / sculpted strata');
  const strata = [
    [-1.1, .77, C.stoneDark], [.12, 1.035, C.stoneDark], [.56, 1.055, mix(C.stone, C.seaDeep, .25)],
    [.73, .992, mix(C.stoneWarm, C.chalk, .08)], [1.23, .965, mix(C.stone, C.roof, .17)],
    [1.39, 1.005, C.stoneWarm], [1.56, .952, mix(C.stoneWarm, C.chalk, .12)],
    [2.12, .894, mix(C.stoneWarm, C.sand, .25)], [2.24, .94, C.sand], [2.58, .91, C.stoneWarm]
  ];
  const rings = strata.map(([y, scale], j) => OUTLINE.map(([x, z], i) => {
    const offset = Math.sin(i * 1.7 + j * .6) * .075;
    const fold = Math.sin(i * .45 + j * .1) * .09;
    return [x * scale + offset, y + Math.sin(i * 1.31) * .17 + Math.cos(i * 2.3 + j * .6) * .055 + fold, z * scale + offset * .7];
  }));
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < OUTLINE.length; i++) {
    const k = (i + 1) % OUTLINE.length;
    const face = unit(cross(sub(rings[j + 1][i], rings[j][i]), sub(rings[j + 1][k], rings[j][i])));
    const radial = Math.sqrt(Math.max(.01, 1 - face[1] * face[1]));
    const normal = index => {
      const n = unit([OUTLINE[index][0] / 5.4, 0, OUTLINE[index][1] / 4.2]);
      return [n[0] * radial, face[1], n[2] * radial];
    };
    const n0 = normal(i), n1 = normal(k), base = strata[j + 1][2];
    // Preserve the authored bands in art: the original global height gradient
    // obscured these colors and made the cape read as one uniform wall.
    const art = p => mix(mix(base, C.stoneDark, .17), mix(base, C.chalkLight, .15), clamp(.45 + p[0] * -.025 + Math.sin(p[2] * 1.7) * .08));
    rock.quad(rings[j][i], rings[j + 1][i], rings[j + 1][k], rings[j][k], base, [n0, n0, n1, n1], art);
  }
  const boulders = [
    [[-4.8, .34, 1.9], [1.22, .88, 1.15], .15], [[-4.55, .1, 3.05], [.9, .46, 1.35], -.6],
    [[-3.65, .16, 3.85], [1.5, .58, .94], -.2], [[-2.0, -.07, 4.2], [1.0, .3, .7], .35],
    [[3.75, .16, 3.75], [.95, .63, 1.05], -.4], [[4.12, .28, 2.8], [.87, 1.03, 1.18], -.65],
    [[4.7, .12, 1.7], [1.25, .55, 1.1], -.7], [[5.07, .16, .55], [.9, .78, 1.15], .1],
    [[-5.58, .13, -.3], [1.2, .68, 1.15], .2], [[-5.3, -.02, -2.7], [.9, .52, 1.05], -.2],
    [[3.15, -.06, 4.95], [.57, .4, .55], .25], [[-3.65, -.08, 5.2], [1.02, .32, .53], -.3]
  ];
  boulders.forEach(([center, radii, yaw], i) => {
    const base = mix(C.stone, i % 3 === 1 ? C.sand : C.stoneDark, i % 3 === 1 ? .35 : .16);
    const summit = i % 3 === 1 ? mix(C.stoneWarm, C.sand, .45) : mix(C.stone, C.chalk, .21);
    ellipsoid(rock, center, radii, base, gradient(C.stoneDark, summit, -.25, 1.5, .08), i % 3 === 0 ? 9 : 11, 6, yaw, .17);
  });
  meshes.push(rock.finish());

  const turf = new Batch('cape / soft grass shelf and sandy path');
  const top = rings.at(-1).map(([x, y, z], i) => [x * .985, 2.78 + Math.sin(i * 1.31) * .11, z * .985]);
  const inner = OUTLINE.map(([x, z], i) => [x * .77, 2.91 + Math.sin(i * 1.31) * .035, z * .77]);
  const grassArt = p => mix(mix(C.grassDark, C.grass, .42), C.grassLight,
    clamp(.49 + Math.sin(p[0] * .75 + p[2] * .4) * .14 + Math.cos(p[2] * 1.2 - p[0] * .3) * .09));
  for (let i = 0; i < OUTLINE.length; i++) {
    const k = (i + 1) % OUTLINE.length;
    turf.quad(rings.at(-1)[i], top[i], top[k], rings.at(-1)[k], C.grassDark,
      [unit([top[i][0] * .1, 1, top[i][2] * .1]), [0, 1, 0], [0, 1, 0], unit([top[k][0] * .1, 1, top[k][2] * .1])], gradient(C.grassDark, C.grassLight, 2.4, 3.2));
    turf.quad(top[i], inner[i], inner[k], top[k], C.grass, [0, 1, 0], grassArt);
    turf.tri([0, 2.94, 0], inner[k], inner[i], C.grass, [0, 1, 0], grassArt);
  }
  const path = [];
  for (let i = 0; i <= 25; i++) {
    const t = i / 25;
    path.push([lerp(2.95, -1.64, t) + Math.sin(t * Math.PI) * .34, lerp(2.95, -.8, t) - Math.sin(t * Math.PI * 2) * .18]);
  }
  ribbon(turf, path, .52, 2.955, C.sand, mix(C.sand, C.chalkLight, .15), false);
  // Flat shared geometry shadows anchor the subjects without a shadow pass.
  ellipsoid(turf, [-1.51, 2.958, -.7], [1.47, .012, .72], C.shadow, mix(C.shadow, C.grassDark, .42), 18, 2, -.52);
  ellipsoid(turf, [2.25, 2.96, 2.21], [.45, .009, .21], C.shadow, mix(C.shadow, C.grassDark, .48), 12, 2, -.4);
  meshes.push(turf.finish());

  const foam = new Batch('shore / broken foam crescents', {kind: 'float', amplitude: .025, speed: .62, phase: .3});
  const arcs = [[-4.6, 2.2, 1.65, 1.2, .0, 2.25], [-3.45, 3.75, 1.72, 1.08, .0, 2.5], [.5, 3.65, 2.3, 1.15, .05, 2.7],
    [4.0, 2.8, 1.6, 1.5, -.55, 1.9], [4.9, .5, 1.48, 1.7, -.8, 1.6], [-5.4, -.5, 1.45, 2.1, 1.65, 4.0],
    [3.15, 4.95, .85, .65, -.2, 2.5], [-3.65, 5.2, 1.3, .74, .0, 2.8]];
  arcs.forEach(([x, z, rx, rz, start, end], i) => {
    const points = Array.from({length: 22}, (_, j) => {
      const a = lerp(start, end, j / 21), wave = 1 + Math.sin(j * .9 + i) * .018;
      return [x + Math.cos(a) * rx * wave, z + Math.sin(a) * rz * wave];
    });
    ribbon(foam, points, .08 + i % 3 * .015, .035, C.foam, mix(C.foam, C.chalkLight, .16));
    if (i < 5) ribbon(foam, points.map(([x0, z0]) => [x + (x0 - x) * 1.13, z + (z0 - z) * 1.13]), .035, .03, mix(C.foam, C.sea, .45), mix(C.foam, C.seaFar, .4));
  });
  meshes.push(foam.finish());
}

function lighthouse(meshes) {
  const x = -1.67, z = -.95;
  const walls = new Batch('lighthouse / chalk tower and cottage');
  const warmChalk = gradient(mix(C.chalk, C.sand, .18), C.chalkLight, 3, 9.5, .025);
  const chalk = (p, n) => mix(warmChalk(p, n), rgb('#A6ADC0'), clamp((n[0] * .6 - n[2] * .3) * .3, 0, .22));
  lathe(walls, x, z, [[2.96, 1.02], [3.09, 1.02], [3.17, .9], [3.3, .87], [8.91, .555], [9.06, .62], [9.16, .62]], 24, C.chalk, chalk);
  lathe(walls, x, z, [[3.15, .92], [3.27, .92], [3.32, .87]], 24, mix(C.chalk, C.sand, .2), chalk);
  lathe(walls, x, z, [[8.78, .59], [8.86, .65], [8.99, .66]], 24, C.chalk, chalk);
  lathe(walls, x, z, [[9.07, 1.05], [9.15, 1.16], [9.29, 1.16], [9.34, 1.06]], 24, mix(C.chalk, C.sand, .2), chalk);
  // A tiny low cottage lends scale without competing with the tower.
  const left = -4.22, right = -2.53, front = .91, back = -.57, floor = 2.94, eave = 3.83, ridge = 4.45;
  walls.quad([left, floor, front], [right, floor, front], [right, eave, front], [left, eave, front], C.chalk, [0, 0, 1], chalk);
  walls.quad([right, floor, back], [left, floor, back], [left, eave, back], [right, eave, back], C.chalk, [0, 0, -1], chalk);
  walls.quad([left, floor, back], [left, floor, front], [left, eave, front], [left, eave, back], C.chalk, [-1, 0, 0], chalk);
  walls.quad([right, floor, front], [right, floor, back], [right, eave, back], [right, eave, front], C.chalk, [1, 0, 0], chalk);
  walls.tri([left, eave, front], [right, eave, front], [(left + right) / 2, ridge, front], C.chalk, [0, 0, 1], chalk);
  walls.tri([right, eave, back], [left, eave, back], [(left + right) / 2, ridge, back], C.chalk, [0, 0, -1], chalk);
  meshes.push(walls.finish());

  const detail = new Batch('architecture / doors lantern and ironwork');
  const roofArt = gradient(C.roof, C.roofLight, 9.25, 11.3);
  const face = (angle, y, w, h, radius, color, art = color) => {
    arch(detail, [x + Math.sin(angle) * radius, y, z + Math.cos(angle) * radius], w, h, angle, color, art);
  };
  face(.34, 3.2, .69, 1.56, .87, mix(C.chalk, C.sand, .62), C.sand);
  face(.34, 3.21, .48, 1.35, .883, C.dark, gradient(C.dark, C.timber, 3.2, 4.6));
  [[5.47, .4], [7.21, .36]].forEach(([y, w]) => {
    const r = lerp(.87, .56, (y - 3.3) / 5.6);
    face(.34, y - .035, w + .13, .82, r + .006, C.sand, C.chalk);
    face(.34, y, w, .7, r + .022, C.dark, mix(C.roof, C.seaFar, .22));
    face(.34, y + .08, w * .55, .49, r + .029, C.roofLight, mix(C.seaFar, C.chalk, .3));
  });
  face(1.78, 6.3, .3, .69, .72, C.dark, mix(C.roof, C.seaFar, .25));
  const handle = [x + Math.sin(.34) * .9 + .13, 3.78, z + Math.cos(.34) * .9 - .04];
  ellipsoid(detail, handle, [.027, .027, .027], C.ochre, C.amber, 6, 4);
  // Amber panels are deliberately opaque illustrated glass in every backend.
  for (let i = 0; i < 12; i++) {
    const a = TAU * i / 12, b = TAU * (i + 1) / 12;
    const p = (angle, y) => [x + Math.cos(angle) * .635, y, z + Math.sin(angle) * .635];
    const col = i > 0 && i < 6 ? C.amber : mix(C.roofLight, C.amber, .34);
    detail.quad(p(a, 9.42), p(a, 10.28), p(b, 10.28), p(b, 9.42), col,
      [[Math.cos(a), 0, Math.sin(a)], [Math.cos(a), 0, Math.sin(a)], [Math.cos(b), 0, Math.sin(b)], [Math.cos(b), 0, Math.sin(b)]],
      gradient(mix(C.ochre, C.chalk, .2), C.chalkLight, 9.35, 10.3));
  }
  lathe(detail, x, z, [[9.34, .73], [9.43, .73]], 16, C.roof, roofArt);
  lathe(detail, x, z, [[10.25, .72], [10.34, .78]], 16, C.roof, roofArt);
  lathe(detail, x, z, [[10.31, .87], [10.39, .95], [10.47, .86], [10.99, .15], [11.05, .125]], 20, C.roof, roofArt);
  lathe(detail, x, z, [[11.03, .095], [11.29, .035], [11.35, .012]], 10, C.roof, roofArt);
  torus(detail, x, 9.76, z, 1.058, .028, C.timber, mix(C.roof, C.roofLight, .58));
  torus(detail, x, 9.48, z, 1.058, .017, C.timber, C.roofLight);
  for (let i = 0; i < 12; i++) {
    const a = TAU * i / 12;
    branch(detail, [x + Math.cos(a) * 1.058, 9.31, z + Math.sin(a) * 1.058], [x + Math.cos(a) * 1.058, 9.77, z + Math.sin(a) * 1.058], .019, .019, C.timber, C.roofLight, 5);
    if (i % 2 === 0) branch(detail, [x + Math.cos(a) * .65, 9.4, z + Math.sin(a) * .65], [x + Math.cos(a) * .65, 10.31, z + Math.sin(a) * .65], .027, .027, C.roof, C.roofLight, 5);
  }
  // A broad, two-plane cottage roof, with a soft ridge and warm fascia.
  const mid = (left + right) / 2, overhang = .15;
  detail.quad([left - overhang, eave + .015, front + overhang], [mid, ridge + .045, front + overhang], [mid, ridge + .045, back - overhang], [left - overhang, eave + .015, back - overhang], C.roof, undefined, mix(C.roof, C.roofLight, .3));
  detail.quad([mid, ridge + .045, front + overhang], [right + overhang, eave + .015, front + overhang], [right + overhang, eave + .015, back - overhang], [mid, ridge + .045, back - overhang], C.roof, undefined, mix(C.roof, C.roofLight, .55));
  branch(detail, [mid, ridge + .035, back - overhang], [mid, ridge + .035, front + overhang], .036, .036, C.roof, C.roofLight, 6);
  arch(detail, [-3.54, 2.96, front + .012], .43, .74, 0, C.dark, C.timber);
  arch(detail, [-2.91, 3.25, front + .012], .32, .4, 0, C.dark, mix(C.roofLight, C.seaFar, .3));
  meshes.push(detail.finish());
}

function plants(meshes) {
  const shrubs = new Batch('vegetation / wind-clipped shrubs');
  const bushPoints = [[-4.25, 1.83, .56], [-3.73, 2.26, .4], [-4.17, -1.45, .42], [3.66, .46, .43], [3.26, 1.08, .37], [.83, -2.72, .44], [1.6, -2.54, .29]];
  bushPoints.forEach(([x, z, s], i) => {
    const col = i % 2 ? C.grassDark : C.grass;
    ellipsoid(shrubs, [x, 3.02 + s * .28, z], [s, s * .62, s * .8], col,
      gradient(C.grassDark, C.grassLight, 2.88, 3.7, .03), 9, 5, i * .7, .09);
    ellipsoid(shrubs, [x + s * .6, 2.99 + s * .23, z - s * .2], [s * .63, s * .52, s * .65], col,
      gradient(C.grassDark, C.grassLight, 2.88, 3.65, .03), 8, 4, i * .4, .08);
  });
  const crowns = new Batch('vegetation / two wind-shaped crowns', {kind: 'sway', amplitude: .018, speed: .92, phase: .6});
  const bark = mix(C.timber, C.sand, .42);
  const crownShade = gradient(mix(C.grassDark, C.roof, .3), mix(C.grassLight, C.ochre, .13), 3.6, 5.4, .035);
  [[3.18, -1.24, 1], [-4.42, 1.37, .72]].forEach(([x, z, scale]) => {
    const at = (dx, dy, dz = 0) => [x + dx * scale, 2.94 + dy * scale, z + dz * scale];
    // Trunks and branches share one direction of prevailing wind. Crowns are
    // flattened, asymmetric silhouettes rather than spherical tree lollipops.
    branch(shrubs, at(0, 0), at(.03, .65), .075 * scale, .057 * scale, bark, bark, 7);
    branch(shrubs, at(.03, .65), at(.28, 1.32), .057 * scale, .036 * scale, bark, C.sand, 7);
    branch(shrubs, at(.28, 1.32), at(.74, 1.72), .036 * scale, .013 * scale, bark, C.sand, 6);
    branch(shrubs, at(.15, 1.02), at(-.29, 1.43, .03), .035 * scale, .012 * scale, bark, C.sand, 6);
    branch(shrubs, at(.28, 1.3), at(.85, 1.38, .08), .03 * scale, .01 * scale, bark, C.sand, 6);
    ellipsoid(crowns, at(-.12, 1.47), [.69 * scale, .24 * scale, .43 * scale], C.grassDark, crownShade, 10, 5, -.25, .1);
    ellipsoid(crowns, at(.64, 1.51, .025), [.85 * scale, .26 * scale, .46 * scale], C.grass, crownShade, 11, 5, -.18, .09);
    ellipsoid(crowns, at(.43, 1.84, -.06), [.8 * scale, .22 * scale, .4 * scale], C.grass, crownShade, 10, 5, -.2, .085);
  });
  meshes.push(shrubs.finish());
  meshes.push(crowns.finish());

  const grass = new Batch('vegetation / grass and seed heads', {kind: 'sway', amplitude: .034, speed: 1.14, phase: .6});
  const tufts = [[-3.4, 2.55], [-4.5, .4], [-2.55, 2.83], [-.45, 3.0], [1.02, 3.2], [3.61, 1.7], [4.1, -.5], [2.6, -2.12], [.15, -2.85], [-2.9, -2.65], [-3.95, -1.5], [.1, 1.5], [2.9, .22], [3.28, 2.45], [-4.22, 1.6], [1.35, -1.6]];
  tufts.forEach(([x, z], k) => {
    for (let j = 0; j < 5; j++) {
      const a = k * 1.72 + j * 2.4, height = .22 + (j % 3) * .095, width = .025;
      const base = [x + Math.cos(a) * .07, 2.94, z + Math.sin(a) * .07];
      const middle = [base[0] + Math.cos(a) * .09, 2.94 + height * .58, base[2] + Math.sin(a) * .09];
      const tip = [base[0] + Math.cos(a) * .19 + .055, 2.94 + height, base[2] + Math.sin(a) * .19];
      const side = [Math.cos(a + 1.5) * width, 0, Math.sin(a + 1.5) * width];
      const a0 = base.map((v, i) => v - side[i]), a1 = base.map((v, i) => v + side[i]);
      const b0 = middle.map((v, i) => v - side[i] * .68), b1 = middle.map((v, i) => v + side[i] * .68);
      const art = gradient(C.grassDark, C.grassLight, 2.9, 3.5);
      grass.quad(a0, a1, b1, b0, C.grassDark, undefined, art);
      grass.tri(b0, b1, tip, C.grass, undefined, art);
      // Back faces are explicit so both renderers may use back-face culling.
      grass.quad(b0, b1, a1, a0, C.grassDark, undefined, art);
      grass.tri(tip, b1, b0, C.grass, undefined, art);
    }
    if (k % 3 === 0) {
      const a = [x + .04, 2.94, z], b = [x + .13, 3.53, z + .03];
      branch(grass, a, b, .012, .008, C.grassDark, C.grassLight, 4);
      ellipsoid(grass, b, [.038, .1, .035], C.sand, mix(C.sand, C.chalk, .25), 5, 4, .4);
    }
  });
  meshes.push(grass.finish());
}

function keeper(meshes) {
  const person = new Batch('keeper / ochre coat and broad hat');
  const x = 2.05, z = 2.25;
  const coat = gradient(mix(C.ochre, C.sand, .15), mix(C.ochre, C.chalkLight, .22), 3.18, 4.15);
  branch(person, [x - .105, 3.04, z], [x - .09, 3.4, z], .065, .075, C.dark, C.roof, 7);
  branch(person, [x + .105, 3.04, z - .055], [x + .09, 3.4, z], .065, .075, C.dark, C.roof, 7);
  ellipsoid(person, [x - .11, 3.02, z + .035], [.09, .065, .15], C.dark, C.dark, 8, 4);
  ellipsoid(person, [x + .11, 3.02, z - .02], [.09, .065, .15], C.dark, C.dark, 8, 4);
  lathe(person, x, z, [[3.28, .24, .18], [3.38, .22, .175], [3.76, .225, .16], [3.87, .125, .12]], 10, C.ochre, coat);
  branch(person, [x - .2, 3.75, z], [x - .28, 3.4, z + .025], .083, .061, C.ochre, coat, 7);
  branch(person, [x + .2, 3.75, z], [x + .36, 3.52, z + .045], .083, .061, C.ochre, coat, 7);
  ellipsoid(person, [x + .36, 3.49, z + .05], [.061, .07, .06], C.skin, mix(C.skin, C.chalk, .16), 7, 4);
  ellipsoid(person, [x, 3.99, z], [.137, .16, .129], C.skin, gradient(C.skin, C.chalk, 3.85, 4.14), 10, 6);
  lathe(person, x, z, [[4.08, .23, .2], [4.115, .23, .2], [4.14, .14, .13], [4.25, .13, .12], [4.27, .095, .09]], 12, C.ochre, coat);
  branch(person, [x + .41, 2.98, z + .06], [x + .39, 3.75, z + .06], .018, .016, C.timber, C.sand, 5);
  meshes.push(person.finish());
}

function coast(meshes) {
  const distant = new Batch('horizon / distant folded headlands');
  const profiles = [
    {z: -43, points: [[-66, -.2], [-49, 1.1], [-39, 4.6], [-30, 5.4], [-23, 4.15], [-15, 3.9], [-9, 1.7], [4, .05]], depth: 12},
    {z: -51, points: [[-4, -.1], [8, 1.15], [17, 2.7], [27, 3.45], [35, 5.1], [46, 3.8], [62, 4.4], [80, .1]], depth: 18}
  ];
  profiles.forEach(({z, points, depth}, k) => {
    points.slice(0, -1).forEach(([x, y], i) => {
      const next = points[i + 1], col = mix(C.coast, C.seaFar, k * .17);
      distant.quad([x, -.1, z], [next[0], -.1, z], [next[0], next[1], z - depth * .2], [x, y, z - depth * .2], col, unit([0, .5, 1]), gradient(mix(C.coast, C.seaFar, .3), mix(C.coast, C.chalk, .12), 0, 6));
      distant.quad([x, y, z - depth * .2], [next[0], next[1], z - depth * .2], [next[0], next[1] * .6, z - depth], [x, y * .6, z - depth], col, unit([0, 1, .2]), col);
    });
  });
  meshes.push(distant.finish());
}

export function createScene() {
  const meshes = [];
  sea(meshes); coast(meshes); island(meshes); lighthouse(meshes); plants(meshes); keeper(meshes);
  return {
    meshes,
    background: {top: rgb('#CFDEDA'), bottom: rgb('#F3E8CF')},
    fog: {color: rgb('#C8D9D1'), near: 27, far: 100},
    light: {direction: unit([-.55, .86, .48]), ambient: .64, diffuse: .36},
    bounds: {min: [-360, -1.1, -360], max: [360, 11.35, 360]}
  };
}

export function cameraFor(aspect, route = 0, orbit = 0) {
  const ratio = Math.max(.35, Number.isFinite(aspect) ? aspect : 1);
  const t = clamp(Number.isFinite(route) ? route : 0);
  // Narrow viewports step back while retaining the entire tower, cape and sea.
  const portrait = clamp((1.18 - ratio) / .7);
  const distance = lerp(24.8, 35.5, portrait);
  const yaw = .39 + t * .23 + (Number.isFinite(orbit) ? orbit : 0);
  const elevation = lerp(.395, .345, portrait) - Math.sin(t * Math.PI) * .025;
  const target = [lerp(-.15, .2, t), lerp(4.6, 4.25, t), .3];
  return {
    eye: [target[0] + Math.sin(yaw) * distance * Math.cos(elevation), target[1] + Math.sin(elevation) * distance, target[2] + Math.cos(yaw) * distance * Math.cos(elevation)],
    target, fov: 45, near: .1, far: 180
  };
}

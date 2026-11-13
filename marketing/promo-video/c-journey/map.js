/**
 * The dotted night map of Europe for "The Journey".
 *
 * World coordinates are screen pixels of the wide view (camera x=960, y=540, zoom=1).
 * Everything drawn here is a function of the state object M, which the timeline tweens;
 * draw(t) is called once per frame.
 */
import { geoAzimuthalEqualArea, geoPath, geoDistance } from 'd3-geo';
import { feature } from 'topojson-client';
import { W, H, rng, clamp, lerp } from '/shared/kit.js';

// Longitude, latitude
export const CITY = {
  lisbon: [-9.14, 38.72], madrid: [-3.7, 40.42], paris: [2.35, 48.86], berlin: [13.4, 52.52], warsaw: [21.01, 52.23], riga: [24.11, 56.95],
  porto: [-8.61, 41.15], seville: [-5.98, 37.39], barcelona: [2.17, 41.39], marseille: [5.37, 43.3], bordeaux: [-0.58, 44.84],
  milan: [9.19, 45.46], rome: [12.5, 41.9], naples: [14.27, 40.85], athens: [23.73, 37.98], thessaloniki: [22.94, 40.64],
  sofia: [23.32, 42.7], bucharest: [26.1, 44.43], cluj: [23.59, 46.77], budapest: [19.04, 47.5], munich: [11.58, 48.14],
  hamburg: [9.99, 53.55], cologne: [6.96, 50.94], amsterdam: [4.9, 52.37], dublin: [-6.26, 53.35], cork: [-8.47, 51.9],
  stockholm: [18.07, 59.33], gothenburg: [11.97, 57.71],
};

/** Sofia's overland route */
export const ROUTE = ['lisbon', 'madrid', 'paris', 'berlin', 'warsaw', 'riga'];

/** The other participants: 12 countries in all, everyone travels to Riga */
export const ORIGINS = [
  'cork', 'dublin', 'porto', 'seville', 'bordeaux', 'barcelona', 'marseille', 'amsterdam', 'cologne', 'milan', 'hamburg', 'munich',
  'gothenburg', 'rome', 'naples', 'stockholm', 'budapest', 'thessaloniki', 'sofia', 'cluj', 'athens', 'bucharest',
];

const EXT = { x0: -420, y0: -300, x1: 2760, y1: 1560 }; // the camera never leaves this area
const GRID = 6.4;
const TAU = Math.PI * 2;

const smooth = (v) => {
  const x = clamp(v);
  return x * x * (3 - 2 * x);
};

function quad(a, b, lift) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0) { nx = -nx; ny = -ny; } // always bulge towards the north, like a great circle on this projection
  return { a, b, c: { x: (a.x + b.x) / 2 + nx * len * lift, y: (a.y + b.y) / 2 + ny * len * lift }, len };
}

export function pointOn(q, t) {
  const u = 1 - t;
  return { x: u * u * q.a.x + 2 * u * t * q.c.x + t * t * q.b.x, y: u * u * q.a.y + 2 * u * t * q.c.y + t * t * q.b.y };
}

/** Draw the part of a curve between t0 and t1 */
function strokePart(ctx, q, t0, t1) {
  if (t1 <= t0) return;
  const p0 = pointOn(q, t0);
  const p1 = pointOn(q, t1);
  // control point of the sub-curve (the blossom of the quadratic at t0, t1)
  const wa = (1 - t0) * (1 - t1);
  const wc = (1 - t0) * t1 + t0 * (1 - t1);
  const wb = t0 * t1;
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.quadraticCurveTo(wa * q.a.x + wc * q.c.x + wb * q.b.x, wa * q.a.y + wc * q.c.y + wb * q.b.y, p1.x, p1.y);
  ctx.stroke();
}

export async function createMap(canvas) {
  const ctx = canvas.getContext('2d');
  const topo = await (await fetch('/node_modules/world-atlas/land-50m.json')).json();
  const land = feature(topo, topo.objects.land);

  const projection = geoAzimuthalEqualArea().rotate([-10, -52]);
  projection.fitExtent([[730, 120], [1830, 990]], {
    type: 'MultiPoint',
    coordinates: [[-9.6, 36.9], [24, 37.4], [27, 44.4], [18, 60.6], [-6.3, 53.4], [-9.5, 38.7], [25, 57]],
  });
  projection.clipExtent([[EXT.x0, EXT.y0], [EXT.x1, EXT.y1]]);
  const P = (ll) => {
    const [x, y] = projection(ll);
    return { x, y };
  };

  // Land outline as a path in world coordinates (coastlines only, no borders)
  const landPath = new Path2D();
  geoPath(projection, landPath)(land);

  // Land dots: rasterise the land once and sample it on a staggered grid
  const mw = Math.ceil(EXT.x1 - EXT.x0);
  const mh = Math.ceil(EXT.y1 - EXT.y0);
  const mask = document.createElement('canvas');
  mask.width = mw;
  mask.height = mh;
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  mctx.translate(-EXT.x0, -EXT.y0);
  mctx.fillStyle = '#fff';
  mctx.fill(landPath);
  const data = mctx.getImageData(0, 0, mw, mh).data;
  const isLand = (x, y) => {
    const ix = Math.round(x - EXT.x0);
    const iy = Math.round(y - EXT.y0);
    return ix >= 0 && iy >= 0 && ix < mw && iy < mh && data[(iy * mw + ix) * 4 + 3] > 127;
  };
  const r = rng(2026);
  const dx = [];
  const dy = [];
  const dBase = [];
  const dPhase = [];
  const rowH = GRID * 0.866;
  for (let j = 0, y = EXT.y0; y < EXT.y1; j++, y += rowH) {
    for (let x = EXT.x0 + (j % 2 ? GRID / 2 : 0); x < EXT.x1; x += GRID) {
      const base = 0.5 + 0.5 * r();
      const phase = r() * TAU;
      if (!isLand(x, y)) continue;
      dx.push(x);
      dy.push(y);
      dBase.push(base);
      dPhase.push(phase);
    }
  }
  const N = dx.length;
  const X = Float32Array.from(dx);
  const Y = Float32Array.from(dy);
  const BASE = Float32Array.from(dBase);
  const PHASE = Float32Array.from(dPhase);

  // Routes
  const city = Object.fromEntries(Object.entries(CITY).map(([k, ll]) => [k, P(ll)]));
  const legs = ROUTE.slice(0, -1).map((k, i) => {
    const q = quad(city[k], city[ROUTE[i + 1]], [0.1, 0.12, 0.1, 0.1, 0.12][i]);
    q.km = geoDistance(CITY[k], CITY[ROUTE[i + 1]]) * 6371;
    return q;
  });
  const lr = rng(7);
  const conv = ORIGINS.map((k) => ({ key: k, ...quad(city[k], city.riga, lr.range(0.1, 0.24)) }));

  /** Everything the timeline animates */
  const M = {
    cam: { x: W / 2, y: H / 2, zoom: 1 },
    reveal: 0, // 0..1 the map appears in a ring that spreads from Riga
    dim: 1, // overall brightness of the map
    land: 1, // coast + land tint
    legs: legs.map(() => ({ p: 0 })),
    routeAlpha: 1,
    head: { a: 0 }, // the travelling light on Sofia's route
    conv: conv.map(() => ({ p: 0, lit: 0, check: 0 })),
    convAlpha: 0,
    marks: Object.fromEntries(ROUTE.map((k) => [k, { on: 0, ripple: 1, label: 0, check: 0 }])),
    rigaGlow: 0,
    originDots: 0,
    labelFloor: 5000, // labels below this screen height fade out (keeps them clear of captions)
  };

  const toScreen = (p) => ({ x: (p.x - M.cam.x) * M.cam.zoom + W / 2, y: (p.y - M.cam.y) * M.cam.zoom + H / 2 });

  /** Where the travelling light is right now (world coordinates) and which leg it is on */
  function head() {
    let i = 0;
    for (let k = 0; k < legs.length; k++) if (M.legs[k].p > 0) i = k;
    const p = M.legs[i].p;
    return { ...pointOn(legs[i], p), leg: i, p };
  }

  /** Kilometres travelled so far */
  function km() {
    return legs.reduce((sum, q, i) => sum + q.km * M.legs[i].p, 0);
  }

  const BUCKETS = 14;
  const lists = Array.from({ length: BUCKETS * 2 }, () => new Int32Array(N));
  const counts = new Int32Array(BUCKETS * 2);

  function draw(t) {
    const { x: cx, y: cy, zoom } = M.cam;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (M.dim <= 0.001) return;
    ctx.setTransform(zoom, 0, 0, zoom, W / 2 - cx * zoom, H / 2 - cy * zoom);
    const px = 1 / zoom; // one screen pixel in world units

    // visible world rectangle
    const vx0 = cx - W / 2 / zoom - 8;
    const vx1 = cx + W / 2 / zoom + 8;
    const vy0 = cy - H / 2 / zoom - 8;
    const vy1 = cy + H / 2 / zoom + 8;

    // Land: a faint body and coastline so the continent reads at any zoom
    const revealR = M.reveal * 2300;
    if (M.land > 0 && M.reveal > 0.02) {
      ctx.save();
      if (M.reveal < 1) {
        ctx.beginPath();
        ctx.arc(city.riga.x, city.riga.y, Math.max(1, revealR - 40), 0, TAU);
        ctx.clip();
      }
      ctx.fillStyle = `rgba(139, 92, 246, ${0.05 * M.land * M.dim})`;
      ctx.fill(landPath);
      ctx.lineWidth = 1.1 * px;
      ctx.strokeStyle = `rgba(196, 181, 253, ${0.2 * M.land * M.dim})`;
      ctx.stroke(landPath);
      ctx.restore();
    }

    // Lights that brighten the dots around them
    const lights = [];
    const h = head();
    if (M.head.a > 0.01) lights.push({ x: h.x, y: h.y, s: 1.5 * M.head.a, r: 120 });
    for (const k of ROUTE) if (M.marks[k].on > 0.01) lights.push({ x: city[k].x, y: city[k].y, s: 0.9 * M.marks[k].on, r: 60 });
    if (M.rigaGlow > 0.01) lights.push({ x: city.riga.x, y: city.riga.y, s: 1.4 * M.rigaGlow, r: 110 });

    // Dots, grouped by brightness so the canvas state changes rarely
    counts.fill(0);
    const feather = 150;
    for (let i = 0; i < N; i++) {
      const x = X[i];
      const y = Y[i];
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      let a = 0.42 * BASE[i] * (0.82 + 0.18 * Math.sin(t * 1.6 + PHASE[i]));
      let warm = 0;
      if (M.reveal < 1) {
        const d = Math.hypot(x - city.riga.x, y - city.riga.y);
        const k = (revealR - d) / feather;
        if (k <= 0) continue;
        a *= smooth(k);
        if (k < 1.6) { a += 0.5 * smooth(1 - Math.abs(k - 0.8) / 0.8) * (1 - M.reveal * 0.6); warm = 1; } // the bright front of the ring
      }
      for (let l = 0; l < lights.length; l++) {
        const L = lights[l];
        const ddx = x - L.x;
        const ddy = y - L.y;
        const d2 = ddx * ddx + ddy * ddy;
        const rr = L.r * L.r;
        if (d2 < rr * 6) {
          const g = Math.exp(-d2 / (2 * rr)) * L.s;
          a += 0.55 * g;
          if (g > 0.35) warm = 1;
        }
      }
      a *= M.dim;
      if (a < 0.012) continue;
      const b = Math.min(BUCKETS - 1, Math.floor(clamp(a, 0, 0.999) * BUCKETS)) + (warm ? BUCKETS : 0);
      lists[b][counts[b]++] = i;
    }
    const rad = 1.12 * Math.pow(zoom, 0.72) * px;
    for (let b = 0; b < BUCKETS * 2; b++) {
      const n = counts[b];
      if (!n) continue;
      const alpha = ((b % BUCKETS) + 0.75) / BUCKETS;
      ctx.fillStyle = b >= BUCKETS ? `rgba(245, 208, 254, ${alpha})` : `rgba(196, 181, 253, ${alpha})`;
      ctx.beginPath();
      const list = lists[b];
      for (let k = 0; k < n; k++) {
        const i = list[k];
        ctx.moveTo(X[i] + rad, Y[i]);
        ctx.arc(X[i], Y[i], rad, 0, TAU);
      }
      ctx.fill();
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // The other participants' routes, all ending in Riga
    if (M.convAlpha > 0.004) {
      for (let i = 0; i < conv.length; i++) {
        const q = conv[i];
        const s = M.conv[i];
        if (s.p <= 0) continue;
        const grad = ctx.createLinearGradient(q.a.x, q.a.y, q.b.x, q.b.y);
        const a = M.convAlpha * M.dim * (0.62 + 0.38 * s.lit);
        grad.addColorStop(0, `rgba(196, 167, 255, ${0.9 * a})`);
        grad.addColorStop(1, `rgba(249, 138, 196, ${a})`);
        ctx.strokeStyle = `rgba(232, 121, 249, ${(0.1 + 0.16 * s.lit) * M.convAlpha * M.dim})`;
        ctx.lineWidth = (6 + 3 * s.lit) * px;
        strokePart(ctx, q, 0, s.p);
        ctx.strokeStyle = grad;
        ctx.lineWidth = (1.9 + 1.1 * s.lit) * px;
        strokePart(ctx, q, 0, s.p);
        // a small light runs ahead while the line is being drawn
        if (s.p < 0.995) {
          const hp = pointOn(q, s.p);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * M.convAlpha * M.dim})`;
          ctx.beginPath();
          ctx.arc(hp.x, hp.y, 3.2 * px, 0, TAU);
          ctx.fill();
        }
      }
    }
    // Home towns of the other participants
    if (M.originDots > 0.01) {
      for (let i = 0; i < conv.length; i++) {
        const q = conv[i];
        const s = M.conv[i];
        const a = M.originDots * M.dim * (0.55 + 0.45 * s.lit);
        ctx.fillStyle = `rgba(221, 214, 254, ${a})`;
        ctx.beginPath();
        ctx.arc(q.a.x, q.a.y, (3.4 + 1.2 * s.lit) * px, 0, TAU);
        ctx.fill();
      }
    }

    // Sofia's route: a soft glow, the bright line, then the travelling light
    if (M.routeAlpha > 0.004) {
      const ra = M.routeAlpha * M.dim;
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < legs.length; i++) {
          const p = M.legs[i].p;
          if (p <= 0) continue;
          const q = legs[i];
          if (pass === 0) {
            ctx.strokeStyle = `rgba(217, 70, 239, ${0.14 * ra})`;
            ctx.lineWidth = 20 * px;
          } else if (pass === 1) {
            ctx.strokeStyle = `rgba(232, 121, 249, ${0.3 * ra})`;
            ctx.lineWidth = 9 * px;
          } else {
            const grad = ctx.createLinearGradient(city.lisbon.x, city.lisbon.y, city.riga.x, city.riga.y);
            grad.addColorStop(0, `rgba(192, 132, 252, ${ra})`);
            grad.addColorStop(0.55, `rgba(232, 121, 249, ${ra})`);
            grad.addColorStop(1, `rgba(251, 113, 183, ${ra})`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 4.2 * px;
          }
          strokePart(ctx, q, 0, p);
        }
      }
    }

    // City markers on Sofia's route
    for (const k of ROUTE) {
      const m = M.marks[k];
      if (m.on <= 0.01) continue;
      const c = city[k];
      const a = m.on * M.dim;
      if (m.ripple < 1) {
        ctx.strokeStyle = `rgba(245, 208, 254, ${0.7 * (1 - m.ripple) * a})`;
        ctx.lineWidth = 2.2 * px;
        ctx.beginPath();
        ctx.arc(c.x, c.y, (8 + 46 * m.ripple) * px, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(22, 13, 48, ${a})`;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 8.5 * px * m.on, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 255, 255, ${a})`;
      ctx.lineWidth = 2.6 * px;
      ctx.stroke();
      ctx.fillStyle = `rgba(244, 114, 182, ${a})`;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 3.4 * px * m.on, 0, TAU);
      ctx.fill();
    }

    // Riga, where everyone is going
    if (M.rigaGlow > 0.01) {
      const c = city.riga;
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 70 * px * (0.8 + 0.2 * Math.sin(t * 2.2)));
      g.addColorStop(0, `rgba(251, 207, 232, ${0.55 * M.rigaGlow * M.dim})`);
      g.addColorStop(0.4, `rgba(236, 72, 153, ${0.2 * M.rigaGlow * M.dim})`);
      g.addColorStop(1, 'rgba(236, 72, 153, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 80 * px, 0, TAU);
      ctx.fill();
    }

    // The travelling light
    if (M.head.a > 0.01) {
      const a = M.head.a * M.dim;
      const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 58 * px);
      g.addColorStop(0, `rgba(255, 255, 255, ${0.95 * a})`);
      g.addColorStop(0.18, `rgba(251, 207, 232, ${0.7 * a})`);
      g.addColorStop(0.5, `rgba(232, 121, 249, ${0.22 * a})`);
      g.addColorStop(1, 'rgba(232, 121, 249, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 58 * px, 0, TAU);
      ctx.fill();
    }

    // Screen space: labels and check marks keep their size whatever the zoom
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textBaseline = 'middle';
    for (const k of ROUTE) {
      const m = M.marks[k];
      if (m.label <= 0.01) continue;
      const s = toScreen(city[k]);
      ctx.font = '600 28px "Inter Variable"';
      ctx.letterSpacing = '5px';
      const text = k.toUpperCase();
      const side = LABEL_SIDE[k] || [18, 34];
      ctx.textAlign = side[0] < 0 ? 'right' : 'left';
      ctx.shadowColor = 'rgba(8, 4, 24, 0.9)';
      ctx.shadowBlur = 14;
      const clear = clamp((M.labelFloor - (s.y + side[1])) / 46);
      if (clear <= 0.01) continue;
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, m.label * (0.35 + 0.65 * M.dim)) * clear})`;
      ctx.fillText(text, s.x + side[0], s.y + side[1]);
      ctx.shadowBlur = 0;
    }
    ctx.letterSpacing = '0px';
    for (let i = 0; i < conv.length; i++) {
      const s = M.conv[i];
      if (s.check <= 0.01) continue;
      drawCheck(ctx, toScreen(conv[i].a), s.check, M.dim);
    }
    if (M.marks.lisbon.check > 0.01) drawCheck(ctx, toScreen(city.lisbon), M.marks.lisbon.check, M.dim);
  }

  return { M, draw, city, legs, conv, toScreen, head, km, pointOn };
}

/** Where each label sits relative to its city (x, y offset in screen pixels) */
const LABEL_SIDE = {
  lisbon: [-20, 26],
  madrid: [20, 30],
  paris: [-22, -4],
  berlin: [0, -34],
  warsaw: [22, 26],
  riga: [24, -6],
};

function drawCheck(ctx, p, k, dim) {
  const r = 15 * k;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.shadowColor = 'rgba(16, 185, 129, 0.75)';
  ctx.shadowBlur = 18 * k;
  ctx.fillStyle = `rgba(16, 185, 129, ${dim})`;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(255, 255, 255, ${dim})`;
  ctx.lineWidth = 3.4 * k;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-6.2 * k, 0.6 * k);
  ctx.lineTo(-1.8 * k, 5 * k);
  ctx.lineTo(6.6 * k, -4.6 * k);
  ctx.stroke();
  ctx.restore();
}

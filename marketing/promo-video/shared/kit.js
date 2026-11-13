/**
 * Shared engine for the promo videos.
 *
 * Every picture is a pure function of time: one paused GSAP timeline plus optional
 * per-frame draw functions. The renderer calls window.__promo.seek(t) for each frame
 * and takes a screenshot, so nothing may depend on the real clock (no CSS transitions,
 * no requestAnimationFrame, no Math.random: use rng()).
 */
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase.js';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin.js';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin.js';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin.js';

gsap.registerPlugin(CustomEase, MotionPathPlugin, DrawSVGPlugin, MorphSVGPlugin);
gsap.ticker.lagSmoothing(0);
// 2D transforms only: nothing is promoted to its own compositor layer, so each frame is drawn
// from scratch and looks the same whether the renderer plays up to it or jumps straight to it
gsap.config({ force3D: false });
gsap.defaults({ ease: 'power3.out', duration: 0.6, overwrite: false });

// Easing curves used across the videos
CustomEase.create('swift', '0.22, 1, 0.36, 1'); // fast start, long soft landing
CustomEase.create('snappy', '0.16, 1, 0.3, 1');
CustomEase.create('inout', '0.65, 0, 0.35, 1');
CustomEase.create('pop', '0.34, 1.56, 0.64, 1'); // small overshoot
CustomEase.create('anticipate', '0.36, 0, 0.66, -0.56');

export { gsap, CustomEase, MotionPathPlugin, DrawSVGPlugin, MorphSVGPlugin };

export const W = 1920;
export const H = 1080;
export const params = new URLSearchParams(location.search);

/** The master timeline. Add everything at absolute times: tl.to(el, {...}, 3.2) */
export const tl = gsap.timeline({ paused: true, defaults: { ease: 'swift', duration: 0.7 } });

const frameFns = [];
/** Register a function that draws something for time t (canvas, SVG maths, counters) */
export function onFrame(fn) {
  frameFns.push(fn);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Create an element from an HTML string and append it to a parent */
export function el(html, parent) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  const node = t.content.firstElementChild;
  if (parent) parent.appendChild(node);
  return node;
}

/** Deterministic random numbers (mulberry32): the same seed gives the same video on every render worker */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (min, max) => min + (max - min) * next();
  next.int = (min, max) => Math.floor(next.range(min, max + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.sign = () => (next() < 0.5 ? -1 : 1);
  return next;
}

export const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** 0→1 progress of t between a and b, clamped */
export const prog = (t, a, b) => clamp((t - a) / (b - a));
export const ease = (name) => gsap.parseEase(name);

/** Split an element's text into words (.w) and optionally characters (.c) for staggered reveals */
export function split(target, { chars = false } = {}) {
  const node = typeof target === 'string' ? $(target) : target;
  const words = [];
  const letters = [];
  const walk = (parent) => {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(' '));
            continue;
          }
          const w = document.createElement('span');
          w.className = 'w';
          if (chars) {
            for (const ch of [...part]) {
              const c = document.createElement('span');
              c.className = 'c';
              c.textContent = ch;
              w.appendChild(c);
              letters.push(c);
            }
          } else {
            w.textContent = part;
          }
          words.push(w);
          frag.appendChild(w);
        }
        parent.replaceChild(frag, child);
      } else if (child.nodeType === Node.ELEMENT_NODE && !child.classList.contains('w')) {
        walk(child);
      }
    }
  };
  walk(node);
  return { el: node, words, chars: letters };
}

/** Show a scene between two times (scenes are hidden by default) */
export function sceneWindow(scene, from, to) {
  tl.set(scene, { visibility: 'visible' }, from);
  if (to != null) tl.set(scene, { visibility: 'hidden' }, to);
}

/** Count a number up or down; format gets the current value */
export function countTo(target, { from = 0, to, duration = 1, at, ease: e = 'power2.out', format = (v) => String(Math.round(v)) }) {
  const node = typeof target === 'string' ? $(target) : target;
  const state = { v: from };
  node.textContent = format(from);
  tl.to(state, { v: to, duration, ease: e, onUpdate: () => (node.textContent = format(state.v)) }, at);
  return state;
}

export const fmtEur = (v, digits = 2) =>
  '€' + v.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtInt = (v) => Math.round(v).toLocaleString('en-GB');

// ───────────────────────────────── Icons (Lucide, ISC licence) ─────────────────────────────────
let iconNodes = null;
export async function loadIcons() {
  if (!iconNodes) iconNodes = await (await fetch('/node_modules/lucide-static/icon-nodes.json')).json();
  return iconNodes;
}
/** Inline SVG for a Lucide icon name, e.g. icon('plane', { size: 48, stroke: 2 }) */
export function icon(name, { size = 24, stroke = 2, color = 'currentColor', fill = 'none', cls = '' } = {}) {
  const nodes = iconNodes?.[name];
  if (!nodes) throw new Error(`Unknown icon "${name}" (call await loadIcons() first)`);
  const inner = nodes
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
    .join('');
  return `<svg class="i ${cls}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

// ───────────────────────────────── The EasyReimburse bird ─────────────────────────────────
/** The logo's three paper shapes, traced from logo.png on a 500x500 grid */
export const BIRD = {
  wing: [[75, 71], [370, 261], [296, 308], [152, 243]],
  head: [[293, 97], [463, 173], [347, 163], [329, 209], [258, 164]],
  tail: [[297, 311], [247, 460], [207, 368]],
};
export const pts = (poly) => poly.map((p) => p.join(',')).join(' ');
export const polyPath = (poly) => 'M' + poly.map((p) => p.join(',')).join('L') + 'Z';

/** Only the white bird (transparent background). Parts have classes .wing .head .tail */
export function birdSVG({ size = 200, color = '#fff', cls = '' } = {}) {
  return `<svg class="bird ${cls}" width="${size}" height="${size}" viewBox="0 0 500 500" style="overflow:visible">
    <path class="wing" d="${polyPath(BIRD.wing)}" fill="${color}"/>
    <path class="head" d="${polyPath(BIRD.head)}" fill="${color}"/>
    <path class="tail" d="${polyPath(BIRD.tail)}" fill="${color}"/>
  </svg>`;
}

let logoCount = 0;
/** The app icon: gradient rounded square with the bird */
export function logoSVG({ size = 200, cls = '', shadow = false } = {}) {
  const id = `lg${++logoCount}`;
  return `<svg class="logo ${cls}" width="${size}" height="${size}" viewBox="0 0 500 500" style="overflow:visible${shadow ? ';filter:drop-shadow(0 18px 40px rgba(168,85,247,.45))' : ''}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a855f7"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs>
    <rect class="logo-bg" width="500" height="500" rx="182" fill="url(#${id})"/>
    <path class="wing" d="${polyPath(BIRD.wing)}" fill="#fff"/>
    <path class="head" d="${polyPath(BIRD.head)}" fill="#fff"/>
    <path class="tail" d="${polyPath(BIRD.tail)}" fill="#fff"/>
  </svg>`;
}

// ───────────────────────────────── Film grain ─────────────────────────────────
function addGrain(stage, opacity) {
  const c = document.createElement('canvas');
  c.id = 'grain';
  c.width = 580;
  c.height = 370;
  c.style.cssText = `width:${W + 400}px;height:${H + 400}px;opacity:${opacity};image-rendering:pixelated`;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(c.width, c.height);
  const r = rng(77);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(r() * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  stage.appendChild(c);
  // A new offset on every frame so the grain flickers like film instead of sitting still
  onFrame((t) => {
    const f = Math.round(t * 30);
    const jr = rng(f + 1);
    c.style.transform = `translate(${Math.round(jr.range(-180, 180))}px, ${Math.round(jr.range(-180, 180))}px)`;
  });
}

// ───────────────────────────────── Start ─────────────────────────────────
/**
 * Call once all scenes are on the timeline.
 * duration: length of the video in seconds; grain: opacity of the film grain (0 = none)
 */
export async function mount({ duration, fps = 30, grain = 0.05, marks = [] } = {}) {
  const stage = $('#stage');
  if (grain > 0) addGrain(stage, grain);

  let hud = null;
  if (params.get('hud')) {
    hud = document.createElement('div');
    hud.id = 'hud';
    stage.appendChild(hud);
  }

  const seek = (t) => {
    const time = clamp(t, 0, duration);
    tl.time(time, false);
    for (const fn of frameFns) fn(time);
    if (hud) hud.textContent = time.toFixed(2) + 's';
    return time;
  };

  // Wait for every font the page uses, then draw frame 0
  await document.fonts.ready;
  document.body.getBoundingClientRect();
  await document.fonts.ready;
  seek(0);

  window.__promo = { duration, fps, seek, marks, timelineDuration: tl.duration() };
  window.__ready = true;

  // Opened in a normal browser: play in real time (?play=1) or jump to a time (?t=12.5)
  if (params.get('t')) seek(parseFloat(params.get('t')));
  if (params.get('play')) {
    const start = performance.now() - (parseFloat(params.get('t')) || 0) * 1000;
    const loop = () => {
      const t = ((performance.now() - start) / 1000) % duration;
      seek(t);
      requestAnimationFrame(loop);
    };
    loop();
  }
}

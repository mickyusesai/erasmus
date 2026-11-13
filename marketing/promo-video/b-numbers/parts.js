/**
 * Helpers for version B "Numbers": the beat grid and the kinetic-type effects
 * (slam, echo outlines, colour split, shake, counters). Everything is a function of time.
 */
import { tl, onFrame, $, el, rng, clamp } from '/shared/kit.js';

// ───────────────────────────── Beat grid: 124 BPM ─────────────────────────────
export const BPM = 124;
export const BEAT = 60 / BPM; // 0.48387s
export const BAR = BEAT * 4; // 1.93548s
/** Time of a bar (1-based) plus an offset in beats (0-based, fractions allowed) */
export const at = (bar, beat = 0) => (bar - 1) * BAR + beat * BEAT;

// ───────────────────────────── Shake ─────────────────────────────
const shakes = [];
/** Camera shake after a hit: random offsets that die out */
export function shake(t, amp = 14, dur = 0.24) {
  shakes.push({ t, amp, dur });
}
export function shakeOffset(t) {
  let x = 0;
  let y = 0;
  for (const s of shakes) {
    const p = (t - s.t) / s.dur;
    if (p < 0 || p >= 1) continue;
    const k = s.amp * (1 - p) * (1 - p);
    const step = Math.floor((t - s.t) * 60 + 1e-6); // a new offset 60 times a second
    const r = rng(9000 + Math.round(s.t * 1000) + step * 13);
    x += (r() * 2 - 1) * k;
    y += (r() * 2 - 1) * k;
  }
  return [x, y];
}

// ───────────────────────────── Colour split on a hit ─────────────────────────────
const splits = [];
/** Pink/blue fringes around white text for a few frames after t */
export function colourSplit(node, t, amp = 16, dur = 0.3) {
  splits.push({ node, t, amp, dur });
}
onFrame((t) => {
  const seen = new Map();
  for (const s of splits) {
    const p = (t - s.t) / s.dur;
    const v = p < 0 || p >= 1 ? 0 : s.amp * (1 - p) * (1 - p);
    seen.set(s.node, Math.max(seen.get(s.node) || 0, v));
  }
  for (const [node, v] of seen) {
    node.style.textShadow = v > 0.4 ? `${-v.toFixed(1)}px 0 rgba(236,72,153,.85), ${v.toFixed(1)}px 0 rgba(99,102,241,.85)` : 'none';
  }
});

// ───────────────────────────── Slam ─────────────────────────────
/** A big element lands hard: from oversize to rest in a few frames, with shake and colour split */
export function slam(node, t, { from = 1.7, dur = 0.32, amp = 16, split = true, y = 0, origin = '50% 50%' } = {}) {
  tl.fromTo(node, { opacity: 0 }, { opacity: 1, duration: 0.05, ease: 'none' }, t);
  tl.fromTo(node, { scale: from, y, transformOrigin: origin }, { scale: 1, y: 0, duration: dur, ease: 'expo.out' }, t);
  if (amp) shake(t + 0.03, amp);
  if (split) colourSplit(node, t, 22, 0.34);
}

const echoes = [];
/** Outlined copies of a word that burst outwards from it at time t */
export function echo(node, t, { count = 3, grow = 0.26, dur = 0.55, stroke = 3, colour = 'rgba(196,181,253,.8)', origin = '50% 50%' } = {}) {
  const host = node.parentElement;
  for (let i = 0; i < count; i++) {
    const c = node.cloneNode(true);
    c.removeAttribute('id');
    c.classList.add('echo');
    c.style.webkitTextStroke = `${stroke}px ${colour}`;
    c.style.transformOrigin = origin;
    host.insertBefore(c, node);
    echoes.push({ node: c, t: t + i * 0.04, grow: grow * (i + 1), dur });
  }
}
onFrame((t) => {
  for (const e of echoes) {
    const p = (t - e.t) / e.dur;
    if (p < 0 || p >= 1) {
      if (e.node.style.opacity !== '0') e.node.style.opacity = '0';
      continue;
    }
    const k = 1 - (1 - p) * (1 - p) * (1 - p); // ease out
    e.node.style.opacity = (0.9 * (1 - p)).toFixed(3);
    e.node.style.transform = `scale(${(1 + e.grow * k).toFixed(4)})`;
  }
});

// ───────────────────────────── Counter ─────────────────────────────
/** A number that counts on the timeline; the text is refreshed on every frame so any seek is right */
export function counter(node, { from = 0, to, t, duration = 0.5, ease = 'power3.out', format = (v) => String(Math.round(v)) }) {
  const state = { v: from };
  tl.to(state, { v: to, duration, ease }, t);
  onFrame(() => {
    const s = format(state.v);
    if (node.textContent !== s) node.textContent = s;
  });
  return state;
}

// ───────────────────────────── Scene cuts ─────────────────────────────
/** Last frames of a scene: its content darts away in the direction of the cut */
export function exitTo(nodes, t, { x = 0, y = 0, dur = 0.1, scale = 1, stagger = 0 } = {}) {
  tl.to(nodes, { x, y, scale, opacity: 0, duration: dur, ease: 'power2.in', stagger }, t - dur - (Array.isArray(nodes) ? stagger * (nodes.length - 1) : 0));
}

/** Words of a headline rise out of a mask, one after another */
export function riseWords(words, t, { stagger = 0.06, dur = 0.42, y = 135 } = {}) {
  tl.fromTo(words, { yPercent: y }, { yPercent: 0, duration: dur, ease: 'expo.out', stagger }, t);
}

/** Pulse strength right after each beat: 1 on the beat, fading within it */
export const beatPulse = (t, sharp = 5) => Math.exp(-sharp * ((t / BEAT) % 1));

export { tl, onFrame, $, el, rng, clamp };

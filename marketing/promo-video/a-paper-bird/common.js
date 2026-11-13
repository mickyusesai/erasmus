/** Timing grid and small helpers shared by the scene files of version A */
import { tl, gsap, split, $$, el, rng, onFrame, birdSVG } from '/shared/kit.js';

export const BEAT = 60 / 108; // 0.5556s
export const BAR = BEAT * 4; // 2.2222s

/** Scene start times */
export const T = {
  chaos: 0,
  bubbles: 2 * BAR, // 4.44
  freeze: 3 * BAR, // 6.67
  brand: 4 * BAR, // 8.89
  invite: 5 * BAR, // 11.11
  upload: 6.5 * BAR, // 14.44
  ai: 8 * BAR, // 17.78
  review: 10 * BAR, // 22.22
  proof: 12 * BAR, // 26.67
  end: 13 * BAR, // 28.89
  total: 16 * BAR, // 35.56
};

export const show = (target, at) => tl.set(target, { visibility: 'visible' }, at);
export const hide = (target, at) => tl.set(target, { visibility: 'hidden' }, at);

/** Diagonal wipe: progress 0→1 covers the stage from the left; out = uncover from the left */
export function setWipe(node, p, out = false) {
  const S = 320;
  const x = -S + p * (1920 + S);
  node.style.clipPath = out
    ? `polygon(${x + S}px 0, 1920px 0, 1920px 1080px, ${x}px 1080px)`
    : `polygon(0 0, ${x + S}px 0, ${x}px 1080px, 0 1080px)`;
}

/** A few small white birds drifting across a container from time `from` on (background life) */
export function addFlock(container, from, { seed = 31, count = 9 } = {}) {
  const r = rng(seed);
  // One bird per cell of a loose grid, so they never start in a clump
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const flock = Array.from({ length: count }, (_, i) => {
    const size = r.range(34, 96);
    const node = el(`<div class="flock-bird" style="opacity:${(0.1 + (size / 96) * 0.16).toFixed(2)}">${birdSVG({ size })}</div>`, container);
    const x = -150 + ((i % cols) + r.range(0.15, 0.85)) * (2100 / cols);
    const y = 60 + (Math.floor(i / cols) + r.range(0.15, 0.85)) * (980 / rows);
    return { node, x, y, v: 28 + size * 0.9, rise: r.range(8, 26), phase: r() * 6.28 };
  });
  onFrame((t) => {
    const dt = t - from;
    if (dt < 0) return;
    for (const b of flock) {
      const x = ((b.x + b.v * dt + 300) % 2300) - 300;
      const y = b.y - b.rise * dt + Math.sin(dt * 1.3 + b.phase) * 10;
      b.node.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${(-8 + Math.sin(dt * 1.3 + b.phase) * 3).toFixed(2)}deg)`;
    }
  });
}

/** Lines of a headline rise out of their masks, word by word. Markup: .line > .in */
export function riseLines(root, at, { stagger = 0.05, duration = 0.7 } = {}) {
  const words = $$('.line .in', root).flatMap((line) => split(line).words);
  gsap.set(words, { yPercent: 118 });
  tl.to(words, { yPercent: 0, duration, ease: 'swift', stagger }, at);
  return words;
}

/** Fade and slide in (elements start hidden) */
export function fadeUp(targets, at, { y = 34, duration = 0.6, stagger = 0.06, ease = 'swift' } = {}) {
  gsap.set(targets, { opacity: 0, y });
  tl.to(targets, { opacity: 1, y: 0, duration, stagger, ease }, at);
}

/** Pop in with a small overshoot */
export function popIn(targets, at, { duration = 0.45, stagger = 0.06, from = 0 } = {}) {
  gsap.set(targets, { scale: from, opacity: 0 });
  tl.to(targets, { scale: 1, opacity: 1, duration, stagger, ease: 'pop' }, at);
}

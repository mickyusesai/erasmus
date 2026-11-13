/**
 * Version A · "Paper Bird"
 * A pile of travel paperwork → one ticket folds into the EasyReimburse bird → the product in
 * four steps → proof → end card. 108 BPM: one beat = 0.5556s, one bar = 2.2222s, 16 bars.
 */
import { tl, mount, split, $, $$, el, rng, icon, loadIcons, onFrame, logoSVG, birdSVG, BIRD, polyPath, countTo, fmtEur, lerp, clamp, prog, ease, gsap } from '/shared/kit.js';
import { pileSpecs } from './papers.js';
import { BEAT, T, show, hide, setWipe, addFlock } from './common.js';
import { buildSteps } from './steps.js';
import { buildOutro } from './outro.js';

await loadIcons();
// Positions are measured while the scenes are built, so the fonts must be there first
const sample = 'Aáčřīłź€ 0123';
await Promise.all([
  document.fonts.load('800 100px "Bricolage Grotesque Variable"', sample),
  document.fonts.load('600 30px "Inter Variable"', sample),
  document.fonts.load('600 20px "JetBrains Mono Variable"', sample),
  document.fonts.load('700 40px "Caveat Variable"', sample),
]);

// ───────────────────────────── Scene 1: the pile of paperwork ─────────────────────────────
const hero = {}; // the ticket that becomes the bird: { slot, x, y, rot }

function buildChaos() {
  const scene = $('#s-chaos');
  scene.innerHTML = `
    <h1 id="chaos-title" class="display">
      <span class="line"><span class="in">Every Erasmus+ project</span></span>
      <span class="line"><span class="in">ends the same way.</span></span>
    </h1>
    <div id="pile"></div>
    <div id="bubbles"></div>`;
  show(scene, 0);

  // Headline: words rise out of a mask
  const words = $$('#chaos-title .in').flatMap((line) => split(line).words);
  gsap.set(words, { yPercent: 118 });
  tl.to(words, { yPercent: 0, duration: 0.75, ease: 'swift', stagger: 0.06 }, 0.12);

  // Lay the papers out on a loose grid that bleeds off the edges
  const specs = pileSpecs();
  const r = rng(2026);
  const cols = 8;
  const rows = 5;
  const cells = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) cells.push({ cx: -70 + (x + 0.5) * 257.5, cy: -50 + (y + 0.5) * 236 });
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const bigSpots = [[270, 250], [1650, 240], [300, 860], [1640, 850], [930, 70], [1000, 1010]];
  const papers = specs.map((spec, i) => {
    if (spec.hero) return { ...spec, x: 960, y: 552, rot: -6, big: false, dist: -1 };
    const cell = i < 6 ? { cx: bigSpots[i][0], cy: bigSpots[i][1] } : cells[i % cells.length];
    const x = cell.cx + r.range(-70, 70);
    const y = cell.cy + r.range(-60, 60);
    return { ...spec, x, y, rot: r.range(-15, 15), big: i < 6, dist: Math.hypot(x - 960, (y - 540) * 1.5) + r.range(-160, 160) };
  });
  // Big sheets first (underneath), then from the edges inwards, so the headline is buried last
  papers.sort((a, b) => (a.hero ? 1 : b.hero ? -1 : Number(b.big) - Number(a.big) || b.dist - a.dist));

  const pile = $('#pile');
  const first = 1.15;
  const last = 4.2;
  papers.forEach((p, i) => {
    const slot = el(`<div class="slot ${p.html.includes('paper rc') ? 'rc-wrap' : ''}">${p.html}</div>`, pile);
    const at = p.hero ? 4.32 : first + (last - first) * Math.pow(i / (papers.length - 2), 0.62);
    gsap.set(slot, { xPercent: -50, yPercent: -50, x: p.x + r.range(-60, 60), y: p.y - 150, rotation: p.rot + r.range(-26, 26), scale: 1.75, opacity: 0 });
    tl.to(slot, { opacity: 1, duration: 0.1, ease: 'none' }, at);
    tl.to(slot, { x: p.x, y: p.y, rotation: p.rot, scale: 1, duration: 0.34, ease: 'power2.in' }, at);
    tl.to(slot, { scale: 0.98, duration: 0.06, ease: 'power1.out' }, at + 0.34);
    tl.to(slot, { scale: 1, duration: 0.22, ease: 'power2.out' }, at + 0.4);
    if (p.hero) Object.assign(hero, { slot, x: p.x, y: p.y, rot: p.rot, html: p.html });
  });

  // Messages pop up over the pile, one per beat
  const bubbles = [
    { text: 'Did you get my tickets?? 🙏', cls: '', left: 120, top: 138, rot: -3 },
    { text: 'Which exchange rate do I use?', cls: 'ink right', left: 1020, top: 250, rot: 2.5 },
    { text: 'I lost my boarding pass 😬', cls: 'brand', left: 190, top: 770, rot: 2 },
    { text: 'When do I get paid?', cls: 'right', left: 1210, top: 812, rot: -2.5 },
  ];
  bubbles.forEach((b, i) => {
    const node = el(`<div class="bubble ${b.cls}" style="left:${b.left}px;top:${b.top}px">${b.text}</div>`, $('#bubbles'));
    const at = T.bubbles + i * BEAT;
    gsap.set(node, { scale: 0, rotation: b.rot - 8, transformOrigin: b.cls.includes('right') ? '85% 110%' : '15% 110%' });
    tl.to(node, { scale: 1, rotation: b.rot, duration: 0.42, ease: 'pop' }, at);
    // The whole pile jolts a little with every new message
    tl.fromTo(pile, { scale: 1.014 }, { scale: 1, duration: 0.35, ease: 'power2.out', immediateRender: false }, at);
  });
}

// ───────────────────────────── Scene 2–3: the fold and the brand ─────────────────────────────
const mix = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

function buildBrand() {
  const scene = $('#s-brand');
  scene.innerHTML = `
    <div id="wash" class="fill"></div>
    <div id="brand-flock" class="fill"></div>
    <div id="better">There’s a better way.</div>
    <div id="hero-clone" class="slot">${hero.html}</div>
    <div id="wordmark" class="display">EasyReimburse</div>
    <div id="hook">Reimbursements that fly.</div>`;
  const wash = $('#wash');
  const clone = $('#hero-clone');
  el('<div class="blank"></div>', clone.firstElementChild);
  const F = T.freeze;
  show(scene, F);

  // The brand colour sweeps over the chaos
  const wipe = { in: 0, out: 0 };
  tl.to(wipe, { in: 1, duration: 0.6, ease: 'inout' }, F);
  tl.to(wipe, { out: 1, duration: 0.55, ease: 'inout' }, T.invite - 0.4);
  onFrame(() => (wipe.out > 0 ? setWipe(wash, wipe.out, true) : setWipe(wash, wipe.in)));
  hide('#s-chaos', F + 0.62);

  // Once the first bird exists, a few more drift by in the background
  addFlock($('#brand-flock'), T.brand - 0.2, { seed: 57, count: 8 });
  gsap.set('#brand-flock', { opacity: 0 });
  tl.to('#brand-flock', { opacity: 1, duration: 0.8, ease: 'none' }, T.brand - 0.1);
  tl.to('#brand-flock', { opacity: 0, duration: 0.3, ease: 'none' }, T.invite - 0.45);

  // "There's a better way."
  const better = split('#better').words;
  gsap.set(better, { opacity: 0, y: 26 });
  tl.to(better, { opacity: 1, y: 0, duration: 0.45, stagger: 0.07 }, F + 0.25);
  tl.to('#better', { opacity: 0, y: -20, duration: 0.3, ease: 'power2.in' }, F + 1.5);

  // One ticket lifts out of the pile…
  hide(hero.slot, F);
  gsap.set(clone, { xPercent: -50, yPercent: -50, x: hero.x, y: hero.y, rotation: hero.rot });
  const TW = 560 * 1.3;
  const TH = 236 * 1.3;
  tl.to(clone, { x: 960, y: 540, rotation: 0, scale: 1.3, duration: 0.6, ease: 'inout' }, F + 0.03);
  tl.to(clone.firstElementChild, { boxShadow: '0 4px 8px rgba(49,20,89,.10), 0 50px 90px -20px rgba(49,20,89,.55)', duration: 0.6 }, F + 0.03);
  // The print fades and the corners sharpen, so the ticket hands over to the folding shapes unnoticed
  tl.to('#hero-clone .blank', { opacity: 1, duration: 0.22, ease: 'none' }, F + 0.5);
  tl.to([clone.firstElementChild, '#hero-clone .blank'], { borderRadius: 3, duration: 0.24, ease: 'power1.in' }, F + 0.5);
  const foldStart = F + 0.76;
  hide(clone, foldStart);

  // …and folds into the bird. Three pieces of the ticket travel to the bird's three shapes.
  const svg = $('#fold');
  svg.innerHTML = `
    <defs><filter id="lift" x="-60%" y="-60%" width="220%" height="240%"><feDropShadow id="lift-shadow" dx="0" dy="46" stdDeviation="36" flood-color="#311459" flood-opacity="0.5"/></filter></defs>
    <circle id="ring" cx="960" cy="528" r="150" fill="none" stroke="#fff" stroke-width="5" opacity="0"/>
    <g id="fold-g" filter="url(#lift)"><path class="p-wing"/><path class="p-head"/><path class="p-tail"/></g>`;
  gsap.set(svg, { visibility: 'hidden' });
  show(svg, foldStart);
  hide(svg, T.invite + 0.2);

  // The shapes have a 7px outline, so they start that much inside the ticket's edge
  const INSET = 3.5;
  const x0 = 960 - TW / 2 + INSET;
  const y0 = 540 - TH / 2 + INSET;
  const at = (fx, fy) => [x0 + fx * (TW - INSET * 2), y0 + fy * (TH - INSET * 2)];
  // The shadow starts as deep as the lifted ticket's and lightens as the bird takes shape
  tl.to('#lift-shadow', { attr: { dy: 26, stdDeviation: 26, 'flood-opacity': 0.32 }, duration: 0.9, ease: 'power1.inOut' }, foldStart + 0.05);
  // The ticket cut into a quad, a pentagon and a triangle (same point counts as the bird's shapes)
  const src = {
    wing: [at(0, 0), at(0.6, 0), at(0.42, 1), at(0, 1)],
    head: [at(0.6, 0), at(1, 0), at(1, 0.5), at(0.72, 1), at(0.42, 1)],
    tail: [at(1, 0.5), at(1, 1), at(0.72, 1)],
  };
  const BS = 0.98; // bird size on screen
  const birdAt = ([bx, by]) => [960 + (bx - 269) * BS, 528 + (by - 265.5) * BS];
  const dst = { wing: BIRD.wing.map(birdAt), head: BIRD.head.map(birdAt), tail: BIRD.tail.map(birdAt) };
  const joint = birdAt([333, 284]); // where the wing meets the body
  const parts = [
    { key: 'wing', node: $('.p-wing', svg), from: 0.0, to: 0.68, axis: -0.5, flips: 2 },
    { key: 'head', node: $('.p-head', svg), from: 0.12, to: 0.8, axis: 0.9, flips: 2 },
    { key: 'tail', node: $('.p-tail', svg), from: 0.24, to: 0.92, axis: 0.2, flips: 2 },
  ];
  const WHITE = [255, 255, 255];
  const FRONT = [246, 238, 255];
  const BACK = [216, 180, 254];
  const inOut = ease('power2.inOut');
  const flap = { a: 0 }; // wing angle in degrees
  onFrame((t) => {
    if (t < foldStart - 0.05 || t > T.invite + 0.25) return;
    for (const part of parts) {
      const u = inOut(prog(t, foldStart + part.from, foldStart + part.to));
      let pts = src[part.key].map((p, i) => [lerp(p[0], dst[part.key][i][0], u), lerp(p[1], dst[part.key][i][1], u)]);
      // Flip the piece over a fold line through its middle: the darker back shows on the way
      const f = Math.cos(u * Math.PI * part.flips);
      const cx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
      const cy = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
      const ca = Math.cos(part.axis);
      const sa = Math.sin(part.axis);
      pts = pts.map(([px, py]) => {
        const dx = px - cx;
        const dy = py - cy;
        const along = dx * ca + dy * sa;
        const across = (-dx * sa + dy * ca) * f;
        return [cx + along * ca - across * sa, cy + along * sa + across * ca];
      });
      if (part.key === 'wing' && flap.a !== 0) {
        const a = (flap.a * Math.PI) / 180;
        pts = pts.map(([px, py]) => {
          const dx = px - joint[0];
          const dy = py - joint[1];
          return [joint[0] + dx * Math.cos(a) - dy * Math.sin(a), joint[1] + dx * Math.sin(a) + dy * Math.cos(a)];
        });
      }
      const colour = u >= 1 ? WHITE : f >= 0 ? mix(FRONT, WHITE, f * f) : mix(FRONT, BACK, -f);
      part.node.setAttribute('d', polyPath(pts.map((p) => [p[0].toFixed(2), p[1].toFixed(2)])));
      part.node.setAttribute('fill', rgb(colour));
      part.node.setAttribute('stroke', rgb(colour));
    }
  });

  const landed = foldStart + 0.95;
  // A soft ring and a little bounce when the bird is done
  tl.fromTo('#ring', { attr: { r: 150 }, opacity: 0.7 }, { attr: { r: 620 }, opacity: 0, duration: 0.9, ease: 'power2.out', immediateRender: false }, landed - 0.05);
  tl.fromTo('#fold-g', { scale: 1.1, svgOrigin: '960 528' }, { scale: 1, duration: 0.45, ease: 'pop', immediateRender: false }, landed - 0.08);
  // Two wing beats while it rises to its place above the name
  tl.to(flap, { a: 16, duration: 0.14, ease: 'power2.out' }, landed + 0.12);
  tl.to(flap, { a: -12, duration: 0.2, ease: 'sine.inOut' }, landed + 0.26);
  tl.to(flap, { a: 13, duration: 0.16, ease: 'sine.inOut' }, landed + 0.46);
  tl.to(flap, { a: -8, duration: 0.2, ease: 'sine.inOut' }, landed + 0.62);
  tl.to(flap, { a: 0, duration: 0.3, ease: 'sine.out' }, landed + 0.82);
  tl.to('#fold-g', { y: -212, scale: 0.72, svgOrigin: '960 528', duration: 0.95, ease: 'inout' }, landed + 0.18);

  // The name, letter by letter, then the hook
  const letters = split('#wordmark', { chars: true }).chars;
  gsap.set(letters, { yPercent: 70, opacity: 0, rotation: 6 });
  tl.to(letters, { yPercent: 0, opacity: 1, rotation: 0, duration: 0.6, ease: 'pop', stagger: 0.028 }, T.brand - 0.1);
  const hookWords = split('#hook').words;
  gsap.set(hookWords, { opacity: 0, y: 30 });
  tl.to(hookWords, { opacity: 1, y: 0, duration: 0.5, stagger: 0.09 }, T.brand + 0.75);

  // Out: everything lifts away as the wash leaves
  const out = T.invite - 0.42;
  tl.to(['#wordmark', '#hook'], { opacity: 0, y: -40, duration: 0.3, ease: 'power2.in', stagger: 0.04 }, out);
  tl.to('#fold-g', { opacity: 0, y: -300, duration: 0.32, ease: 'power2.in' }, out);
  hide(scene, T.invite + 0.2);
}

buildChaos();
buildBrand();
buildSteps();
buildOutro();

await mount({ duration: T.total, grain: 0.03 });

/** Scenes 8–9: the proof ("90% less time spent") and the end card */
import { tl, gsap, $, $$, icon, onFrame, countTo, split, birdSVG } from '/shared/kit.js';
import { T, show, hide, setWipe, fadeUp, popIn, addFlock } from './common.js';

function buildProof() {
  const scene = $('#s-proof');
  const chips = [
    ['euro', 'Official EU exchange rates'],
    ['leaf', 'Green travel built in'],
    ['file-check', 'Audit-ready PDF'],
    ['shield-check', 'Data stored in the EU'],
  ];
  scene.innerHTML = `
    <div id="proof-num" class="display"><span class="grad-text"><span id="proof-n">0</span>%</span></div>
    <div id="proof-line" class="display"><span class="line"><span class="in">less time spent</span></span></div>
    <div id="proof-chips">${chips.map(([i, label]) => `<div class="proof-chip">${icon(i, { size: 34, stroke: 2.2 })}${label}</div>`).join('')}</div>`;
  const t0 = T.proof;
  show(scene, t0 - 0.12);
  hide(scene, T.end + 0.35);

  gsap.set('#proof-num', { scale: 0.6, opacity: 0 });
  tl.to('#proof-num', { scale: 1, opacity: 1, duration: 0.6, ease: 'pop' }, t0 - 0.08);
  countTo('#proof-n', { from: 0, to: 90, duration: 0.75, at: t0 - 0.05, ease: 'power3.out' });
  const words = split($('#proof-line .in')).words;
  gsap.set(words, { yPercent: 118 });
  tl.to(words, { yPercent: 0, duration: 0.6, ease: 'swift', stagger: 0.07 }, t0 + 0.18);
  popIn($$('.proof-chip', scene), t0 + 0.55, { from: 0.7, stagger: 0.09, duration: 0.45 });
}

function buildEnd() {
  const scene = $('#s-end');
  scene.innerHTML = `
    <div id="end-wash" class="fill"></div>
    <div id="end-flock" class="fill"></div>
    <div id="end-bird">${birdSVG({ size: 250 })}</div>
    <div id="end-name" class="display">EasyReimburse</div>
    <div id="end-tag">Travel reimbursements, from weeks to minutes.</div>
    <div id="end-cta"><div class="cta-pill">Try for free${icon('arrow-right', { size: 34, stroke: 2.6 })}</div><div class="cta-url">easyreimburse.ai</div></div>`;
  const t0 = T.end;
  show(scene, t0 - 0.4);

  // The brand colour comes back
  const wipe = { p: 0 };
  const wash = $('#end-wash');
  tl.to(wipe, { p: 1, duration: 0.65, ease: 'inout' }, t0 - 0.38);
  onFrame(() => setWipe(wash, wipe.p));

  // A few small birds drift across the background for the rest of the film
  addFlock($('#end-flock'), t0 - 0.4);

  // The bird flies in from the left and lands above the name
  const bird = $('#end-bird');
  const wing = $('.wing', bird);
  const land = { x: 960, y: 268 };
  gsap.set(bird, { xPercent: -50, yPercent: -50, x: -260, y: 720, scale: 0.55, rotation: -24 });
  tl.to(bird, { motionPath: { path: [{ x: -260, y: 720 }, { x: 420, y: 150 }, { x: 800, y: 200 }, { x: land.x, y: land.y }], curviness: 1.25 }, scale: 1, rotation: 0, duration: 1.25, ease: 'power2.out' }, t0 - 0.1);
  gsap.set(wing, { svgOrigin: '333 284' });
  tl.to(wing, { rotation: 15, duration: 0.14, repeat: 5, yoyo: true, ease: 'sine.inOut' }, t0 - 0.05);
  tl.to(wing, { rotation: -9, duration: 0.2, ease: 'sine.inOut' }, t0 + 0.8);
  tl.to(wing, { rotation: 0, duration: 0.35, ease: 'sine.out' }, t0 + 1.0);

  const letters = split('#end-name', { chars: true }).chars;
  gsap.set(letters, { yPercent: 70, opacity: 0, rotation: 6 });
  tl.to(letters, { yPercent: 0, opacity: 1, rotation: 0, duration: 0.6, ease: 'pop', stagger: 0.028 }, t0 + 0.62);
  const tag = split('#end-tag').words;
  gsap.set(tag, { opacity: 0, y: 30 });
  tl.to(tag, { opacity: 1, y: 0, duration: 0.5, stagger: 0.06 }, t0 + 1.35);
  popIn('.cta-pill', t0 + 2.15, { from: 0.6, duration: 0.5 });
  fadeUp('.cta-url', t0 + 2.4, { y: 0, duration: 0.5 });
  // A gentle pulse on the button while the card holds
  tl.fromTo('.cta-pill', { scale: 1 }, { scale: 1.06, duration: 0.3, yoyo: true, repeat: 1, ease: 'sine.inOut', immediateRender: false }, t0 + 4.2);
}

export function buildOutro() {
  buildProof();
  buildEnd();
}

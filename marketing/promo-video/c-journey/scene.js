/**
 * Version C, "The Journey": one participant's trip across Europe, from tickets to paid.
 * 13 bars at 84 BPM (37.14s). Scene changes sit on bar lines.
 */
import { tl, mount, onFrame, $, $$, el, clamp, lerp, icon, loadIcons, logoSVG, birdSVG, fmtEur, gsap, CustomEase, W, H } from '/shared/kit.js';
import { createMap, ROUTE } from './map.js';

const BEAT = 60 / 84;
const BAR = BEAT * 4;
/** Start of a bar (1-based), plus a number of beats */
const bar = (n, beats = 0) => (n - 1) * BAR + beats * BEAT;
const DURATION = 37.2;

await loadIcons();
await Promise.all([
  document.fonts.load('600 28px "Inter Variable"', 'LISBON'),
  document.fonts.load('700 132px "Inter Variable"', 'EasyReimburse'),
  document.fonts.load('400 100px "Instrument Serif"', 'Sofia'),
  document.fonts.load('italic 400 100px "Instrument Serif"', 'Sofia'),
]);

const map = await createMap($('#map'));
const { M, city } = map;
const ui = $('#ui');

// ───────────────────────────── helpers ─────────────────────────────
/** Fade and slide something in (elements start hidden) */
const show = (target, at, { y = 34, x = 0, scale = 1, duration = 0.8, ease = 'swift', stagger = 0 } = {}) =>
  tl.fromTo(target, { autoAlpha: 0, y, x, scale }, { autoAlpha: 1, y: 0, x: 0, scale: 1, duration, ease, stagger, immediateRender: false }, at);
const hide = (target, at, { y = -20, x = 0, duration = 0.45, ease = 'power2.in', stagger = 0 } = {}) =>
  tl.to(target, { autoAlpha: 0, y, x, duration, ease, stagger }, at);
/** Lines that rise out of their masks (see .ln in the stylesheet) */
const rise = (root, at, { stagger = 0.14, duration = 1.0 } = {}) => {
  tl.set(root, { autoAlpha: 1 }, at);
  tl.fromTo($$('.ln > span', root), { yPercent: 122 }, { yPercent: 0, duration, ease: 'swift', stagger, immediateRender: false }, at);
};
/** …and leave upwards */
const sink = (root, at, { stagger = 0.06, duration = 0.55 } = {}) => {
  const lines = $$('.ln > span', root);
  tl.to(lines, { yPercent: -122, duration, ease: 'power3.in', stagger }, at);
  tl.set(root, { autoAlpha: 0 }, at + duration + stagger * (lines.length - 1) + 0.02);
};
const hidden = (...nodes) => gsap.set(nodes.flat(), { autoAlpha: 0 });
const check = (size = 24, stroke = 3.4) => icon('check', { size, stroke, color: '#fff' });

/** Camera position that puts a world point at a chosen place on screen */
const camAt = (p, zoom, sx = 700, sy = 520) => ({ x: p.x + (W / 2 - sx) / zoom, y: p.y + (H / 2 - sy) / zoom, zoom });

// The camera: tweened by the timeline, except while it follows Sofia along her route
const camA = { x: W / 2, y: H / 2, zoom: 1 };
const follow = { u: 0, zoom: 2 };
const routePts = ROUTE.map((k) => city[k]);
function routeSpline(u) {
  const i = Math.min(routePts.length - 2, Math.floor(u));
  const f = u - i;
  const p0 = routePts[Math.max(0, i - 1)];
  const p1 = routePts[i];
  const p2 = routePts[i + 1];
  const p3 = routePts[Math.min(routePts.length - 1, i + 2)];
  const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
  return { x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y) };
}
// The camera keeps pace with her: steady in the middle, a soft start and stop
CustomEase.create('track', 'M0,0 C0.05,0 0.08,0.035 0.12,0.085 0.4,0.385 0.6,0.615 0.88,0.915 0.92,0.965 0.95,1 1,1');
const FOLLOW_FROM = bar(3);
const FOLLOW_TO = bar(5, 2);

// ───────────────────────────── 1. Title (bars 1–2) ─────────────────────────────
const title = el(
  `<div id="title" class="serif">
    <span class="ln"><span>Every Erasmus+</span></span>
    <span class="ln"><span>project starts</span></span>
    <span class="ln"><span>with a <i class="grad">journey.</i></span></span>
  </div>`,
  ui
);
hidden(title);

tl.to(M, { reveal: 1, duration: 2.7, ease: 'power2.out' }, 0.1);
tl.to(M, { rigaGlow: 1, duration: 1.4, ease: 'power2.out' }, 0.5);
tl.to(M.marks.riga, { on: 1, label: 1, duration: 0.7 }, 0.9);
tl.fromTo(M.marks.riga, { ripple: 0 }, { ripple: 1, duration: 1.1, ease: 'power2.out', immediateRender: false }, 0.9);
tl.to(M, { convAlpha: 1, originDots: 1, duration: 0.9 }, 0.7);
M.conv.forEach((c, i) => tl.to(c, { p: 1, duration: 1.7, ease: 'power2.inOut' }, 0.85 + i * 0.075));
rise(title, 1.05, { stagger: 0.16, duration: 1.1 });
tl.to(camA, { zoom: 1.045, x: W / 2 + 14, duration: 4.3, ease: 'none' }, 0);

// Down to Lisbon, where Sofia sets off
sink(title, 4.3, { stagger: 0.07, duration: 0.6 });
const lisbonCam = camAt(city.lisbon, 2);
tl.to(camA, { x: lisbonCam.x, y: lisbonCam.y, duration: bar(3) - 4.3, ease: 'power2.inOut' }, 4.3);
tl.to(camA, { zoom: 2, duration: bar(3) - 4.3, ease: 'power3.inOut' }, 4.3);
tl.to(M, { convAlpha: 0.2, originDots: 0.35, rigaGlow: 0.45, duration: 1.2, ease: 'power2.inOut' }, 4.3);
tl.to(M.marks.riga, { label: 0, duration: 0.5 }, 4.3);
tl.to(M.marks.lisbon, { on: 1, label: 1, duration: 0.5 }, 5.05);
tl.fromTo(M.marks.lisbon, { ripple: 0 }, { ripple: 1, duration: 1.0, ease: 'power2.out', immediateRender: false }, 5.05);

// ───────────────────────────── 2. Sofia's route (bars 3–5) ─────────────────────────────
const TICKETS = [
  { from: 'Lisbon', to: 'Madrid', mode: 'Train', date: '4 Sep', price: '€52.40', eur: 52.4, ico: 'train-front' },
  { from: 'Madrid', to: 'Paris', mode: 'Train', date: '4 Sep', price: '€89.00', eur: 89, ico: 'train-front' },
  { from: 'Paris', to: 'Berlin', mode: 'Train', date: '5 Sep', price: '€74.90', eur: 74.9, ico: 'train-front' },
  { from: 'Berlin', to: 'Warsaw', mode: 'Train', date: '5 Sep', price: '189 zł', eur: 44.21, ico: 'train-front' },
  { from: 'Warsaw', to: 'Riga', mode: 'Bus', date: '6 Sep', price: '€29.00', eur: 29, ico: 'bus' },
];
const ticketHTML = (tk) => `
  <div class="tk-in">
    <div class="tk-ico">${icon(tk.ico, { size: 40, stroke: 2.1 })}</div>
    <div class="tk-main">
      <div class="tk-route">${tk.from}<span class="arr"> → </span>${tk.to}</div>
      <div class="tk-sub">${tk.mode} · ${tk.date}</div>
    </div>
    <div class="tk-price">${tk.price}</div>
  </div>`;

const scrim = $('#scrim');
const tag = el(
  `<div id="tag"><span class="ico">${icon('train-front', { size: 24, stroke: 2.2, cls: 'ico-train' })}${icon('bus', { size: 24, stroke: 2.2, cls: 'ico-bus' })}</span>Sofia</div>`,
  ui
);
const capA = el(`<div class="caption serif"><span class="ln"><span>Sofia is going from <i class="grad">Lisbon to Riga.</i></span></span></div>`, ui);
const capB = el(`<div class="caption serif"><span class="ln"><span>Four trains, one bus, <i class="grad">five tickets.</i></span></span></div>`, ui);
const stats = el(
  `<div id="stats"><span><b id="stT">0</b> <span id="stTl">tickets</span></span><span class="sep">·</span><span><b id="stC">0</b> <span id="stCl">currencies</span></span><span class="sep">·</span><span><b id="stK">0</b> km</span></div>`,
  ui
);
const cards = TICKETS.map((tk) => ({ node: el(`<div class="tk">${ticketHTML(tk)}</div>`, ui), a: 0, s: 0.5, fly: 0, pile: 0, gone: 0 }));
const tagState = { a: 0 };
hidden(capA, capB, stats);

const SLOT = (i) => ({ x: 1250, y: 138 + i * 147 });
const LEG_T = (i) => bar(3) + i * 2 * BEAT;

tl.to(scrim, { opacity: 1, duration: 1 }, 5.2);
tl.set(M, { labelFloor: 800 }, 5.2);
tl.to(M.head, { a: 1, duration: 0.5 }, 5.45);
tl.to(tagState, { a: 1, duration: 0.5 }, 5.75);
tl.to(follow, { u: 5, duration: FOLLOW_TO - FOLLOW_FROM, ease: 'track' }, FOLLOW_FROM);
tl.to(follow, { zoom: 1.78, duration: FOLLOW_TO - FOLLOW_FROM, ease: 'sine.inOut' }, FOLLOW_FROM);

M.legs.forEach((leg, i) => {
  const T = LEG_T(i);
  const next = ROUTE[i + 1];
  tl.to(leg, { p: 1, duration: 1.24, ease: 'power2.inOut' }, T);
  tl.to(M.marks[next], { on: 1, label: 1, duration: 0.4 }, T + 1.0);
  tl.fromTo(M.marks[next], { ripple: 0 }, { ripple: 1, duration: 1.0, ease: 'power2.out', immediateRender: false }, T + 1.12);
  // the ticket for this leg pops up beside her, then joins the others on the right
  const c = cards[i];
  tl.to(c, { a: 1, duration: 0.25, ease: 'power2.out' }, T + 0.5);
  tl.to(c, { s: 1, duration: 0.5, ease: 'pop' }, T + 0.5);
  tl.to(c, { fly: 1, duration: 0.78, ease: 'power3.inOut' }, T + 1.02);
});
rise(capA, 5.85);
sink(capA, 9.4);
rise(capB, 10.0);
show(stats, 6.9, { y: 18 });

// She has arrived: pull back to see the whole way she came
tl.to(M, { rigaGlow: 1, duration: 0.6 }, FOLLOW_TO - 0.2);
tl.to(M.head, { a: 0, duration: 0.6 }, FOLLOW_TO + 0.1);
tl.to(tagState, { a: 0, duration: 0.4 }, FOLLOW_TO - 0.05);
tl.set(camA, camAt(city.riga, 1.78), FOLLOW_TO);
const PULL_END = bar(6) + 0.5;
tl.to(camA, { ...camAt({ x: 1209, y: 573 }, 1.02, 650, 450), duration: PULL_END - FOLLOW_TO, ease: 'inout' }, FOLLOW_TO);
// a slow drift keeps the map alive behind the next scenes
tl.to(camA, { x: '+=70', y: '-=26', zoom: '+=0.08', duration: bar(11) - PULL_END, ease: 'none' }, PULL_END);

// ───────────────────────────── 3. …and ends with paperwork (bar 6) ─────────────────────────────
const PILE = [
  { x: 500, y: 418, r: -9 },
  { x: 850, y: 366, r: 6 },
  { x: 590, y: 572, r: 4 },
  { x: 930, y: 540, r: -6 },
  { x: 690, y: 712, r: -2.5 },
];
const h3 = el(`<div id="h3" class="serif"><span class="ln"><span>…and ends with <i class="grad">paperwork.</i></span></span></div>`, ui);
const mail = el(
  `<div class="paper mail"><div class="mail-top">${icon('mail', { size: 26 })} Inbox <b>23</b></div><div class="mail-sub">RE: RE: FWD: tickets??</div><div class="bar" style="width:92%"></div><div class="bar" style="width:64%"></div></div>`,
  ui
);
const sheet = el(
  `<div class="paper sheet"><div class="sheet-top">${icon('file-spreadsheet', { size: 28 })} refunds_FINAL_v7.xlsx</div><div class="sheet-grid">
    <span>Sofia M.</span><span>€52.40</span><span>€89.00</span><span>€74.90</span>
    <span>Sofia M.</span><span class="err">189 zł ?</span><span>€29.00</span><span class="err">#REF!</span>
    <span>Luca B.</span><span>€118.00</span><span class="err">missing</span><span></span>
  </div></div>`,
  ui
);
const sticky = el(`<div class="paper sticky">189 zł<br>= € ???</div>`, ui);
const stamp = el(`<div class="stamp">DEADLINE: FRIDAY</div>`, ui);
const EXTRAS = [
  { node: mail, x: 330, y: 610, r: -8, z: 14, at: 0.2 },
  { node: sheet, x: 1090, y: 676, r: 5, z: 16, at: 0.34 },
  { node: sticky, x: 1370, y: 388, r: 8, z: 15, at: 0.48 },
  { node: stamp, x: 392, y: 356, r: -11, z: 17, at: 0.64 },
];
hidden(h3);
cards.forEach((c, i) => (c.node.style.zIndex = 10 + i));
EXTRAS.forEach((e) => {
  e.node.style.zIndex = e.z;
  gsap.set(e.node, { x: e.x, y: e.y, rotation: e.r, autoAlpha: 0 });
});

sink(capB, bar(6) - 0.42);
hide(stats, bar(6) - 0.42, { y: 0, duration: 0.35 });
tl.to(scrim, { opacity: 0, duration: 0.6 }, bar(6) - 0.3);
tl.set(M, { labelFloor: 5000 }, bar(6) + 0.4);
tl.to(M, { dim: 0.5, duration: 0.9, ease: 'power2.inOut' }, bar(6) - 0.15);
ROUTE.forEach((k) => tl.to(M.marks[k], { label: 0, duration: 0.5 }, bar(6) - 0.2));
cards.forEach((c, i) => tl.to(c, { pile: 1, duration: 0.85, ease: 'power3.inOut' }, bar(6) - 0.1 + i * 0.05));
rise(h3, bar(6) + 0.46);
EXTRAS.forEach((e) =>
  tl.fromTo(
    e.node,
    { autoAlpha: 0, y: e.y - 190, rotation: e.r + (e.r > 0 ? 14 : -14), scale: 1.14 },
    { autoAlpha: 1, y: e.y, rotation: e.r, scale: 1, duration: 0.6, ease: 'power3.out', immediateRender: false },
    bar(6) + e.at
  )
);

// ───────────────────────────── 4. One link (bars 7–8) ─────────────────────────────
const na = el(`<div id="na" class="serif"><span class="ln"><span><i>Not anymore.</i></span></span></div>`, ui);
const step1 = el(`<div class="step serif"><span class="ln"><span>One link.</span></span><span class="ln"><span><i class="grad">No app, no password.</i></span></span></div>`, ui);
const step2 = el(`<div class="step serif"><span class="ln"><span>AI reads her tickets</span></span><span class="ln"><span><i class="grad">and builds her trip.</i></span></span></div>`, ui);

const rowHTML = (tk, i) => `
  <div class="row">
    <div class="ic">${icon(tk.ico, { size: 30, stroke: 2.1 })}</div>
    <div class="tx"><div class="t1">${tk.from} → ${tk.to}</div><div class="t2">${tk.mode} · ${tk.date}</div></div>
    <div class="am">${i === 3 ? `<span class="old">189 zł</span><span class="new">€44.21<span class="note">official EU rate</span></span>` : tk.price}</div>
    <div class="ok">${check(22)}</div>
  </div>`;
const phone = el(
  `<div id="phone"><div class="ph-screen">
    <div class="ph-status"><span>9:41</span><span class="right">${icon('signal', { size: 26, stroke: 2.6 })}${icon('wifi', { size: 26, stroke: 2.6 })}${icon('battery-full', { size: 30, stroke: 2.2 })}</span></div>
    <div class="ph-island"></div>

    <div class="ph-view" id="phMail">
      <div class="ph-h1">Inbox</div>
      <div class="ph-card">
        <div class="ph-from">${logoSVG({ size: 62 })}<div class="who">Northern Lights<br>Youth Exchange</div><div class="when">now</div></div>
        <div class="ph-subject">Your reimbursement link</div>
        <div class="ph-body">Hi Sofia! Upload your travel tickets here. No account needed.</div>
        <div class="ph-btn" id="phBtn">Open my reimbursement ${icon('arrow-right', { size: 30, stroke: 2.6 })}<span class="tap" id="phTap"></span></div>
      </div>
      <div class="ph-ghost"><div class="bar" style="width:58%"></div><div class="bar" style="width:86%"></div></div>
      <div class="ph-ghost"><div class="bar" style="width:44%"></div><div class="bar" style="width:72%"></div></div>
    </div>

    <div class="ph-view" id="phUp">
      <div class="ph-hero"><div class="hi">Hi Sofia 👋</div><div class="proj">Northern Lights · Riga, 6–16 Sept</div></div>
      <div class="ph-h2">Upload your tickets</div>
      <div class="dz" id="dz">
        <div id="dzA">${icon('cloud-upload', { size: 78, stroke: 1.7, color: '#a855f7' })}<div class="dz-hint">Photos, PDFs, screenshots</div></div>
        <div id="dzB"><div class="dz-count" id="dzCount">1 of 5 uploaded</div><div class="dz-track"><div class="dz-fill" id="dzFill"></div></div></div>
      </div>
    </div>

    <div class="ph-view" id="phTrip">
      <div class="ph-title"><div class="ph-h1">Your trip</div><div class="ph-ai">${icon('sparkles', { size: 20 })} Built by AI</div></div>
      <div class="rows">${TICKETS.map(rowHTML).join('')}</div>
      <div class="total"><div class="l">Total to<br>reimburse</div><div class="v" id="phTotal">€0.00</div></div>
      <div class="green" id="phGreen">${icon('leaf', { size: 34, stroke: 2.2 })} Green travel ${check(30, 3.2)}</div>
    </div>
  </div></div>`,
  ui
);
const minis = TICKETS.map((tk) => el(`<div class="tk mini">${ticketHTML(tk)}</div>`, ui));
hidden(na, step1, step2, phone, '#phUp', '#phTrip', '#dzB', '#phGreen', '#phTap', minis);
gsap.set('#dzFill', { scaleX: 0 });
gsap.set($$('#phTrip .row'), { autoAlpha: 0 });
gsap.set($$('#phTrip .ok'), { scale: 0 });
gsap.set($$('#phTrip .new'), { autoAlpha: 0 });

// the paperwork blows away
const T4 = bar(7);
cards.forEach((c, i) => tl.to(c, { gone: 1, duration: 0.6, ease: 'power2.in' }, T4 - 0.14 + i * 0.03));
EXTRAS.forEach((e, i) => {
  const dx = e.x + 220 - 960;
  const dy = e.y + 100 - 620;
  const k = 1150 / Math.hypot(dx, dy);
  tl.to(e.node, { x: e.x + dx * k, y: e.y + dy * k, rotation: e.r + (dx > 0 ? 50 : -50), autoAlpha: 0, duration: 0.6, ease: 'power2.in' }, T4 - 0.14 + i * 0.03);
});
sink(h3, T4 - 0.3, { duration: 0.42 });
tl.to(M, { dim: 0.3, duration: 0.8 }, T4);
rise(na, T4 + 0.06, { duration: 0.9 });
sink(na, T4 + 1.2, { duration: 0.42 });

// the phone
const PHONE_IN = T4 + 0.4;
tl.fromTo(phone, { autoAlpha: 1, y: 1060, rotation: 7 }, { y: 0, rotation: 0, duration: 1.15, ease: 'swift', immediateRender: false }, PHONE_IN);
rise(step1, T4 + 1.62);
// tap on the magic link
const TAP = bar(7, 3);
tl.fromTo('#phTap', { autoAlpha: 0.9, scale: 0.2 }, { autoAlpha: 0, scale: 1.5, duration: 0.5, ease: 'power2.out', immediateRender: false }, TAP - 0.06);
tl.to('#phBtn', { scale: 0.95, duration: 0.1, ease: 'power2.out' }, TAP - 0.06);
tl.to('#phBtn', { scale: 1, duration: 0.3, ease: 'pop' }, TAP + 0.05);
const swap = (from, to, at) => {
  tl.to(from, { xPercent: -28, autoAlpha: 0, duration: 0.5, ease: 'inout' }, at);
  tl.fromTo(to, { xPercent: 100, autoAlpha: 1 }, { xPercent: 0, duration: 0.5, ease: 'inout', immediateRender: false }, at);
};
swap('#phMail', '#phUp', TAP + 0.18);

// her tickets fly into the phone
const dzBox = $('#dz').getBoundingClientRect();
const DZ = { x: dzBox.left + dzBox.width / 2, y: dzBox.top + dzBox.height / 2 };
const UP = bar(8) - 0.08;
const mr = [
  { x: 560, y: 690, r: -10 },
  { x: 700, y: 790, r: 7 },
  { x: 470, y: 840, r: -5 },
  { x: 760, y: 920, r: 11 },
  { x: 600, y: 970, r: -8 },
];
let lastLand = 0;
minis.forEach((m, k) => {
  const s = mr[k];
  const t0 = UP + k * 0.085;
  m.style.zIndex = 40;
  tl.fromTo(m, { autoAlpha: 0, x: s.x - 295, y: s.y - 66 + 60, rotation: s.r, scale: 0.3 }, { autoAlpha: 1, y: s.y - 66, scale: 0.6, duration: 0.28, ease: 'pop', immediateRender: false }, t0);
  tl.to(m, { x: DZ.x - 295, y: DZ.y - 66, rotation: 0, scale: 0.36, duration: 0.44, ease: 'power2.in' }, t0 + 0.22);
  tl.to(m, { autoAlpha: 0, scale: 0.2, duration: 0.1, ease: 'none' }, t0 + 0.6);
  const land = t0 + 0.64;
  lastLand = land;
  if (k === 0) {
    tl.to('#dzA', { autoAlpha: 0, duration: 0.15 }, land - 0.1);
    tl.to('#dzB', { autoAlpha: 1, duration: 0.15 }, land - 0.05);
  }
  tl.set('#dzCount', { textContent: `${k + 1} of 5 uploaded` }, land);
  tl.to('#dzFill', { scaleX: (k + 1) / 5, duration: 0.14, ease: 'power1.out' }, land);
});

// AI builds the trip
const TRIP = lastLand + 0.14;
swap('#phUp', '#phTrip', TRIP);
sink(step1, TRIP - 0.3, { duration: 0.4 });
rise(step2, TRIP + 0.12, { duration: 0.8 });
const total = { v: 0 };
const phTotal = $('#phTotal');
let sum = 0;
$$('#phTrip .row').forEach((row, i) => {
  const at = TRIP + 0.3 + i * 0.15;
  sum += TICKETS[i].eur;
  tl.fromTo(row, { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.42, ease: 'swift', immediateRender: false }, at);
  tl.to($('.ok', row), { scale: 1, duration: 0.38, ease: 'pop' }, at + 0.2);
  tl.to(total, { v: sum, duration: 0.3, ease: 'power2.out' }, at + 0.1);
  if (i === 3) {
    // 189 zł becomes euros at the official rate
    tl.to($('.old', row), { autoAlpha: 0, y: -16, duration: 0.22, ease: 'power2.in' }, at + 0.36);
    tl.fromTo($('.new', row), { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'swift', immediateRender: false }, at + 0.52);
  }
});
const GREEN = TRIP + 0.3 + 4 * 0.15 + 0.52;
tl.fromTo('#phGreen', { autoAlpha: 0, scale: 0.6, y: 20 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.55, ease: 'pop', immediateRender: false }, GREEN);

// ───────────────────────────── 5. The organiser (bars 9–10) ─────────────────────────────
const cap5a = el(`<div class="cap5 serif"><span class="ln"><span>Her organiser reviews it in <i class="grad">minutes.</i></span></span></div>`, ui);
const cap5b = el(`<div class="cap5 serif"><span class="ln"><span>And Sofia gets <i class="grad">paid.</i></span></span></div>`, ui);
const dash = el(
  `<div id="dash">
    <div class="d-head">
      <div class="d-av">SM</div>
      <div><div class="d-name">Sofia Marques</div><div class="d-sub">Portugal · 5 trips · 5 documents</div></div>
      <div class="d-status">
        <div class="pill sub" id="pSub">${icon('clock', { size: 26, stroke: 2.4 })} Submitted</div>
        <div class="pill app" id="pApp">${icon('thumbs-up', { size: 26, stroke: 2.4 })} Approved</div>
        <div class="pill paid" id="pPaid">${check(26, 3.4)} Paid</div>
      </div>
    </div>
    <div class="d-body">
      <div class="d-left">
        <div class="d-title">${icon('sparkles', { size: 30, color: '#d8b4fe' })} AI REVIEW</div>
        <div class="chk"><span class="ok">${check(24)}</span>5 tickets match her route</div>
        <div class="chk"><span class="ok">${check(24)}</span>189 zł converted at the EU rate</div>
        <div class="chk"><span class="ok">${check(24)}</span>Green travel confirmed</div>
        <div class="clear" id="clear">${icon('circle-check', { size: 40, stroke: 2.3 })} All clear</div>
      </div>
      <div class="d-right">
        <div class="sum">
          <div class="l"><span id="lTo">To reimburse</span><span id="lDone">Reimbursed</span></div>
          <div class="v">€289.51</div>
          <div class="btn" id="btn"><span class="b1">Approve</span><span class="b2">${check(34, 3.4)} Approved</span><span class="b3">${check(34, 3.4)} Paid</span></div>
        </div>
      </div>
    </div>
  </div>`,
  ui
);
const cursor = el(
  `<svg id="cursor" width="54" height="54" viewBox="0 0 24 24"><path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" fill="#fff" stroke="#150b2e" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  ui
);
const ring = el(`<div class="ring"></div>`, ui);
const notif = el(
  `<div id="notif">${logoSVG({ size: 96 })}<div style="flex:1"><div class="app">EasyReimburse <span>now</span></div><div class="msg">Your reimbursement of <b>€289.51</b> has been paid.</div></div></div>`,
  ui
);
const box = (sel) => {
  const r = $(sel).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
const BTN = box('#btn');
const PILL = box('#pPaid');
hidden(cap5a, cap5b, dash, cursor, ring, notif, '#pApp', '#pPaid', '#lDone', '#clear', $$('.btn .b2, .btn .b3', dash), $$('.chk', dash));
gsap.set($$('.chk .ok', dash), { scale: 0 });

const T5 = bar(9);
sink(step2, T5 - 0.46, { duration: 0.36 });
tl.fromTo(dash, { autoAlpha: 0, x: -70, scale: 0.97 }, { autoAlpha: 1, x: 0, scale: 1, duration: 0.95, ease: 'swift', immediateRender: false }, T5 - 0.05);
rise(cap5a, T5 + 0.1);
$$('.chk', dash).forEach((row, i) => {
  const at = bar(9, 1 + i) - 0.12;
  tl.fromTo(row, { autoAlpha: 0, x: -22 }, { autoAlpha: 1, x: 0, duration: 0.45, ease: 'swift', immediateRender: false }, at);
  tl.to($('.ok', row), { scale: 1, duration: 0.4, ease: 'pop' }, at + 0.14);
});
tl.fromTo('#clear', { autoAlpha: 0, scale: 0.7 }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'pop', immediateRender: false }, bar(9, 3) + 0.32);

// Approve → Paid
const CLICK = bar(10);
tl.fromTo(cursor, { autoAlpha: 0, x: 1040, y: 1010 }, { autoAlpha: 1, x: BTN.x + 74, y: BTN.y + 14, duration: 0.85, ease: 'power3.inOut', immediateRender: false }, CLICK - 0.95);
tl.to(cursor, { scale: 0.86, duration: 0.09, ease: 'power2.out', transformOrigin: '10% 10%' }, CLICK - 0.06);
tl.to(cursor, { scale: 1, duration: 0.2 }, CLICK + 0.06);
tl.to('#btn', { scale: 0.95, duration: 0.09, ease: 'power2.out' }, CLICK - 0.05);
tl.to('#btn', { scale: 1, duration: 0.35, ease: 'pop' }, CLICK + 0.05);
tl.to($('.b2', dash), { autoAlpha: 1, duration: 0.2 }, CLICK + 0.08);
tl.to('#pSub', { autoAlpha: 0, y: -14, duration: 0.2 }, CLICK + 0.12);
tl.fromTo('#pApp', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'swift', immediateRender: false }, CLICK + 0.2);
tl.to(cursor, { autoAlpha: 0, x: '+=60', y: '+=90', duration: 0.5, ease: 'power2.in' }, CLICK + 0.3);

const PAID = bar(10, 1);
tl.to('#pApp', { autoAlpha: 0, y: -14, duration: 0.18 }, PAID - 0.05);
tl.fromTo('#pPaid', { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'pop', immediateRender: false }, PAID);
tl.to($('.b3', dash), { autoAlpha: 1, duration: 0.2 }, PAID);
tl.to('#lTo', { autoAlpha: 0, duration: 0.2 }, PAID);
tl.to('#lDone', { autoAlpha: 1, duration: 0.2 }, PAID + 0.1);
tl.fromTo(ring, { autoAlpha: 0.9, x: PILL.x, y: PILL.y, scale: 0.4 }, { autoAlpha: 0, scale: 2.6, duration: 0.8, ease: 'power2.out', immediateRender: false }, PAID);
sink(cap5a, PAID - 0.1, { duration: 0.4 });
rise(cap5b, PAID + 0.38, { duration: 0.8 });
// the news reaches Sofia
const PING = bar(10, 2);
tl.fromTo(notif, { autoAlpha: 0, y: -110, scale: 0.86 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.7, ease: 'pop', immediateRender: false }, PING);
tl.to(phone, { y: 14, duration: 0.12, ease: 'power2.out' }, PING + 0.1);
tl.to(phone, { y: 0, duration: 0.5, ease: 'elastic.out(1.2, 0.4)' }, PING + 0.22);

// ───────────────────────────── 6. Everyone (bar 11) ─────────────────────────────
const all = el(
  `<div id="all" class="serif">
    <span class="ln"><span>38 participants.</span></span>
    <span class="ln"><span>12 countries.</span></span>
    <span class="ln"><span><i class="grad">All reimbursed.</i></span></span>
  </div>`,
  ui
);
hidden(all);
const T6 = bar(11);
tl.to(dash, { autoAlpha: 0, y: 50, duration: 0.42, ease: 'power2.in' }, T6 - 0.42);
tl.to(notif, { autoAlpha: 0, y: 50, duration: 0.42, ease: 'power2.in' }, T6 - 0.38);
tl.to(phone, { autoAlpha: 0, y: 420, duration: 0.5, ease: 'power2.in' }, T6 - 0.42);
sink(cap5b, T6 - 0.45, { duration: 0.36 });
tl.to(M, { dim: 1, convAlpha: 1, originDots: 1, rigaGlow: 1, duration: 1.0, ease: 'power2.inOut' }, T6 - 0.25);
tl.to(camA, { x: W / 2 + 10, y: H / 2, zoom: 1.02, duration: 1.25, ease: 'inout' }, T6 - 0.3);
tl.to(camA, { zoom: 1.2, x: W / 2 + 150, y: H / 2 - 40, duration: DURATION - (T6 + 0.95), ease: 'none' }, T6 + 0.95);
tl.to(M.marks.riga, { label: 1, duration: 0.5 }, T6);
// every route lights up, west to east
tl.to(M.marks.lisbon, { check: 1, duration: 0.45, ease: 'pop' }, T6 + 0.3);
map.conv
  .map((q, i) => ({ i, x: q.a.x }))
  .sort((a, b) => a.x - b.x)
  .forEach(({ i }, k) => {
    const at = T6 + 0.38 + k * 0.06;
    tl.to(M.conv[i], { lit: 1, duration: 0.5, ease: 'power2.out' }, at);
    tl.to(M.conv[i], { check: 1, duration: 0.45, ease: 'pop' }, at + 0.1);
  });
$$('.ln > span', all).forEach((line, i) => {
  if (i === 0) tl.set(all, { autoAlpha: 1 }, T6 + 0.28);
  tl.fromTo(line, { yPercent: 122 }, { yPercent: 0, duration: 0.9, ease: 'swift', immediateRender: false }, bar(11, i) + 0.28);
});

// ───────────────────────────── 7. End card (bars 12–13) ─────────────────────────────
const endScrim = el(`<div id="endScrim"></div>`, ui);
const glow = el(`<div id="glow"></div>`, ui);
const trail = el(
  `<svg id="trail" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <path id="trg" fill="none" stroke="#d946ef" stroke-opacity="0.3" stroke-width="26" stroke-linecap="round"/>
    <path id="trm" fill="none" stroke="#f0abfc" stroke-opacity="0.55" stroke-width="11" stroke-linecap="round"/>
    <path id="trp" fill="none" stroke="#fdf2f8" stroke-width="4.5" stroke-linecap="round"/>
  </svg>`,
  ui
);
const tile = el(`<div id="tile"></div>`, ui);
const bird = el(`<div id="bird">${birdSVG({ size: 176 })}</div>`, ui);
const word = el(`<div id="word">EasyReimburse</div>`, ui);
const tagline = el(`<div id="tagline" class="serif"><span class="ln"><span>Travel reimbursements, <i class="grad">from weeks to minutes.</i></span></span></div>`, ui);
const cta = el(`<div id="cta"><div class="go">Try for free ${icon('arrow-right', { size: 38, stroke: 2.6 })}</div><div class="url">easyreimburse.ai</div></div>`, ui);
const fine = el(`<div id="fine">Free trial for up to 10 participants</div>`, ui);

const wordW = word.getBoundingClientRect().width;
const LOCK = { x: (W - (176 + 44 + wordW)) / 2, y: 276 };
gsap.set(tile, { x: LOCK.x, y: LOCK.y, scale: 0, autoAlpha: 0 });
gsap.set(word, { x: LOCK.x + 176 + 44, y: LOCK.y + 20 });
// split the word into letters that rise one after another
word.innerHTML = [...'EasyReimburse'].map((ch) => `<span class="c">${ch}</span>`).join('');
const letters = $$('.c', word);
hidden(endScrim, glow, tagline, $$('#cta > *'), fine, letters);

const T7 = bar(12);
// The bird climbs in from the lower left, arcs over and settles onto the logo
const FLY = { at: T7 - 0.06, dur: 1.2 };
const fly = { p: 0, a: 0, trail: 0, settle: 0 };
const trp = $('#trp');
const trailPaths = [$('#trg'), $('#trm'), trp];
const landX = LOCK.x + 88;
const landY = LOCK.y + 88;
trailPaths.forEach((path) => path.setAttribute('d', `M-110,940 C${landX - 400},${landY + 330} ${landX - 250},${landY - 330} ${landX},${landY}`));
const trailLen = trp.getTotalLength();

sink(all, T7 - 0.4, { stagger: 0.05, duration: 0.4 });
tl.to(M, { dim: 0.2, duration: 1.0, ease: 'power2.inOut' }, T7 - 0.2);
tl.to(endScrim, { autoAlpha: 1, duration: 1.2, ease: 'power2.out' }, T7 + 0.2);
M.conv.forEach((c) => tl.to(c, { check: 0, duration: 0.35 }, T7 - 0.25));
tl.to(M.marks.lisbon, { check: 0, duration: 0.35 }, T7 - 0.25);
tl.to(M.marks.riga, { label: 0, duration: 0.4 }, T7 - 0.25);
tl.to(glow, { autoAlpha: 1, duration: 1.4, ease: 'power2.out' }, T7 + 0.5);
// she swoops in fast and slows down to land, on the second beat of the bar
tl.to(fly, { a: 1, duration: 0.12 }, FLY.at);
tl.to(fly, { p: 1, duration: FLY.dur, ease: 'power2.out' }, FLY.at);
const LAND = FLY.at + FLY.dur * 0.72;
tl.to(fly, { trail: 1, duration: 0.5 }, LAND);
tl.to(tile, { autoAlpha: 1, duration: 0.15 }, LAND);
tl.to(tile, { scale: 1, duration: 0.7, ease: 'pop' }, LAND);
tl.to(fly, { settle: 1, duration: 0.7, ease: 'pop' }, LAND);
tl.fromTo(letters, { autoAlpha: 0, yPercent: 60 }, { autoAlpha: 1, yPercent: 0, duration: 0.6, ease: 'swift', stagger: 0.028, immediateRender: false }, LAND + 0.18);
rise(tagline, bar(12, 3) - 0.1, { duration: 0.95 });
const CTA = bar(13) - 0.2;
tl.fromTo($('.go', cta), { autoAlpha: 0, scale: 0.7 }, { autoAlpha: 1, scale: 1, duration: 0.6, ease: 'pop', immediateRender: false }, CTA);
tl.fromTo($('.url', cta), { autoAlpha: 0, x: -24 }, { autoAlpha: 1, x: 0, duration: 0.6, ease: 'swift', immediateRender: false }, CTA + 0.16);
show(fine, CTA + 0.45, { y: 14, duration: 0.6 });

// Every masked line waits below its mask until its own rise starts
gsap.set($$('.ln > span'), { yPercent: 122 });

// ───────────────────────────── every frame ─────────────────────────────
const stT = $('#stT');
const stTl = $('#stTl');
const stC = $('#stC');
const stCl = $('#stCl');
const stK = $('#stK');
const icoTrain = $('.ico-train', tag);
const icoBus = $('.ico-bus', tag);
const wing = $('.wing', bird);
const birdSvg = $('svg', bird);
const easeOut = gsap.parseEase('power2.out');

onFrame((t) => {
  // camera
  if (t >= FOLLOW_FROM && t < FOLLOW_TO) Object.assign(M.cam, camAt(routeSpline(follow.u), follow.zoom));
  else Object.assign(M.cam, camA);
  map.draw(t);

  // the light's name tag
  const h = map.head();
  const hs = map.toScreen(h);
  tag.style.opacity = tagState.a;
  tag.style.visibility = tagState.a > 0.01 ? 'visible' : 'hidden';
  tag.style.transform = `translate(${(hs.x - 168).toFixed(2)}px, ${(hs.y + 40).toFixed(2)}px)`;
  icoTrain.style.opacity = h.leg < 4 ? 1 : 0;
  icoBus.style.opacity = h.leg < 4 ? 0 : 1;

  // tickets: beside the light → their slot on the right → the paperwork pile → gone
  let landed = 0;
  cards.forEach((c, i) => {
    const slot = SLOT(i);
    const pile = PILE[i];
    let x = lerp(hs.x - 295 + 110, slot.x, c.fly);
    let y = lerp(hs.y - 66 - 180, slot.y, c.fly);
    let rot = lerp(-4, 0, c.fly);
    let sc = c.s * lerp(1.08, 1, c.fly);
    let a = c.a;
    if (c.pile > 0) {
      x = lerp(x, pile.x, c.pile);
      y = lerp(y, pile.y, c.pile) - Math.sin(c.pile * Math.PI) * 60;
      rot = lerp(rot, pile.r, c.pile);
    }
    if (c.gone > 0) {
      const dx = pile.x + 295 - 960;
      const dy = pile.y + 66 - 620;
      const k = (1150 / Math.hypot(dx, dy)) * c.gone;
      x += dx * k;
      y += dy * k;
      rot += (dx > 0 ? 55 : -55) * c.gone;
      a *= 1 - c.gone;
    }
    c.node.style.opacity = a;
    c.node.style.visibility = a > 0.01 ? 'visible' : 'hidden';
    c.node.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rot.toFixed(3)}deg) scale(${sc.toFixed(4)})`;
    if (c.fly > 0.9) landed++;
  });
  stT.textContent = landed;
  stTl.textContent = landed === 1 ? 'ticket' : 'tickets';
  const cur = landed >= 4 ? 2 : landed >= 1 ? 1 : 0;
  stC.textContent = cur;
  stCl.textContent = cur === 1 ? 'currency' : 'currencies';
  stK.textContent = (Math.round((map.km() * 3500) / 3512 / 10) * 10).toLocaleString('en-GB');
  phTotal.textContent = fmtEur(total.v);

  // the bird flies in and lands on the logo
  const p = fly.p;
  const u = 1 - p;
  const headLen = p * trailLen;
  const at = trp.getPointAtLength(headLen);
  const flap = Math.sin(t * 30) * 20 * Math.pow(u, 0.6);
  const sc = lerp(0.72, 1, easeOut(p)) * (1 + 0.14 * Math.sin(fly.settle * Math.PI) * (1 - fly.settle));
  bird.style.opacity = fly.a;
  bird.style.visibility = fly.a > 0.01 ? 'visible' : 'hidden';
  bird.style.transform = `translate(${(at.x - 88).toFixed(2)}px, ${(at.y - 88).toFixed(2)}px) rotate(${(lerp(-36, 0, easeOut(p)) + flap * 0.2).toFixed(3)}deg) scale(${sc.toFixed(4)})`;
  wing.setAttribute('transform', `rotate(${flap.toFixed(3)} 296 308)`);
  birdSvg.style.filter = `drop-shadow(0 0 ${(30 * u + 2).toFixed(1)}px rgba(249, 168, 212, ${(0.95 * u).toFixed(3)}))`;
  // a comet tail behind her, ending under the bird
  const tailEnd = Math.max(0, headLen - 40 * sc);
  trailPaths.forEach((path, i) => {
    const tail = Math.min(tailEnd, [640, 430, 250][i]); // the bright core is shortest, so the tail tapers
    path.style.strokeDasharray = `${tail.toFixed(1)} ${(trailLen + 10).toFixed(1)}`;
    path.style.strokeDashoffset = (-(tailEnd - tail)).toFixed(1);
  });
  trail.style.opacity = fly.a * (1 - fly.trail);
});

await mount({ duration: DURATION, grain: 0.06 });

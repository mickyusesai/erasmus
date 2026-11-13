/**
 * Version B "Numbers": 124 BPM, one idea per bar.
 * Bars 1–4 the pain in numbers, bar 5 the drop, bar 6 the logo, bars 7–10 the product
 * in four punches, bars 11–12 the proof, bars 13–14 the end card.
 */
import { tl, mount, onFrame, $, $$, el, rng, clamp, lerp, prog, sceneWindow, loadIcons, icon, logoSVG, BIRD, polyPath, gsap } from '/shared/kit.js';
import { BEAT, BAR, at, shake, shakeOffset, slam, echo, counter, exitTo, riseWords, beatPulse } from './parts.js';

await loadIcons();

const world = $('#world');
const scene = (id, html = '') => {
  const s = el(`<section class="scene" id="${id}"></section>`, world);
  s.innerHTML = html;
  return s;
};

const BARS = 14; // bar 14 holds the end card; set to 13 to end right after the end card lands (25.2s)
const DURATION = Math.ceil(at(BARS + 1) * 10) / 10; // 27.1s
const DROP = at(5);

/** A quick swell on a beat: up in two frames, back down softly */
function bump(node, t, s = 1.06, up = 0.07, down = 0.3) {
  tl.to(node, { scale: s, duration: up, ease: 'power2.out' }, t);
  tl.to(node, { scale: 1, duration: down, ease: 'power2.out' }, t + up);
}

/** Something arrives: a short fade plus a move/scale that settles fast */
function enter(node, t, { x = 0, y = 0, scale = 1, rotation = 0, dur = 0.42, ease = 'expo.out', fade = 0.1 } = {}) {
  tl.fromTo(node, { opacity: 0 }, { opacity: 1, duration: fade, ease: 'none' }, t);
  tl.fromTo(node, { x, y, scale, rotation }, { x: 0, y: 0, scale: 1, rotation: 0, duration: dur, ease }, t);
}

function flash(t, peak = 0.9, dur = 0.4) {
  tl.set('#flash', { opacity: peak }, t);
  tl.to('#flash', { opacity: 0, duration: dur, ease: 'power2.out' }, t + 0.02);
}

/** A slanted brand-gradient panel crosses the screen; the scene changes while it covers everything */
const curtainEl = $('#curtain');
gsap.set(curtainEl, { skewX: -10, left: -240, right: -240 });
function curtain(t, dir = 1) {
  tl.set(curtainEl, { visibility: 'visible', x: -dir * 2500 }, t - 0.2);
  tl.to(curtainEl, { x: 0, duration: 0.2, ease: 'power2.in' }, t - 0.2);
  tl.to(curtainEl, { x: dir * 2500, duration: 0.28, ease: 'power2.out' }, t);
  tl.set(curtainEl, { visibility: 'hidden' }, t + 0.28);
}

// ───────────────────────────── Background ─────────────────────────────
const bursts = [];
/** A flare of the centre glow on a big hit */
const burst = (t, amp = 1, dur = 0.9) => bursts.push({ t, amp, dur });

function energy(t) {
  if (t < at(4)) return 0.4; // bars 1–3: dim
  if (t < DROP) return lerp(0.4, 0.22, prog(t, at(4), DROP)); // bar 4: the room goes dark and red
  if (t < at(7)) return 1; // the drop and the logo
  if (t < at(13)) return 0.74;
  return 0.95;
}

const [g1, g2, g3, g4, dots] = ['#g1', '#g2', '#g3', '#g4', '#dots'].map((s) => $(s));
const shaker = $('#shaker');
onFrame((t) => {
  const pulse = beatPulse(t, 4.5);
  const e = energy(t);
  g1.style.opacity = (e * (0.6 + 0.4 * pulse)).toFixed(3);
  g2.style.opacity = (e * (0.55 + 0.45 * pulse)).toFixed(3);
  g1.style.transform = `translate(${(Math.sin(t * 0.55) * 70).toFixed(1)}px, ${(Math.cos(t * 0.4) * 46).toFixed(1)}px) scale(${(1 + 0.05 * pulse).toFixed(4)})`;
  g2.style.transform = `translate(${(Math.cos(t * 0.45) * 80).toFixed(1)}px, ${(Math.sin(t * 0.5) * 50).toFixed(1)}px) scale(${(1 + 0.05 * pulse).toFixed(4)})`;
  dots.style.transform = `translate(${(-((t * 16) % 54)).toFixed(2)}px, ${(-((t * 10) % 54)).toFixed(2)}px)`;

  // Bar 4: a red glow that throbs twice a beat and grows until the drop
  const tension = t >= at(4) && t < DROP ? prog(t, at(4), DROP) : 0;
  const eighth = Math.exp(-4 * ((t / (BEAT / 2)) % 1));
  g4.style.opacity = (tension * (0.5 + 0.5 * eighth)).toFixed(3);

  let flare = 0;
  for (const b of bursts) if (t >= b.t) flare += b.amp * Math.exp((-4.2 * (t - b.t)) / b.dur);
  g3.style.opacity = clamp(flare).toFixed(3);
  g3.style.transform = `scale(${(1 + 0.25 * clamp(flare)).toFixed(4)})`;

  const [sx, sy] = shakeOffset(t);
  shaker.style.transform = `translate(${sx.toFixed(2)}px, ${sy.toFixed(2)}px)`;
});

// ───────────────────────────── Running header (bars 1–4) ─────────────────────────────
const kicker = el(`<div id="kicker"><span class="dot"></span><span>ONE ERASMUS+ PROJECT</span></div>`, world);
const idx = el(`<div id="idx"><b>01</b> / 04</div>`, world);
tl.set([kicker, idx], { visibility: 'hidden' }, DROP - 0.07);
onFrame((t) => {
  if (t >= DROP) return;
  $('.dot', kicker).style.opacity = (0.35 + 0.65 * beatPulse(t, 3.5)).toFixed(3);
  const n = Math.min(4, Math.floor(t / BAR + 1e-6) + 1);
  const label = `<b>0${n}</b> / 04`;
  if (idx.innerHTML !== label) idx.innerHTML = label;
});
for (let b = 2; b <= 4; b++) bump(idx, at(b), 1.18, 0.05, 0.25);
// In bar 4 the header fades as the spreadsheet creeps in behind it
tl.to([kicker, idx], { opacity: 0, duration: BEAT * 1.2, ease: 'power1.in' }, at(4, 0.9));

// ───────────────────────────── Bar 1: 42 participants ─────────────────────────────
{
  const s = scene('s1', `
    <div class="numwrap" id="w42" style="left:114px; top:262px"><div class="num" id="n42" style="font-size:520px">42</div></div>
    <div class="label" id="lw42" style="left:130px; top:730px; font-size:104px"><span class="mask"><span id="l42">participants</span></span></div>
    <div id="avgrid"></div>`);
  sceneWindow(s, 0, at(2));

  const r = rng(42);
  const hues = [
    ['#8b5cf6', '#5b21b6'], ['#a855f7', '#7e22ce'], ['#d946ef', '#a21caf'], ['#ec4899', '#be185d'],
    ['#6366f1', '#4338ca'], ['#f472b6', '#db2777'], ['#c084fc', '#9333ea'],
  ];
  const initials = 'SM JN CC EO TD NP AK LB MR IV HS OL FG PB RT DZ YA KM WU ZE AB BN GH JV LC MD NE OF PG RH SI TJ UK VL WM AN BO CP DR ES FT GU'.split(' ');
  const grid = $('#avgrid');
  const avs = initials.map((name, i) => {
    const [a, b] = hues[(i * 3 + Math.floor(r() * 4)) % hues.length];
    return el(`<div class="av" style="background:linear-gradient(140deg, ${a}, ${b})">${name}</div>`, grid);
  });

  const n42 = $('#n42');
  echo(n42, at(1, 2), { origin: '0% 60%' });
  slam(n42, 0, { from: 1.45, origin: '0% 60%', amp: 16 });
  counter(n42, { from: 2, to: 42, t: 0.04, duration: 0.82, ease: 'none' });

  // People pop in one by one while the number counts them
  const order = avs.map((_, i) => [r(), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  order.forEach((i, k) => {
    tl.fromTo(avs[i], { scale: 0 }, { scale: 1, duration: 0.26, ease: 'pop' }, 0.05 + k * 0.0195);
  });
  riseWords([$('#l42')], at(1, 1) - 0.06);

  // Beat 3 and 4: the count lands, a wave runs through the crowd
  bump(n42, at(1, 2), 1.05);
  shake(at(1, 2), 7);
  avs.forEach((a, i) => {
    const col = i % 7;
    const row = Math.floor(i / 7);
    bump(a, at(1, 2) + (col + row) * 0.028, 1.22, 0.08, 0.26);
    bump(a, at(1, 3) + (6 - col + row) * 0.028, 1.15, 0.08, 0.24);
  });

  exitTo(['#w42', '#lw42'], at(2), { x: -160, dur: 0.11 });
  tl.to(avs, { scale: 0, duration: 0.09, ease: 'power2.in', stagger: { each: 0.0012, from: 'end' } }, at(2) - 0.15);
}

// ───────────────────────────── Bar 2: 317 tickets ─────────────────────────────
{
  const s = scene('s2', `
    <div id="pile"></div>
    <div class="numwrap" id="w317" style="right:112px; top:254px"><div class="num" id="n317" style="font-size:540px">317</div></div>
    <div class="label" id="lw317" style="right:130px; top:738px; font-size:104px"><span class="mask"><span id="l317">tickets</span></span></div>`);
  sceneWindow(s, at(2), at(3));
  const t0 = at(2);

  const r = rng(317);
  const kinds = ['BOARDING PASS', 'E-TICKET', 'INVOICE', 'RECEIPT', 'BOOKING', 'E-TICKET'];
  const routes = [
    ['LIS', 'RIX'], ['WAW', 'RIX'], ['PRG', 'VNO'], ['ATH', 'BER'], ['MAD', 'FCO'], ['BUD', 'TLL'], ['KRK', 'RIX'],
    ['ZAG', 'VIE'], ['OTP', 'WAW'], ['RIX', 'LIS'], ['BER', 'RIX'], ['VNO', 'PRG'], ['FCO', 'RIX'], ['RIX', 'ATH'],
  ];
  const amounts = ['€189.40', '312 zł', '1 240 Kč', '€42.00', '219 lei', '€7.70', '489 kr', '28 900 Ft', '€96.15', '74 zł', '€131.99', '655 Kč', '€23.80', '€58.60'];
  const tints = ['', 'violet', 'pink', '', 'violet', '', 'pink'];
  const pile = $('#pile');
  const N = 14;
  const tks = [];
  for (let i = 0; i < N; i++) {
    const [a, b] = routes[i];
    const tk = el(`<div class="tk ${tints[i % tints.length]}">
      <div class="kind">${kinds[i % kinds.length]}</div>
      <div class="route">${a}<i>→</i>${b}</div>
      <div class="amt">${amounts[i]}</div>
      <div class="stub"></div><div class="bars"></div>
    </div>`, pile);
    // Where it comes to rest: a loose fan left of centre
    const x = 96 + r.range(0, 330);
    const y = 268 + r.range(0, 370);
    const rot = r.range(-19, 19);
    const land = t0 + 0.02 + i * 0.1;
    tl.fromTo(tk, { x: x + r.range(-260, 260), y: y - 1150, rotation: rot + r.range(-70, 70) }, { x, y, rotation: rot, duration: 0.3, ease: 'power2.in' }, land);
    tl.fromTo(tk, { scale: 1.1 }, { scale: 1, duration: 0.22, ease: 'power2.out', immediateRender: false }, land + 0.3);
    shake(land + 0.3, 3.2, 0.12);
    tks.push(tk);
  }

  const n317 = $('#n317');
  echo(n317, at(2, 3), { origin: '100% 60%' });
  slam(n317, t0, { from: 1.45, origin: '100% 60%', amp: 15 });
  counter(n317, { from: 3, to: 317, t: t0 + 0.04, duration: 1.38, ease: 'power1.out' });
  riseWords([$('#l317')], at(2, 1) - 0.06);
  bump(n317, at(2, 3), 1.05);
  shake(at(2, 3), 9);

  exitTo(['#w317', '#lw317'], at(3), { x: 160, dur: 0.11 });
  tl.to(tks, { x: '-=900', rotation: '-=40', duration: 0.16, ease: 'power2.in', stagger: 0.004 }, at(3) - 0.22);
}

// ───────────────────────────── Bar 3: 6 currencies ─────────────────────────────
{
  const money = [['€', 'EUR'], ['zł', 'PLN'], ['Kč', 'CZK'], ['lei', 'RON'], ['kr', 'SEK'], ['Ft', 'HUF']];
  const s = scene('s3', `
    <div class="numwrap" id="w6" style="left:136px; top:196px"><div class="num" id="n6" style="font-size:680px">6</div></div>
    <div class="label" id="lw6" style="left:130px; top:762px; font-size:104px"><span class="mask"><span id="l6">currencies</span></span></div>
    <div id="tiles">${money.map(([sym, code]) => `<div class="tile"><div class="lit"></div><div class="sym">${sym}</div><div class="code">${code}</div></div>`).join('')}</div>`);
  sceneWindow(s, at(3), at(4));
  const t0 = at(3);

  const n6 = $('#n6');
  const tiles = $$('.tile', s);
  echo(n6, at(3, 3), { origin: '0% 60%' });
  slam(n6, t0, { from: 1.45, origin: '0% 60%', amp: 15 });
  // The word arrives with "2", so it never reads "1 currencies"
  riseWords([$('#l6')], t0 + BEAT / 2 - 0.04);
  tl.fromTo(tiles, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'pop', stagger: 0.025 }, t0);

  // One currency lights up on every half beat, and the number counts along: 1, 2, 3 … 6
  const lightAt = (k) => t0 + k * (BEAT / 2);
  const count = { v: 1 };
  tiles.forEach((tile, k) => {
    const t = lightAt(k);
    tl.set(count, { v: k + 1 }, t);
    tl.fromTo($('.lit', tile), { opacity: 0 }, { opacity: 1, duration: 0.06, ease: 'none' }, t);
    tl.to($('.lit', tile), { opacity: 0.5, duration: 0.5, ease: 'power2.out' }, t + 0.06);
    tl.to(tile, { scale: 1.1, duration: 0.06, ease: 'power2.out' }, t + (k === 0 ? 0.33 : 0));
    tl.to(tile, { scale: 1, duration: 0.25, ease: 'power2.out' }, t + (k === 0 ? 0.39 : 0.06));
    if (k > 0) {
      tl.to(n6, { scale: 1.06, duration: 0.05, ease: 'power2.out' }, t);
      tl.to(n6, { scale: 1, duration: 0.17, ease: 'power2.out' }, t + 0.05);
      shake(t, 3.5, 0.12);
    }
  });
  onFrame(() => {
    const v = String(count.v);
    if (n6.textContent !== v) n6.textContent = v;
  });

  // Beat 4: all six at once
  const hit = at(3, 3);
  const lits = tiles.map((x) => $('.lit', x));
  tl.to(lits, { opacity: 1, duration: 0.05, ease: 'none' }, hit);
  tl.to(lits, { opacity: 0.62, duration: 0.4, ease: 'power2.out' }, hit + 0.05);
  tiles.forEach((tile) => bump(tile, hit, 1.08, 0.06, 0.3));
  bump(n6, hit, 1.07);
  shake(hit, 10);

  exitTo(['#w6', '#lw6'], at(4), { y: -140, dur: 0.11 });
  tl.to(tiles, { y: 160, opacity: 0, duration: 0.11, ease: 'power2.in', stagger: 0.008 }, at(4) - 0.16);
}

// ───────────────────────────── Bar 4: 1 deadline ─────────────────────────────
// A spreadsheet creeps in behind the countdown; it is blown apart at the drop (bar 5)
const sheet = el(`<div id="sheet"></div>`, world);
const cells = [];
{
  const r = rng(4);
  const junk = ['=SUM(D2:D43)', '#REF!', '312 zł', 'ticket_FINAL_v3', 'IBAN ?', '€ ???', '1 240 Kč', 'boarding pass?', 'rate 4.27 ?', '#N/A', 'paid ??', 'missing', 'scan0042.jpg', '#VALUE!', 'who paid?', '219 lei', 'see email', 'resend!!'];
  for (let i = 0; i < 120; i++) {
    const text = r() < 0.5 ? r.pick(junk) : '';
    const err = text.startsWith('#') || text.includes('?');
    const cell = el(`<div class="cell${err ? ' err' : ''}"><span>${text}</span></div>`, sheet);
    cells.push({ node: cell, inner: cell.firstElementChild, err, col: i % 10, row: Math.floor(i / 10) });
  }
}
tl.set(sheet, { visibility: 'hidden' }, 0);
tl.set(sheet, { visibility: 'visible' }, at(4, 0.5));
tl.fromTo(sheet, { opacity: 0 }, { opacity: 1, duration: BEAT * 2.5, ease: 'power1.in' }, at(4, 0.5));
tl.set(sheet, { visibility: 'hidden' }, DROP + 1.1);
onFrame((t) => {
  if (t < at(4) || t > DROP + 1.1) return;
  // Error cells flicker on sixteenth notes until the drop
  const step = Math.floor(t / (BEAT / 4) + 1e-6);
  for (const [i, c] of cells.entries()) {
    if (!c.err) continue;
    const on = t >= DROP || rng(step * 131 + i * 17)() > 0.45;
    c.inner.style.opacity = on ? '1' : '0.3';
  }
});

{
  const C = 2 * Math.PI * 430;
  let ticks = '';
  for (let i = 5; i <= 55; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r1 = i % 5 === 0 ? 450 : 458;
    ticks += `<line x1="${(500 + Math.sin(a) * r1).toFixed(1)}" y1="${(500 - Math.cos(a) * r1).toFixed(1)}" x2="${(500 + Math.sin(a) * 472).toFixed(1)}" y2="${(500 - Math.cos(a) * 472).toFixed(1)}" stroke="rgba(255,255,255,${i % 5 === 0 ? 0.5 : 0.22})" stroke-width="${i % 5 === 0 ? 5 : 3}" stroke-linecap="round"/>`;
  }
  const s = scene('s4', `
    <div id="s4zoom" class="fill">
      <svg id="ring" viewBox="0 0 1000 1000">
        <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f472b6"/><stop offset="1" stop-color="#f43f5e"/></linearGradient></defs>
        <g>${ticks}</g>
        <circle cx="500" cy="500" r="430" fill="rgba(10,6,18,.6)" stroke="rgba(255,255,255,.1)" stroke-width="14"/>
        <circle id="arc" cx="500" cy="500" r="430" fill="none" stroke="url(#rg)" stroke-width="30" stroke-linecap="round" transform="rotate(-90 500 500)" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="0"/>
      </svg>
      <div class="numwrap" id="w1" style="left:0; right:0; top:208px; text-align:center"><div class="num" id="n1" style="font-size:480px; display:inline-block">1</div></div>
      <div class="label" id="lw1" style="left:0; right:0; top:620px; font-size:100px; text-align:center; color:#fff"><span class="mask"><span id="l1">deadline</span></span></div>
      <div id="daysleft"><b id="dl">30</b> DAYS LEFT</div>
    </div>`);
  sceneWindow(s, at(4), DROP);
  const t0 = at(4);
  const n1 = $('#n1');
  const zoom = $('#s4zoom');

  tl.fromTo('#ring', { scale: 0.7, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1, opacity: 1, duration: 0.4, ease: 'expo.out' }, t0);
  slam(n1, t0, { from: 1.6, amp: 16 });
  riseWords([$('#l1')], t0 + 0.1);
  tl.fromTo('#daysleft', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.3 }, t0 + 0.2);
  counter($('#dl'), { from: 30, to: 1, t: t0 + 0.15, duration: BAR - 0.3, ease: 'power1.in', format: (v) => String(Math.max(1, Math.round(v))).padStart(2, '0') });

  // The ring runs out exactly at the drop
  const arc = $('#arc');
  onFrame((t) => {
    if (t < t0 || t >= DROP) return;
    arc.setAttribute('stroke-dashoffset', (C * prog(t, t0 + 0.1, DROP - 0.1)).toFixed(1));
  });

  // A heartbeat that gets faster and harder, and a slow push in
  const beats = [[1, 1.05, 5], [2, 1.07, 7], [2.5, 1.06, 6], [3, 1.09, 9], [3.25, 1.07, 8], [3.5, 1.1, 11], [3.75, 1.12, 13]];
  for (const [b, sc, amp] of beats) {
    bump(n1, at(4, b), sc, 0.05, 0.16);
    shake(at(4, b), amp, 0.16);
  }
  tl.fromTo([zoom, sheet], { scale: 1, transformOrigin: '50% 50%' }, { scale: 1.16, duration: BEAT * 2.9, ease: 'power2.in' }, at(4, 1));

  // Two frames of black before the drop
  tl.set('#blackout', { opacity: 1 }, DROP - 0.066);
  tl.set('#blackout', { opacity: 0 }, DROP);
}

// ───────────────────────────── Bar 5: 0 spreadsheets. (the drop) ─────────────────────────────
// The zero is a ring that lives on into bar 6, where it closes up and becomes the logo
const Z = { x: 960, y: 392, w: 530, h: 420, stroke: 178 };
const L = { x: 960, y: 292, size: 264 };
const zero = el(`<svg id="zero" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="zg" gradientUnits="userSpaceOnUse" x1="${Z.x - Z.w / 2 - Z.stroke / 2}" y1="${Z.y - Z.h / 2 - Z.stroke / 2}" x2="${Z.x + Z.w / 2 + Z.stroke / 2}" y2="${Z.y + Z.h / 2 + Z.stroke / 2}">
      <stop offset="0" stop-color="#a855f7"/><stop offset="0.5" stop-color="#d946ef"/><stop offset="1" stop-color="#ec4899"/>
    </linearGradient>
  </defs>
  <g id="zgroup">
    <rect class="zecho" fill="none" stroke="#e9d5ff" stroke-width="5" opacity="0"/>
    <rect class="zecho" fill="none" stroke="#e9d5ff" stroke-width="5" opacity="0"/>
    <rect id="zr" x="${Z.x - Z.w / 2}" y="${Z.y - Z.h / 2}" width="${Z.w}" height="${Z.h}" rx="${Z.w / 2}" ry="${Z.h / 2}" fill="none" stroke="url(#zg)" stroke-width="${Z.stroke}"/>
    <g id="zbird" transform="translate(${L.x - L.size / 2} ${L.y - L.size / 2}) scale(${L.size / 500})">
      <path class="wing" d="${polyPath(BIRD.wing)}" fill="#fff"/>
      <path class="head" d="${polyPath(BIRD.head)}" fill="#fff"/>
      <path class="tail" d="${polyPath(BIRD.tail)}" fill="#fff"/>
    </g>
  </g>
</svg>`, world);
tl.set(zero, { visibility: 'visible' }, DROP);
tl.set(zero, { visibility: 'hidden' }, at(7));
{
  const s = scene('s5', `<div id="spread"><span id="sp" style="display:inline-block">spreadsheets.</span></div>`);
  sceneWindow(s, DROP, at(6));

  flash(DROP, 0.96, 0.5);
  burst(DROP, 1.3, 1.7);
  shake(DROP, 30, 0.45);

  // The spreadsheet is blown outwards from the middle
  const r = rng(5);
  for (const c of cells) {
    const dx = -40 + c.col * 200 + 100 - 960;
    const dy = -30 + c.row * 95 + 47.5 - 540;
    const len = Math.hypot(dx, dy) || 1;
    const dist = 700 + r() * 800;
    tl.fromTo(c.node,
      { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
      { x: (dx / len) * dist + r.range(-120, 120), y: (dy / len) * dist + r.range(-120, 120), rotation: r.range(-170, 170), scale: 0.5, opacity: 0, duration: 0.8, ease: 'power3.out', immediateRender: false },
      DROP + len / 5200);
  }

  // The zero lands
  tl.fromTo('#zgroup', { scale: 2.7, svgOrigin: `${Z.x} ${Z.y}` }, { scale: 1, duration: 0.5, ease: 'expo.out' }, DROP);
  gsap.set('#zbird > *', { scale: 0, transformOrigin: '50% 50%' });
  slam($('#sp'), at(5, 1), { from: 1.5, amp: 14 });
  bump('#zgroup', at(5, 1), 1.05, 0.06, 0.3);
  bump('#zgroup', at(5, 2), 1.04, 0.06, 0.3);
  shake(at(5, 2), 6);

  // Rings ripple out of the zero on beats 2 and 3
  const echoes = $$('.zecho', zero);
  const ripples = [at(5, 1), at(5, 2)];
  onFrame((t) => {
    echoes.forEach((ring, i) => {
      const p = (t - ripples[i]) / 0.75;
      if (p < 0 || p >= 1) {
        ring.setAttribute('opacity', '0');
        return;
      }
      const k = 1 - (1 - p) ** 3;
      const w = Z.w + Z.stroke + k * 520;
      const h = Z.h + Z.stroke + k * 440;
      ring.setAttribute('x', (Z.x - w / 2).toFixed(1));
      ring.setAttribute('y', (Z.y - h / 2).toFixed(1));
      ring.setAttribute('width', w.toFixed(1));
      ring.setAttribute('height', h.toFixed(1));
      ring.setAttribute('rx', (w / 2).toFixed(1));
      ring.setAttribute('ry', (h / 2).toFixed(1));
      ring.setAttribute('opacity', (0.8 * (1 - p)).toFixed(3));
    });
  });

  // Last beat: the word drops away and the ring closes into the logo's rounded square
  const mt = at(5, 3.25);
  const md = at(6) - mt;
  tl.to('#sp', { y: 90, opacity: 0, scale: 0.92, duration: 0.17, ease: 'power2.in' }, mt - 0.05);
  const half = L.size / 2;
  tl.to('#zr', { attr: { x: L.x - half / 2, y: L.y - half / 2, width: half, height: half, rx: 96 - half / 2, ry: 96 - half / 2, 'stroke-width': half }, duration: md, ease: 'power3.inOut' }, mt);
  tl.to('#zg', { attr: { x1: L.x - half, y1: L.y - half, x2: L.x + half, y2: L.y + half }, duration: md, ease: 'power3.inOut' }, mt);
}

// ───────────────────────────── Bar 6: logo ─────────────────────────────
{
  const s = scene('s6', `
    <div id="wordmark"><span class="mask"><span id="wm">EasyReimburse</span></span></div>
    <div class="tagline" id="tag1"><span class="mask"><span id="tg1">Erasmus+ travel reimbursements.</span></span></div>
    <div class="tagline" id="tag2"><span class="mask"><span id="tg2" class="grad">From weeks to minutes.</span></span></div>`);
  sceneWindow(s, at(6) - 0.02, at(7));
  const t0 = at(6);

  flash(t0, 0.5, 0.32);
  burst(t0, 1, 1.2);
  shake(t0, 13);
  // The bird unfolds on the downbeat
  $$('#zbird > *').forEach((part, i) => {
    tl.to(part, { scale: 1, duration: 0.36, ease: 'pop' }, t0 + i * 0.05);
  });
  bump('#zgroup', t0, 1.12, 0.05, 0.4);
  riseWords([$('#wm')], t0 + 0.1, { dur: 0.5 });
  riseWords([$('#tg1')], at(6, 1.5) - 0.05);
  riseWords([$('#tg2')], at(6, 2.25) - 0.05, { dur: 0.45 });
  bump('#zgroup', at(6, 2.25), 1.06, 0.06, 0.3);
  shake(at(6, 2.25), 5);
}

// ───────────────────────────── Bars 7–10: the product in four punches ─────────────────────────────
curtain(at(7));

/** Shared in and out for a feature bar: the whole frame pushes in from one side and leaves by the other */
function featureFrame(fx, bar, dir, { pushIn = true } = {}) {
  if (pushIn) enter(fx, at(bar), { x: dir * 130, dur: 0.5, fade: 0.07 });
  tl.to(fx, { x: -dir * 190, opacity: 0, duration: 0.1, ease: 'power2.in' }, at(bar + 1) - 0.1);
}
const arrow = (size, color = '#fff') => icon('arrow-right', { size, color, stroke: 2.6 });
function ghost(sceneEl, bar, dir) {
  const g = $('.ghost', sceneEl);
  tl.fromTo(g, { scale: 1.25, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1, opacity: 1, duration: 0.5, ease: 'expo.out' }, at(bar) + 0.02);
  onFrame((t) => {
    if (t < at(bar) || t > at(bar + 1)) return;
    g.style.marginLeft = `${(dir * (t - at(bar)) * 26).toFixed(2)}px`;
  });
}

// 01 Invite
{
  const s = scene('s7', `<div class="fx" id="fx7">
    <div class="ghost" style="left:70px; top:292px">01</div>
    <div class="tag" style="left:130px; top:352px"><b>01</b>INVITE</div>
    <div class="h" style="left:124px; top:432px">
      <span class="mask"><span id="h7a"><span class="grad">Magic link</span> in.</span></span>
      <span class="mask"><span id="h7b">No accounts.</span></span>
    </div>
    <div class="glass" id="mail">
      <div class="mailhead">
        <div class="org">${icon('users', { size: 40, color: '#fff', stroke: 2.4 })}</div>
        <div><div class="from">Your organisation</div><div class="sub">Your travel reimbursement</div></div>
        <div class="mtime">09:41</div>
      </div>
      <div class="mailbody">Hi Sofia, your reimbursement page is ready.</div>
      <div class="btn" id="mbtn">Open my reimbursement ${arrow(40)}</div>
      <div id="rip"></div>
      <div id="cur">${icon('mouse-pointer-2', { size: 64, color: '#1b1038', fill: '#fff', stroke: 1.6 })}</div>
    </div>
    <div class="glass" id="incard">
      <div class="inrow">
        <div class="av2">SM</div>
        <div class="hello">Welcome, Sofia</div>
        <div class="ok" id="ok7">${icon('check', { size: 38, stroke: 3.2 })}You're in</div>
      </div>
      <div class="chips">
        ${['Password', 'App', 'Sign-up'].map((c) => `<div class="chip"><span>${c}</span><i class="strike"></i></div>`).join('')}
      </div>
    </div>
  </div>`);
  sceneWindow(s, at(7), at(8));
  const t0 = at(7);
  featureFrame($('#fx7'), 7, 1, { pushIn: false });
  ghost(s, 7, 1);

  riseWords([$('#h7a')], t0 + 0.06);
  riseWords([$('#h7b')], at(7, 1) - 0.05);
  shake(at(7, 1), 5);
  enter($('#mail'), t0 + 0.04, { x: 220, dur: 0.5 });

  // The pointer comes in and clicks the link
  const click = at(7, 1.5);
  tl.fromTo('#cur', { x: 190, y: 170, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.42, ease: 'power3.out' }, click - 0.46);
  tl.to('#cur', { scale: 0.86, duration: 0.05, transformOrigin: '10% 10%' }, click - 0.02);
  tl.to('#cur', { scale: 1, duration: 0.14 }, click + 0.04);
  tl.to('#mbtn', { scale: 0.94, duration: 0.05, ease: 'power2.out' }, click - 0.01);
  tl.to('#mbtn', { scale: 1, duration: 0.22, ease: 'pop' }, click + 0.05);
  tl.set('#rip', { scale: 0.2, opacity: 0.95 }, click);
  tl.to('#rip', { scale: 2.1, opacity: 0, duration: 0.45, ease: 'power2.out' }, click);

  // … and the participant is in: no password, no app, no sign-up
  enter($('#incard'), at(7, 2), { y: 90, scale: 0.9, dur: 0.4, ease: 'pop' });
  shake(at(7, 2), 6);
  $$('#incard .chip').forEach((chip, i) => {
    const t = at(7, 2.5 + i * 0.25);
    tl.fromTo($('.strike', chip), { scaleX: 0 }, { scaleX: 1, duration: 0.12, ease: 'power2.out' }, t);
    tl.to($('span', chip), { opacity: 0.45, duration: 0.12 }, t);
  });
  tl.fromTo('#ok7', { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'pop' }, at(7, 3.25));
}

// 02 Extract
{
  const xrow = (id, top, ic, label, value) => `<div class="glass xrow" id="${id}" style="top:${top}px">
      <div class="xicon">${icon(ic, { size: 34, color: '#fff', stroke: 2.4 })}</div>
      <div class="xlabel">${label}</div><div class="xval">${value}</div>
      <div class="spark">${icon('sparkles', { size: 38, stroke: 2.2 })}</div>
    </div>`;
  const s = scene('s8', `<div class="fx" id="fx8">
    <div id="pass">
      <div class="ptop">BOARDING PASS<span>FLIGHT 0482</span></div>
      <div class="pname">MARQUES / SOFIA</div>
      <div class="proute">LIS ${icon('plane', { size: 66, stroke: 2.2 })} RIX</div>
      <div class="pmeta"><div><small>DATE</small>24 AUG 2026</div><div><small>SEAT</small>14C</div><div><small>FARE</small>EUR 189.40</div></div>
      <div class="pstub"><div class="pbars"></div></div>
      <div class="hl" id="hl1" style="left:24px; top:110px; width:500px; height:128px"></div>
      <div class="hl" id="hl2" style="left:26px; top:250px; width:214px; height:84px"></div>
      <div class="hl" id="hl3" style="left:324px; top:250px; width:198px; height:84px"></div>
      <div id="scan"></div>
    </div>
    ${xrow('x1', 580, 'route', 'ROUTE', 'Lisbon → Riga')}
    ${xrow('x2', 694, 'calendar', 'DATE', '24 Aug 2026')}
    ${xrow('x3', 808, 'euro', 'AMOUNT', '€189.40')}
    <div class="ghost" style="left:960px; top:292px">02</div>
    <div class="tag" style="left:1010px; top:352px"><b>02</b>EXTRACT</div>
    <div class="h" style="left:1004px; top:432px">
      <span class="mask"><span id="h8a"><span class="grad">AI</span> reads</span></span>
      <span class="mask"><span id="h8b">every ticket.</span></span>
    </div>
  </div>`);
  sceneWindow(s, at(8), at(9));
  const t0 = at(8);
  featureFrame($('#fx8'), 8, -1);
  ghost(s, 8, -1);

  riseWords([$('#h8a')], t0 + 0.04);
  riseWords([$('#h8b')], at(8, 1) - 0.05);
  shake(at(8, 1), 5);
  gsap.set('#pass', { rotation: -4 });
  tl.fromTo('#pass', { rotation: -14, scale: 0.86 }, { rotation: -4, scale: 1, duration: 0.5, ease: 'expo.out' }, t0);

  // A scan line runs down the pass and the fields light up as it passes them
  tl.fromTo('#scan', { y: -150, opacity: 1 }, { y: 370, duration: 0.56, ease: 'power1.inOut' }, t0 + 0.14);
  tl.to('#scan', { opacity: 0, duration: 0.08 }, t0 + 0.68);
  const lights = [['#hl1', t0 + 0.4], ['#hl2', t0 + 0.56], ['#hl3', t0 + 0.6]];
  for (const [sel, t] of lights) tl.fromTo(sel, { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.16, ease: 'power2.out' }, t);

  // What it read, one field per half beat
  ['#x1', '#x2', '#x3'].forEach((sel, i) => {
    const t = at(8, 1 + i * 0.5);
    enter($(sel), t, { y: -46, scale: 0.9, dur: 0.34, ease: 'pop' });
    tl.fromTo($(`${sel} .spark`), { scale: 0, rotation: -90 }, { scale: 1, rotation: 0, duration: 0.3, ease: 'pop' }, t + 0.1);
    shake(t, 3.5, 0.12);
  });
  const all = at(8, 3);
  ['#x1', '#x2', '#x3'].forEach((sel, i) => bump(sel, all + i * 0.04, 1.045, 0.06, 0.26));
  shake(all, 6);
}

// 03 Convert
{
  const s = scene('s9', `<div class="fx" id="fx9">
    <div class="ghost" style="left:70px; top:292px">03</div>
    <div class="tag" style="left:130px; top:352px"><b>03</b>CONVERT</div>
    <div class="h" style="left:124px; top:432px">
      <span class="mask"><span id="h9a"><span class="grad">Official EU</span></span></span>
      <span class="mask"><span id="h9b">exchange rates.</span></span>
    </div>
    <div class="glass" id="conv">
      <div class="cmeta">TRAIN TICKET · BOUGHT 14 JUL 2026</div>
      <div class="cfrom" id="cfrom">1,240<span>Kč</span></div>
      <div class="cdiv"><i id="cd1"></i><div class="ratechip" id="rate">1 € = 25.243 Kč</div><i id="cd2"></i></div>
      <div class="cto grad" id="ceur">€49.12</div>
      <div class="csrc" id="csrc">${icon('shield-check', { size: 40, stroke: 2.4 })}InforEuro monthly rate</div>
    </div>
    <div class="glass mini" id="mini1" style="left:1030px"><span>312 zł</span><i>→</i><b>€73.07</b></div>
    <div class="glass mini" id="mini2" style="left:1422px"><span>219 lei</span><i>→</i><b>€44.02</b></div>
  </div>`);
  sceneWindow(s, at(9), at(10));
  const t0 = at(9);
  featureFrame($('#fx9'), 9, 1);
  ghost(s, 9, 1);

  riseWords([$('#h9a')], t0 + 0.04);
  riseWords([$('#h9b')], at(9, 1) - 0.05);
  shake(at(9, 1), 5);

  tl.fromTo('#cfrom', { scale: 1.3, opacity: 0, transformOrigin: '0% 60%' }, { scale: 1, opacity: 1, duration: 0.34, ease: 'expo.out' }, t0 + 0.08);
  tl.fromTo('#rate', { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'pop' }, at(9, 1));
  tl.fromTo('#cd1', { scaleX: 0, transformOrigin: '100% 50%' }, { scaleX: 1, duration: 0.3 }, at(9, 1) + 0.05);
  tl.fromTo('#cd2', { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.3 }, at(9, 1) + 0.05);

  // The euro amount spins up and lands on beat 3
  const land = at(9, 2);
  const ceur = $('#ceur');
  tl.fromTo(ceur, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' }, land - 0.36);
  counter(ceur, { from: 0, to: 49.12, t: land - 0.36, duration: 0.36, ease: 'power2.out', format: (v) => '€' + v.toFixed(2) });
  tl.fromTo(ceur, { scale: 1 }, { scale: 1.1, duration: 0.06, ease: 'power2.out', transformOrigin: '0% 70%', immediateRender: false }, land);
  tl.to(ceur, { scale: 1, duration: 0.3, ease: 'power2.out' }, land + 0.06);
  shake(land, 9);
  burst(land, 0.45, 0.6);
  tl.fromTo('#csrc', { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.3 }, land + 0.1);

  enter($('#mini1'), at(9, 2.5), { y: 50, scale: 0.88, dur: 0.32, ease: 'pop' });
  enter($('#mini2'), at(9, 3), { y: 50, scale: 0.88, dur: 0.32, ease: 'pop' });
  shake(at(9, 2.5), 3, 0.12);
  shake(at(9, 3), 3, 0.12);
}

// 04 Review
{
  const row = (id, text, warn = false) => `<div class="rv" id="${id}">
      ${warn ? '<div class="warnbg"></div>' : ''}
      <div class="rvic"><span class="todo"></span>${warn ? `<span class="warn">${icon('flag', { size: 30, stroke: 2.8 })}</span>` : ''}<span class="done">${icon('check', { size: 34, stroke: 3.4 })}</span></div>
      <span>${text}</span>${warn ? '<div class="needs">Needs you</div>' : ''}
    </div>`;
  const s = scene('s10', `<div class="fx" id="fx10">
    <div class="glass" id="rev">
      <div class="rvhead">${icon('sparkles', { size: 46, stroke: 2.2 })}AI Review<span class="rvcount">4 CHECKS</span></div>
      ${row('rv1', 'Boarding pass matches flight')}
      ${row('rv2', 'Amount matches invoice')}
      ${row('rv3', 'Rate from purchase date')}
      ${row('rv4', 'Proof for every trip', true)}
    </div>
    <div id="allclear">${icon('circle-check', { size: 64, stroke: 2.6 })}All clear</div>
    <div class="ghost" style="left:960px; top:292px">04</div>
    <div class="tag" style="left:1010px; top:288px"><b>04</b>REVIEW</div>
    <div class="h" style="left:1004px; top:368px">
      <span class="mask"><span id="h10a">AI review</span></span>
      <span class="mask"><span id="h10b"><span class="grad">flags</span> what</span></span>
      <span class="mask"><span id="h10c">needs you.</span></span>
    </div>
  </div>`);
  sceneWindow(s, at(10), at(11));
  const t0 = at(10);
  featureFrame($('#fx10'), 10, -1);
  ghost(s, 10, -1);

  riseWords([$('#h10a')], t0 + 0.04);
  riseWords([$('#h10b')], at(10, 1) - 0.05);
  riseWords([$('#h10c')], at(10, 1) + 0.04);

  // Three checks pass in quick succession
  const tick = (id, t) => {
    tl.fromTo(`${id} .done`, { scale: 0 }, { scale: 1, duration: 0.24, ease: 'pop' }, t);
    tl.to(`${id} .todo`, { opacity: 0, duration: 0.05 }, t);
  };
  tick('#rv1', t0 + 0.14);
  tick('#rv2', t0 + 0.26);
  tick('#rv3', t0 + 0.38);

  // The fourth is flagged on beat 2 …
  const flag = at(10, 1);
  tl.fromTo('#rv4 .warn', { scale: 0 }, { scale: 1, duration: 0.26, ease: 'pop' }, flag);
  tl.to('#rv4 .todo', { opacity: 0, duration: 0.05 }, flag);
  tl.fromTo('#rv4 .warnbg', { opacity: 0 }, { opacity: 1, duration: 0.08 }, flag);
  tl.fromTo('#rv4 .needs', { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.28, ease: 'pop' }, flag + 0.06);
  tl.to('#rv4', { scale: 1.045, duration: 0.07, ease: 'power2.out' }, flag);
  tl.to('#rv4', { scale: 1, duration: 0.3, ease: 'power2.out' }, flag + 0.07);
  shake(flag, 9);
  bump('#rv4', at(10, 2), 1.03, 0.06, 0.25);

  // … you deal with it, and everything is clear on beat 4
  const fix = at(10, 2.5);
  tl.to('#rv4 .warn', { scale: 0, duration: 0.1, ease: 'power2.in' }, fix - 0.1);
  tl.fromTo('#rv4 .done', { scale: 0 }, { scale: 1, duration: 0.26, ease: 'pop' }, fix);
  tl.to(['#rv4 .warnbg', '#rv4 .needs'], { opacity: 0, duration: 0.14 }, fix);
  const clear = at(10, 3);
  tl.fromTo('#allclear', { scale: 0, opacity: 0, rotation: -8 }, { scale: 1, opacity: 1, rotation: -3, duration: 0.36, ease: 'pop' }, clear);
  shake(clear, 8);
  burst(clear, 0.4, 0.6);
}

// ───────────────────────────── Bar 11: Approve. Pay. Done. ─────────────────────────────
{
  const people = [['🇵🇹', 'Sofia M.', '€274.60'], ['🇵🇱', 'Jakub N.', '€198.20'], ['🇮🇹', 'Chiara C.', '€231.75'], ['🇱🇻', 'Elza O.', '€86.40'], ['🇨🇿', 'Tomáš D.', '€259.10']];
  const s = scene('s11', `
    <div class="pw" id="pw1" style="top:214px">Approve.</div>
    <div class="pw" id="pw2" style="top:404px">Pay.</div>
    <div class="pw" id="pw3" style="top:594px"><span class="grad" style="display:inline-block; padding-right:0.06em">Done.</span></div>
    <div id="plist">${people.map(([flag, name, amt]) => `<div class="prow">
      <span class="flag">${flag}</span><span class="pname2">${name}</span><span class="pamt">${amt}</span>
      <div class="pill"><span class="st0">Submitted</span><span class="st1">Approved</span><span class="st2">${icon('check', { size: 28, stroke: 3.4 })}Paid</span></div>
    </div>`).join('')}</div>
    <div class="glass" id="total"><span>Total reimbursed</span><b id="tot">€0.00</b></div>`);
  sceneWindow(s, at(11), at(12));
  const t0 = at(11);
  flash(t0, 0.35, 0.25);

  const rows = $$('.prow', s);
  rows.forEach((row, i) => enter(row, t0 + i * 0.03, { x: 160, dur: 0.4 }));

  const flip = (cls, t) => {
    rows.forEach((row, i) => {
      const at_ = t + i * 0.05;
      tl.fromTo($(`.${cls}`, row), { scaleY: 0, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.16, ease: 'pop' }, at_);
      tl.to(row, { scale: 1.035, duration: 0.05, ease: 'power2.out' }, at_);
      tl.to(row, { scale: 1, duration: 0.2, ease: 'power2.out' }, at_ + 0.05);
    });
  };
  slam($('#pw1'), t0, { from: 1.5, origin: '0% 50%', amp: 14 });
  flip('st1', t0 + 0.16);
  slam($('#pw2'), at(11, 1), { from: 1.5, origin: '0% 50%', amp: 14 });
  flip('st2', at(11, 1) + 0.1);
  slam($('#pw3'), at(11, 2), { from: 1.5, origin: '0% 50%', amp: 18, split: false });
  burst(at(11, 2), 0.7, 0.9);

  // Confetti from the word "Done."
  {
    const r = rng(11);
    const colours = ['#34d399', '#6ee7b7', '#ffffff', '#f0abfc', '#ec4899', '#a855f7'];
    const t1 = at(11, 2);
    const bits = Array.from({ length: 84 }, () => {
      const w = r.range(14, 34);
      const h = w * r.range(0.4, 1);
      const node = el('<div class="confetti"></div>', s);
      node.style.width = w.toFixed(0) + 'px';
      node.style.height = h.toFixed(0) + 'px';
      node.style.background = r.pick(colours);
      const angle = r.range(-2.85, -0.2); // a fan upwards
      const speed = r.range(700, 2300);
      return { node, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spin: r.range(-900, 900), life: r.range(1.0, 1.6), x0: 330 + r.range(-190, 230), y0: 650 + r.range(-50, 30) };
    });
    onFrame((t) => {
      const dt = t - t1;
      for (const b of bits) {
        if (dt < 0 || dt > b.life) {
          if (b.node.style.opacity !== '0') b.node.style.opacity = '0';
          continue;
        }
        const drag = (1 - Math.exp(-2.2 * dt)) / 2.2; // fast at first, then floating
        const x = b.x0 + b.vx * drag;
        const y = b.y0 + b.vy * drag + 620 * dt * dt;
        b.node.style.opacity = Math.min(1, (b.life - dt) / 0.35).toFixed(3);
        b.node.style.transform = 'translate(' + x.toFixed(1) + 'px, ' + y.toFixed(1) + 'px) rotate(' + (b.spin * dt).toFixed(1) + 'deg)';
      }
    });
  }

  // The total lands with "Done."
  enter($('#total'), at(11, 2), { y: 70, scale: 0.9, dur: 0.36, ease: 'pop' });
  counter($('#tot'), { from: 0, to: 12480.5, t: at(11, 2) + 0.02, duration: 0.44, ease: 'power2.out', format: (v) => '€' + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
  bump('#total', at(11, 3), 1.05, 0.06, 0.3);
  bump('#pw3', at(11, 3), 1.05, 0.06, 0.3);
  shake(at(11, 3), 7);

  exitTo(['#pw1', '#pw2', '#pw3'], at(12), { x: -180, dur: 0.1 });
  tl.to(['#plist', '#total'], { x: 200, opacity: 0, duration: 0.1, ease: 'power2.in' }, at(12) - 0.1);
}

// ───────────────────────────── Bar 12: 90% less time spent ─────────────────────────────
{
  const s = scene('s12', `
    <div class="numwrap" id="w90" style="left:118px; top:178px"><div class="num grad" id="n90" style="font-size:500px; padding-right:0.05em">90%</div></div>
    <div class="label" id="lw90" style="left:130px; top:606px; font-size:112px; color:#fff"><span class="mask"><span id="l90">less time spent</span></span></div>
    <div class="tl" id="tmins">MINUTES</div>
    <div class="tl" id="tweeks">WEEKS</div>
    <div id="track"><div id="fill"></div></div>`);
  sceneWindow(s, at(12), at(13));
  const t0 = at(12);

  const n90 = $('#n90');
  echo(n90, at(12, 1), { origin: '0% 60%', colour: 'rgba(240,171,252,.8)' });
  slam(n90, t0, { from: 1.45, origin: '0% 60%', amp: 16, split: false });
  counter(n90, { from: 0, to: 90, t: t0 + 0.02, duration: 0.42, ease: 'power3.out', format: (v) => Math.round(v) + '%' });
  burst(t0, 0.6, 0.8);
  riseWords([$('#l90')], at(12, 1) - 0.06);
  bump(n90, at(12, 1), 1.04);
  shake(at(12, 1), 6);

  // From weeks to minutes: the bar collapses to a tenth
  tl.fromTo(['#track', '#tweeks'], { opacity: 0 }, { opacity: 1, duration: 0.2 }, at(12, 1) + 0.1);
  tl.fromTo('#fill', { scaleX: 0 }, { scaleX: 1, duration: 0.34, ease: 'power2.out' }, at(12, 1) + 0.1);
  tl.to('#fill', { scaleX: 0.1, duration: 0.42, ease: 'expo.inOut' }, at(12, 2) - 0.2);
  tl.to('#tweeks', { opacity: 0.35, duration: 0.3 }, at(12, 2));
  tl.fromTo('#tmins', { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.26, ease: 'pop' }, at(12, 2.5));
  shake(at(12, 2.5), 5);
  bump(n90, at(12, 3), 1.04);
}

// ───────────────────────────── Bars 13–14: end card ─────────────────────────────
curtain(at(13), -1);
{
  const s = scene('s13', `
    <div id="endlogo">${logoSVG({ size: 200 })}</div>
    <div id="endname"><span class="mask"><span id="en">EasyReimburse</span></span></div>
    <div id="endline"><span class="mask"><span id="eln">Travel reimbursements, <span class="grad">from weeks to minutes.</span></span></span></div>
    <div id="cta">
      <div id="trybtn">Try for free ${arrow(52)}<div id="shine"></div></div>
      <div id="url">easyreimburse.ai</div>
    </div>
    <div id="foot">
      <span id="ft1">${icon('badge-check', { size: 44, stroke: 2.2 })}Free trial for up to 10 participants</span>
      <span id="ft2">${icon('shield-check', { size: 44, stroke: 2.2 })}Data stored in the EU</span>
    </div>`);
  sceneWindow(s, at(13));
  const t0 = at(13);

  burst(t0 + 0.05, 0.9, 1.3);
  tl.fromTo('#endlogo', { scale: 0.3, opacity: 0, rotation: -25 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.5, ease: 'pop' }, t0 + 0.04);
  riseWords([$('#en')], t0 + 0.16, { dur: 0.5 });
  riseWords([$('#eln')], at(13, 1) - 0.02, { dur: 0.5 });
  tl.fromTo('#trybtn', { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.36, ease: 'pop' }, at(13, 2));
  shake(at(13, 2), 5);
  tl.fromTo('#url', { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.34 }, at(13, 2) + 0.14);
  tl.fromTo(['#ft1', '#ft2'], { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.36, stagger: 0.1 }, at(13, 3));

  // Bar 14: a hold with a glint on the button and a soft pulse on the logo
  tl.fromTo('#shine', { x: -160, opacity: 1 }, { x: 560, duration: 0.6, ease: 'power2.inOut' }, at(14) - 0.05);
  bump('#trybtn', at(14), 1.05, 0.07, 0.35);
  bump('#endlogo', at(14), 1.07, 0.07, 0.4);
  bump('#endlogo', at(14, 2), 1.04, 0.07, 0.4);
  burst(at(14), 0.5, 1.2);
}

await mount({ duration: DURATION, grain: 0.06 });

/**
 * Scenes 4–7: the product in four steps. Text on the left, a small working demo on the right.
 */
import { tl, gsap, $, $$, el, icon, logoSVG, onFrame, countTo, fmtEur, rng, BIRD, polyPath } from '/shared/kit.js';
import { boardingPass, trainTicket, busTicket, receipt } from './papers.js';
import { T, show, hide, riseLines, fadeUp, popIn } from './common.js';

const PEOPLE = [
  { flag: '🇵🇹', name: 'Sofia Almeida', country: 'Portugal', amount: 289.51, c: ['#a855f7', '#ec4899'] },
  { flag: '🇵🇱', name: 'Jakub Nowak', country: 'Poland', amount: 142.3, c: ['#0ea5e9', '#6366f1'] },
  { flag: '🇮🇹', name: 'Chiara Conti', country: 'Italy', amount: 238.75, c: ['#f59e0b', '#ef4444'] },
  { flag: '🇨🇿', name: 'Tomáš Dvořák', country: 'Czechia', amount: 125.82, c: ['#10b981', '#0ea5e9'] },
  { flag: '🇱🇻', name: 'Elīna Ozola', country: 'Latvia', amount: 64.2, c: ['#ec4899', '#f59e0b'] },
];
const initials = (name) => name.split(' ').map((w) => w[0]).join('');
const avatar = (p, size = 60) =>
  `<div class="av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;background:linear-gradient(135deg,${p.c[0]},${p.c[1]})">${initials(p.name)}</div>`;

const STEPS = [
  { key: 'invite', chip: 'Invite', lines: ['Send a link.', 'They’re in.'], sub: 'No accounts, no passwords, no app.' },
  { key: 'upload', chip: 'Upload', lines: ['They snap', 'their tickets.'], sub: 'Photos, PDFs, screenshots.<br>From any phone.' },
  { key: 'ai', chip: 'AI reads', lines: ['AI does the', 'data entry.'], sub: 'Routes, dates, prices and currencies.<br>Read for you.' },
  { key: 'review', chip: 'Approve & pay', lines: ['It checks.', 'You approve.'], sub: 'Every file is reviewed before you pay.' },
];

/** Position of a node's centre inside an ancestor, ignoring transforms */
function centreIn(node, ancestor) {
  let x = node.offsetWidth / 2;
  let y = node.offsetHeight / 2;
  for (let n = node; n && n !== ancestor; n = n.offsetParent) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y };
}

const cursorSVG = () => icon('mouse-pointer-2', { size: 54, fill: '#1a1033', color: '#fff', stroke: 1.5, cls: 'cursor-i' });

function click(cursor, target, at) {
  tl.to(cursor, { scale: 0.82, duration: 0.09, ease: 'power2.in' }, at);
  tl.to(cursor, { scale: 1, duration: 0.22, ease: 'pop' }, at + 0.09);
  tl.to(target, { scale: 0.94, duration: 0.09, ease: 'power2.in' }, at);
  tl.to(target, { scale: 1, duration: 0.3, ease: 'pop' }, at + 0.09);
}

// ───────────────────────────── Step 1: invite ─────────────────────────────
function demoInvite(demo, t0) {
  demo.innerHTML = `
    <div class="card invite-card">
      <div class="card-head">
        <div><div class="card-title">Green Horizons</div><div class="card-sub">Youth exchange · Riga · 24 Aug – 3 Sep</div></div>
        <div class="btn-grad" id="send-btn">${icon('send', { size: 26, stroke: 2.4 })}Send magic links</div>
      </div>
      <div class="rows">
        ${PEOPLE.map((p) => `
          <div class="row">
            ${avatar(p)}
            <div class="row-main"><b>${p.name} <span class="flag">${p.flag}</span></b><span>${p.country}</span></div>
            <div class="chip-stack"><span class="chip gray">Not invited</span><span class="chip purple sent">${icon('check', { size: 22, stroke: 3 })}Link sent</span></div>
          </div>`).join('')}
      </div>
    </div>
    <div class="toast" id="invite-toast">${icon('circle-check', { size: 30, stroke: 2.4, color: '#34d399' })}5 magic links sent</div>
    <div class="cursor" id="cursor-invite">${cursorSVG()}</div>`;
  const card = $('.invite-card', demo);
  const btn = $('#send-btn', demo);
  const from = centreIn(btn, demo);
  const rows = $$('.row', demo);

  gsap.set(card, { x: 150, opacity: 0, rotation: 1.5 });
  tl.to(card, { x: 0, opacity: 1, rotation: 0, duration: 0.75, ease: 'swift' }, t0 - 0.15);
  fadeUp(rows, t0 + 0.12, { y: 22, duration: 0.5, stagger: 0.055 });

  // The cursor presses "Send magic links"
  const cursor = $('#cursor-invite', demo);
  gsap.set(cursor, { x: from.x + 250, y: from.y + 330, opacity: 0 });
  tl.to(cursor, { opacity: 1, duration: 0.15, ease: 'none' }, t0 + 0.55);
  tl.to(cursor, { x: from.x + 44, y: from.y + 20, duration: 0.6, ease: 'inout' }, t0 + 0.55);
  click(cursor, btn, t0 + 1.2);
  tl.to(cursor, { opacity: 0, x: '+=60', y: '+=90', duration: 0.4, ease: 'power2.in' }, t0 + 1.6);

  // One envelope per participant flies from the button to their row
  rows.forEach((row, i) => {
    const to = centreIn($('.chip-stack', row), demo);
    const env = el(`<div class="envelope"><svg width="74" height="54" viewBox="0 0 74 54"><rect x="1.5" y="1.5" width="71" height="51" rx="9" fill="#fff" stroke="#e9d5ff" stroke-width="3"/><path d="M4 6 L37 31 L70 6" fill="none" stroke="#c084fc" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`, demo);
    const at = t0 + 1.32 + i * 0.09;
    gsap.set(env, { xPercent: -50, yPercent: -50, x: from.x, y: from.y, scale: 0, rotation: -20 });
    tl.to(env, { scale: 1, duration: 0.18, ease: 'pop' }, at);
    tl.to(env, { motionPath: { path: [{ x: from.x, y: from.y }, { x: (from.x + to.x) / 2 + 110, y: (from.y + to.y) / 2 - 30 }, { x: to.x, y: to.y }], curviness: 1.3 }, rotation: 8, duration: 0.55, ease: 'power2.inOut' }, at + 0.05);
    tl.to(env, { scale: 0, opacity: 0, duration: 0.14, ease: 'power2.in' }, at + 0.56);
    const sent = $('.sent', row);
    gsap.set(sent, { scale: 0, opacity: 0 });
    tl.to(sent, { scale: 1, opacity: 1, duration: 0.4, ease: 'pop' }, at + 0.6);
    tl.to($('.chip.gray', row), { opacity: 0, duration: 0.15, ease: 'none' }, at + 0.6);
  });

  const toast = $('#invite-toast', demo);
  gsap.set(toast, { xPercent: -50, y: 50, opacity: 0, scale: 0.9 });
  tl.to(toast, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'pop' }, t0 + 2.3);
}

// ───────────────────────────── Step 2: upload ─────────────────────────────
function demoUpload(demo, t0) {
  const docs = [
    { label: 'Flight', kind: 'plane', color: '#a855f7' },
    { label: 'Train', kind: 'train-front', color: '#f97316' },
    { label: 'Bus', kind: 'bus-front', color: '#10b981' },
    { label: 'Receipt', kind: 'receipt', color: '#0ea5e9' },
  ];
  const papers = [
    { html: boardingPass({ from: 'LIS', to: 'RIX', fromCity: 'Lisbon', toCity: 'Riga', name: 'ALMEIDA / SOFIA', flight: 'ER 482', date: '23 AUG', seat: '14A', color: '#a855f7', seed: 61 }), x: -20, y: 160, rot: -11 },
    { html: trainTicket({ from: 'Lisboa Ori.', to: 'Madrid Ch.', when: '21 AUG 2026 · 21:25', price: '€52.40', color: '#f97316', seed: 62 }), x: 770, y: 120, rot: 9 },
    { html: busTicket({ from: 'Rīga', to: 'Valmiera', when: '24.08.2026 · 17:26', price: '€7.70', color: '#10b981', seed: 63 }), x: 775, y: 560, rot: -7 },
    { html: receipt({ shop: 'CAFÉ CENTRAL', lines: [['2x Coffee', '5,60'], ['Sandwich', '6,90']], total: '12,50 €', seed: 64 }), x: -10, y: 610, rot: 12, wrap: 'rc-wrap' },
  ];
  demo.innerHTML = `
    <div class="phone">
      <div class="ph-screen">
        <div class="ph-notch"></div>
        <div class="ph-top">${logoSVG({ size: 40 })}<b>EasyReimburse</b></div>
        <div class="ph-hi">Hi Sofia 👋</div>
        <div class="ph-p">Upload your travel documents</div>
        <div class="ph-drop">${icon('cloud-upload', { size: 50, stroke: 2 })}<span>Add photos or PDFs</span></div>
        <div class="ph-grid">
          ${docs.map((d) => `<div class="thumb"><div class="thumb-doc" style="--c:${d.color}">${icon(d.kind, { size: 30, stroke: 2.2 })}<i></i><i></i></div><span>${d.label}</span><div class="thumb-ok">${icon('check', { size: 20, stroke: 3.4 })}</div></div>`).join('')}
        </div>
        <div class="ph-btn">Continue</div>
      </div>
    </div>
    ${papers.map((p) => `<div class="slot fly ${p.wrap || ''}">${p.html}</div>`).join('')}`;

  const phone = $('.phone', demo);
  gsap.set(phone, { y: 260, opacity: 0, rotation: 5 });
  tl.to(phone, { y: 0, opacity: 1, rotation: 0, duration: 0.85, ease: 'swift' }, t0 - 0.15);

  const drop = centreIn($('.ph-drop', demo), demo);
  const thumbs = $$('.thumb', demo);
  gsap.set(thumbs, { scale: 0, opacity: 0 });
  gsap.set($$('.thumb-ok', demo), { scale: 0 });
  $$('.fly', demo).forEach((slot, i) => {
    const p = papers[i];
    gsap.set(slot, { xPercent: -50, yPercent: -50, x: p.x, y: p.y, rotation: p.rot - 14, scale: 0, opacity: 0 });
    // The papers gather around the phone…
    tl.to(slot, { scale: 0.62, opacity: 1, rotation: p.rot, duration: 0.5, ease: 'pop' }, t0 + 0.25 + i * 0.08);
    // …and drop into the upload box one after another
    const at = t0 + 1.0 + i * 0.24;
    tl.to(slot, { motionPath: { path: [{ x: p.x, y: p.y }, { x: (p.x + drop.x) / 2, y: Math.min(p.y, drop.y) - 90 }, { x: drop.x, y: drop.y }], curviness: 1.2 }, scale: 0.16, rotation: p.rot * -0.3, duration: 0.46, ease: 'power2.in' }, at);
    tl.to(slot, { opacity: 0, duration: 0.1, ease: 'none' }, at + 0.38);
    tl.fromTo($('.ph-drop', demo), { scale: 1.06 }, { scale: 1, duration: 0.3, ease: 'power2.out', immediateRender: false }, at + 0.44);
    tl.to(thumbs[i], { scale: 1, opacity: 1, duration: 0.4, ease: 'pop' }, at + 0.46);
    tl.to($('.thumb-ok', thumbs[i]), { scale: 1, duration: 0.35, ease: 'pop' }, at + 0.72);
  });
  const btn = $('.ph-btn', demo);
  gsap.set(btn, { opacity: 0.35 });
  tl.to(btn, { opacity: 1, duration: 0.3 }, t0 + 2.35);
  tl.fromTo(btn, { scale: 1 }, { scale: 1.05, duration: 0.18, yoyo: true, repeat: 1, ease: 'sine.inOut', immediateRender: false }, t0 + 2.4);
}

// ───────────────────────────── Step 3: AI reads ─────────────────────────────
function demoAi(demo, t0) {
  const trips = [
    { kind: 'plane', route: 'Prague → Riga', date: '23 Aug', amount: 49.12 },
    { kind: 'bus-front', route: 'Riga → Valmiera', date: '24 Aug', amount: 7.7 },
    { kind: 'bus-front', route: 'Valmiera → Riga', date: '3 Sep', amount: 7.7 },
    { kind: 'plane', route: 'Riga → Prague', date: '3 Sep', amount: 61.3 },
  ];
  const fields = [
    { label: 'Route', value: 'Prague → Riga' },
    { label: 'Date', value: '23 Aug 2026' },
    { label: 'Passenger', value: 'Tomáš Dvořák', tag: 'matches' },
    { label: 'Price', value: '1,240 Kč', price: true },
  ];
  demo.innerHTML = `
    <div class="ai-pass slot">
      <div class="paper bp eticket" style="--c:#a855f7">
        <div class="bp-main">
          <div class="bp-top"><span>E-TICKET · RECEIPT</span><span>ER 216</span></div>
          <div class="bp-route"><b>PRG</b><i></i>${icon('plane', { size: 30, stroke: 2.2 })}<i></i><b>RIX</b></div>
          <div class="bp-cities"><span>Prague</span><span>Riga</span></div>
          <div class="bp-meta">
            <div><label>Passenger</label><span>DVORAK / TOMAS</span></div>
            <div><label>Date</label><span>23 AUG 2026</span></div>
            <div><label>Total paid</label><span>1 240 Kč</span></div>
          </div>
        </div>
        <div class="beam"></div>
      </div>
    </div>
    <div class="card ai-card">
      <div class="card-head slim"><div class="ai-badge">${icon('sparkles', { size: 26, stroke: 2.2 })}</div><div class="card-title">Read by AI</div><div class="chip purple" id="ai-count">4 fields found</div></div>
      <div class="fields">
        ${fields.map((f) => `
          <div class="field">
            <label>${f.label}</label>
            <div class="field-v"><i class="skel"></i>
              ${f.price
                ? `<span class="val"><span class="mono">${f.value}</span><span class="conv">${icon('arrow-right', { size: 28, stroke: 2.6 })}<b class="mono" id="eur">€0.00</b><em class="chip green">official EU rate</em></span></span>`
                : `<span class="val">${f.value}${f.tag ? `<em class="chip green">${icon('check', { size: 20, stroke: 3 })}${f.tag}</em>` : ''}</span>`}
            </div>
          </div>`).join('')}
      </div>
    </div>
    <div class="card trips-card">
      <div class="card-head slim"><div class="ai-badge">${icon('sparkles', { size: 26, stroke: 2.2 })}</div><div class="card-title">Tomáš’s trips</div><div class="chip purple">built by AI</div></div>
      <div class="trips">
        ${trips.map((t) => `<div class="trip"><div class="trip-i">${icon(t.kind, { size: 28, stroke: 2.2 })}</div><b>${t.route}</b><span>${t.date}</span><em class="mono">${fmtEur(t.amount)}</em><div class="trip-ok">${icon('check', { size: 20, stroke: 3.4 })}</div></div>`).join('')}
      </div>
      <div class="trips-total"><span>Total</span><b class="mono" id="trips-sum">€0.00</b></div>
    </div>`;

  // A highlight box around the route and around each detail on the ticket
  const ticket = $('.eticket', demo);
  const targets = [[$('.bp-route', ticket), 12, 6], ...$$('.bp-meta > div', ticket).map((n) => [n, 10, 9])];
  for (const [target, padX, padY] of targets) {
    const box = el('<div class="hl"></div>', ticket);
    box.style.left = target.offsetLeft - padX + 'px';
    box.style.top = target.offsetTop - padY + 'px';
    box.style.width = target.offsetWidth + padX * 2 + 'px';
    box.style.height = target.offsetHeight + padY * 2 + 'px';
  }
  ticket.appendChild($('.beam', ticket)); // the beam stays on top

  const pass = $('.ai-pass', demo);
  const card = $('.ai-card', demo);
  const tripsCard = $('.trips-card', demo);
  gsap.set(pass, { xPercent: -50, yPercent: -50, x: 400, y: -120, rotation: -9, scale: 1.3, opacity: 0 });
  tl.to(pass, { y: 168, rotation: -2, opacity: 1, duration: 0.75, ease: 'swift' }, t0 - 0.15);
  gsap.set(card, { y: 120, opacity: 0 });
  tl.to(card, { y: 0, opacity: 1, duration: 0.7, ease: 'swift' }, t0);

  // A beam of light reads the ticket from left to right
  const beam = $('.beam', demo);
  const scan0 = t0 + 0.55;
  const scanLen = 1.0;
  gsap.set(beam, { x: -170, opacity: 0 });
  tl.to(beam, { opacity: 1, duration: 0.12, ease: 'none' }, scan0);
  tl.to(beam, { x: 580, duration: scanLen, ease: 'sine.inOut' }, scan0);
  tl.to(beam, { opacity: 0, duration: 0.15, ease: 'none' }, scan0 + scanLen - 0.1);

  // What it finds lights up on the ticket and lands in the card
  const hls = $$('.hl', demo);
  const rows = $$('.field', demo);
  gsap.set(hls, { opacity: 0, scale: 0.92 });
  gsap.set($$('.val', demo), { opacity: 0, x: -18 });
  gsap.set($$('.field .chip', demo), { scale: 0, opacity: 0 });
  gsap.set($('.conv', demo), { opacity: 0, x: -14 });
  [0.34, 0.5, 0.62, 0.76].forEach((frac, i) => {
    const at = scan0 + scanLen * frac;
    tl.to(hls[i], { opacity: 1, scale: 1, duration: 0.3, ease: 'pop' }, at);
    tl.to($('.skel', rows[i]), { opacity: 0, duration: 0.15, ease: 'none' }, at + 0.14);
    tl.to($('.val', rows[i]), { opacity: 1, x: 0, duration: 0.4, ease: 'swift' }, at + 0.16);
    tl.fromTo(rows[i], { backgroundColor: 'rgba(168,85,247,0.16)' }, { backgroundColor: 'rgba(168,85,247,0)', duration: 0.7, ease: 'power1.out', immediateRender: false }, at + 0.14);
  });
  tl.to($('.field .chip', rows[2]), { scale: 1, opacity: 1, duration: 0.4, ease: 'pop' }, scan0 + scanLen * 0.62 + 0.5);

  // Czech koruna → euro at the official rate
  const conv = t0 + 2.0;
  tl.to($('.conv', demo), { opacity: 1, x: 0, duration: 0.4, ease: 'swift' }, conv);
  countTo($('#eur', demo), { from: 0, to: 49.12, duration: 0.6, at: conv + 0.05, ease: 'power3.out', format: fmtEur });
  tl.to($('.conv .chip', demo), { scale: 1, opacity: 1, duration: 0.4, ease: 'pop' }, conv + 0.5);

  // The fields become the first row of the participant's trips
  const swap = t0 + 2.85;
  tl.to(card, { opacity: 0, scale: 0.96, y: -24, duration: 0.28, ease: 'power2.in' }, swap);
  tl.to(hls, { opacity: 0, duration: 0.2, ease: 'none' }, swap);
  gsap.set(tripsCard, { opacity: 0, y: 46, scale: 0.97 });
  tl.to(tripsCard, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'swift' }, swap + 0.16);
  const tripRows = $$('.trip', demo);
  fadeUp(tripRows, swap + 0.28, { y: 20, duration: 0.42, stagger: 0.1 });
  const oks = $$('.trip-ok', demo);
  gsap.set(oks, { scale: 0 });
  tl.to(oks, { scale: 1, duration: 0.35, ease: 'pop', stagger: 0.1 }, swap + 0.5);
  countTo($('#trips-sum', demo), { from: 0, to: 125.82, duration: 0.75, at: swap + 0.4, ease: 'power2.out', format: fmtEur });
}

// ───────────────────────────── Step 4: review, approve, pay ─────────────────────────────
function demoReview(demo, t0) {
  const checks = ['Tickets match every trip', 'Names match the participant', 'Amounts within the country limit'];
  demo.innerHTML = `
    <div class="card rv-card">
      <div class="card-head slim"><div class="ai-badge">${icon('sparkles', { size: 26, stroke: 2.2 })}</div><div class="card-title">AI review · Tomáš Dvořák</div><div class="chip green solid" id="all-clear">${icon('check', { size: 22, stroke: 3.2 })}All clear</div></div>
      <div class="checks">${checks.map((c) => `<div class="check"><div class="check-i">${icon('check', { size: 24, stroke: 3.4 })}</div><span>${c}</span></div>`).join('')}</div>
      <div class="rv-foot">
        <div><label>To reimburse</label><b class="mono">€125.82</b></div>
        <div class="btn-stack"><div class="btn-grad big" id="approve-btn">Approve</div><div class="btn-grad big done" id="approved-btn">${icon('check', { size: 30, stroke: 3 })}Approved</div></div>
      </div>
    </div>
    <div class="card pay-card">
      <div class="card-head slim"><div class="card-title">Green Horizons</div><div class="chip gray">38 participants</div></div>
      <div class="rows tight">
        ${PEOPLE.map((p) => `
          <div class="row">
            ${avatar(p, 54)}
            <div class="row-main"><b>${p.name} <span class="flag">${p.flag}</span></b></div>
            <em class="mono amount">${fmtEur(p.amount)}</em>
            <div class="chip-stack"><span class="chip purple">Approved</span><span class="chip green solid paid">${icon('check', { size: 22, stroke: 3.2 })}Paid</span></div>
          </div>`).join('')}
      </div>
      <div class="pay-foot"><span>Reimbursed</span><b class="mono" id="pay-sum">€0.00</b></div>
    </div>
    <div class="cursor" id="cursor-review">${cursorSVG()}</div>`;

  const rv = $('.rv-card', demo);
  const pay = $('.pay-card', demo);
  gsap.set(rv, { x: 150, opacity: 0, rotation: 1.5 });
  tl.to(rv, { x: 0, opacity: 1, rotation: 0, duration: 0.75, ease: 'swift' }, t0 - 0.15);

  // The three checks tick one by one, then "All clear"
  const checkRows = $$('.check', demo);
  gsap.set(checkRows, { opacity: 0.32 });
  gsap.set($$('.check-i', demo), { scale: 0 });
  checkRows.forEach((row, i) => {
    const at = t0 + 0.45 + i * 0.26;
    tl.to(row, { opacity: 1, duration: 0.2, ease: 'none' }, at);
    tl.to($('.check-i', row), { scale: 1, duration: 0.4, ease: 'pop' }, at);
  });
  popIn($('#all-clear', demo), t0 + 1.28);

  // Approve
  const btn = $('#approve-btn', demo);
  const pos = centreIn(btn, demo);
  const cursor = $('#cursor-review', demo);
  gsap.set(cursor, { x: pos.x + 190, y: pos.y + 260, opacity: 0 });
  tl.to(cursor, { opacity: 1, duration: 0.15, ease: 'none' }, t0 + 1.25);
  tl.to(cursor, { x: pos.x + 30, y: pos.y + 14, duration: 0.55, ease: 'inout' }, t0 + 1.25);
  click(cursor, $('.btn-stack', demo), t0 + 1.85);
  const done = $('#approved-btn', demo);
  gsap.set(done, { opacity: 0 });
  tl.to(done, { opacity: 1, duration: 0.14, ease: 'none' }, t0 + 1.96);
  tl.to(cursor, { opacity: 0, duration: 0.25, ease: 'none' }, t0 + 2.2);

  // The project list: everyone gets paid
  const swap = t0 + 2.3;
  tl.to(rv, { opacity: 0, scale: 0.95, y: -30, duration: 0.28, ease: 'power2.in' }, swap);
  gsap.set(pay, { opacity: 0, y: 60, scale: 0.97 });
  tl.to(pay, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'swift' }, swap + 0.14);
  const rows = $$('.pay-card .row', demo);
  fadeUp(rows, swap + 0.22, { y: 20, duration: 0.4, stagger: 0.06 });
  const r = rng(404);
  rows.forEach((row, i) => {
    const at = swap + 0.72 + i * 0.15;
    const paid = $('.paid', row);
    gsap.set(paid, { scale: 0, opacity: 0 });
    tl.to(paid, { scale: 1, opacity: 1, duration: 0.42, ease: 'pop' }, at);
    tl.to($('.chip.purple', row), { opacity: 0, duration: 0.12, ease: 'none' }, at);
    // A little bird carries each payment off
    const from = centreIn($('.chip-stack', row), demo);
    const bird = el(`<svg class="paybird" width="64" height="64" viewBox="0 0 500 500"><defs><linearGradient id="pb${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a855f7"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs><g fill="url(#pb${i})"><path d="${polyPath(BIRD.wing)}"/><path d="${polyPath(BIRD.head)}"/><path d="${polyPath(BIRD.tail)}"/></g></svg>`, demo);
    gsap.set(bird, { xPercent: -50, yPercent: -50, x: from.x, y: from.y, scale: 0, opacity: 0 });
    tl.to(bird, { scale: 1, opacity: 1, duration: 0.2, ease: 'pop' }, at + 0.05);
    const dx = r.range(260, 420);
    const dy = r.range(-330, -190);
    tl.to(bird, { motionPath: { path: [{ x: from.x, y: from.y }, { x: from.x + dx * 0.55, y: from.y + dy * 0.2 - 40 }, { x: from.x + dx, y: from.y + dy }], curviness: 1.4 }, rotation: -24, duration: 0.95, ease: 'power1.in' }, at + 0.1);
    tl.to(bird, { opacity: 0, duration: 0.3, ease: 'none' }, at + 0.72);
  });
  countTo($('#pay-sum', demo), { from: 0, to: 9842.6, duration: 1.15, at: swap + 0.6, ease: 'power2.out', format: fmtEur });
}

// ───────────────────────────── The four steps on one stage ─────────────────────────────
export function buildSteps() {
  const scene = $('#s-steps');
  scene.innerHTML = `
    <div id="mark">${logoSVG({ size: 60 })}<span>EasyReimburse</span></div>
    ${STEPS.map((s, i) => `
      <div class="step-text" id="text-${s.key}">
        <div class="step-chip"><b>${i + 1}</b>${s.chip}</div>
        <h2 class="step-h display">${s.lines.map((l) => `<span class="line"><span class="in">${l}</span></span>`).join('')}</h2>
        <p class="step-sub">${s.sub}</p>
      </div>
      <div class="demo" id="demo-${s.key}"></div>`).join('')}
    <div id="rail">${STEPS.map((s) => `<div class="rail-item"><div class="rail-bar"><i></i></div><span>${s.chip}</span></div>`).join('')}</div>`;

  const starts = [T.invite, T.upload, T.ai, T.review, T.proof];
  show(scene, T.invite - 0.45);
  hide(scene, T.proof + 0.4);

  fadeUp('#mark', T.invite - 0.15, { y: -20, duration: 0.5 });
  fadeUp($$('.rail-item', scene), T.invite, { y: 16, duration: 0.5, stagger: 0.05 });

  const demos = [demoInvite, demoUpload, demoAi, demoReview];
  STEPS.forEach((s, i) => {
    const t0 = starts[i];
    const t1 = starts[i + 1];
    const text = $(`#text-${s.key}`);
    const demo = $(`#demo-${s.key}`);
    gsap.set([text, demo], { visibility: 'hidden' });
    show([text, demo], t0 - 0.2);
    hide([text, demo], t1 + 0.12);

    // Text in
    popIn($('.step-chip', text), t0 - 0.08, { from: 0.6, duration: 0.45 });
    riseLines(text, t0 - 0.02, { stagger: 0.07, duration: 0.7 });
    fadeUp($('.step-sub', text), t0 + 0.3, { y: 24, duration: 0.55 });
    // The rail fills while the step plays
    tl.fromTo($$('.rail-bar i', scene)[i], { scaleX: 0 }, { scaleX: 1, duration: t1 - t0, ease: 'none' }, t0);

    demos[i](demo, t0);

    // Out: make room for the next step
    const out = t1 - 0.3;
    tl.to([$('.step-chip', text), $('.step-h', text), $('.step-sub', text)], { opacity: 0, y: -30, duration: 0.24, ease: 'power2.in', stagger: 0.03 }, out);
    tl.to(demo, { opacity: 0, x: -90, scale: 0.96, duration: 0.28, ease: 'power2.in' }, out);
  });

  tl.to(['#mark', '#rail'], { opacity: 0, duration: 0.25, ease: 'none' }, T.proof - 0.3);
}

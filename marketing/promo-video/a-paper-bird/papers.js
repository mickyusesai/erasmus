/**
 * The paperwork: tickets, receipts, spreadsheets, sticky notes and emails that pile up
 * in the opening scene. All made up, drawn with HTML and CSS.
 */
import { icon, rng } from '/shared/kit.js';

/** Bars of a barcode as inline SVG */
function barcode(seed, w = 150, h = 54) {
  const r = rng(seed);
  let x = 0;
  let rects = '';
  while (x < w) {
    const bw = r.pick([2, 2, 3, 4, 6]);
    if (r() > 0.35) rects += `<rect x="${x}" y="0" width="${bw}" height="${h}"/>`;
    x += bw + r.pick([1, 2, 2, 3]);
  }
  return `<svg class="barcode" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="currentColor">${rects}</svg>`;
}

/** Something that looks like a QR code */
function qr(seed, size = 84, n = 11) {
  const r = rng(seed);
  const c = size / n;
  let rects = '';
  // Three corner squares (a ring with an empty middle), random cells elsewhere
  const finder = (x, y) => (x < 3 && y < 3) || (x >= n - 3 && y < 3) || (x < 3 && y >= n - 3);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const on = finder(x, y) ? !((x === 1 || x === n - 2) && (y === 1 || y === n - 2)) : r() > 0.52;
      if (on) rects += `<rect x="${(x * c).toFixed(2)}" y="${(y * c).toFixed(2)}" width="${(c + 0.3).toFixed(2)}" height="${(c + 0.3).toFixed(2)}"/>`;
    }
  }
  return `<svg class="qr" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="currentColor">${rects}</svg>`;
}

export function boardingPass({ from, to, fromCity, toCity, name, flight, date, seat, color = '#7c3aed', seed = 1 }) {
  return `<div class="paper bp" style="--c:${color}">
    <div class="bp-main">
      <div class="bp-top"><span>BOARDING PASS</span><span>${flight}</span></div>
      <div class="bp-route"><b>${from}</b><i></i>${icon('plane', { size: 30, stroke: 2.2 })}<i></i><b>${to}</b></div>
      <div class="bp-cities"><span>${fromCity}</span><span>${toCity}</span></div>
      <div class="bp-meta">
        <div><label>Passenger</label><span>${name}</span></div>
        <div><label>Date</label><span>${date}</span></div>
        <div><label>Seat</label><span>${seat}</span></div>
      </div>
    </div>
    <div class="bp-stub">${barcode(seed, 54, 130)}<span>${flight}</span></div>
  </div>`;
}

export function trainTicket({ from, to, when, price, color = '#f97316', seed = 2, cls = '2nd class' }) {
  return `<div class="paper tt" style="--c:${color}">
    <div class="tt-head"><span>${icon('train-front', { size: 22, stroke: 2.4 })} TRAIN TICKET</span><span>${cls}</span></div>
    <div class="tt-body">
      <div>
        <div class="tt-route"><b>${from}</b>${icon('arrow-right', { size: 26, stroke: 2.6 })}<b>${to}</b></div>
        <div class="tt-when">${when}</div>
        <div class="tt-price">${price}</div>
      </div>
      ${qr(seed, 96)}
    </div>
  </div>`;
}

export function busTicket({ from, to, when, price, color = '#10b981', seed = 3 }) {
  return `<div class="paper bus" style="--c:${color}">
    <div class="bus-left">${icon('bus-front', { size: 34, stroke: 2.2 })}<span>BUS</span></div>
    <div class="bus-main">
      <b>${from} → ${to}</b>
      <span>${when}</span>
      <em>${price}</em>
    </div>
    ${qr(seed, 78, 9)}
  </div>`;
}

export function receipt({ shop, lines, total, seed = 4 }) {
  return `<div class="paper rc">
    <div class="rc-shop">${shop}</div>
    <div class="rc-sub">* * * * * * * * *</div>
    ${lines.map(([a, b]) => `<div class="rc-line"><span>${a}</span><span>${b}</span></div>`).join('')}
    <div class="rc-rule"></div>
    <div class="rc-line rc-total"><span>TOTAL</span><span>${total}</span></div>
    <div class="rc-foot">${barcode(seed, 150, 34)}</div>
  </div>`;
}

export function spreadsheet({ title = 'reimbursements_FINAL_v7.xlsx', seed = 5 }) {
  const r = rng(seed);
  const cols = 6;
  const rows = 9;
  let cells = '';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const head = y === 0;
      const w = head ? 60 : r.int(25, 85);
      const tint = !head && r() > 0.86 ? r.pick(['red', 'yellow', 'red']) : '';
      cells += `<div class="xl-cell ${head ? 'xl-head' : ''} ${tint}"><i style="width:${w}%"></i></div>`;
    }
  }
  return `<div class="paper xl">
    <div class="xl-title">${icon('file-spreadsheet', { size: 26, stroke: 2.2 })}<span>${title}</span></div>
    <div class="xl-grid">${cells}</div>
  </div>`;
}

export function invoice({ no = 'INV-2026-0831', total = '6 200,46 Kč', seed = 6 }) {
  const r = rng(seed);
  const rows = Array.from({ length: 5 }, () => `<div class="inv-row"><i style="width:${r.int(40, 62)}%"></i><i style="width:${r.int(12, 20)}%"></i></div>`).join('');
  return `<div class="paper inv">
    <div class="inv-head"><div class="inv-logo"></div><div><b>INVOICE</b><span>${no}</span></div></div>
    <div class="inv-lines"><i style="width:62%"></i><i style="width:48%"></i><i style="width:55%"></i></div>
    <div class="inv-table">${rows}</div>
    <div class="inv-total"><span>Total</span><b>${total}</b></div>
  </div>`;
}

export function sticky({ text, color = '#fde68a', tilt = 0 }) {
  return `<div class="paper note" style="--c:${color}"><span style="transform:rotate(${tilt}deg)">${text}</span></div>`;
}

export function email({ from, subject, preview, color = '#a855f7' }) {
  return `<div class="paper mail">
    <div class="mail-av" style="background:${color}">${from[0]}</div>
    <div class="mail-body"><div class="mail-top"><b>${from}</b><span>09:4${from.length % 10}</span></div><div class="mail-subject">${subject}</div><div class="mail-preview">${preview}</div></div>
  </div>`;
}

/** The pile, bottom layer first. The last one is the ticket that becomes the bird. */
export function pileSpecs() {
  return [
    // Big sheets underneath
    { html: spreadsheet({ seed: 11 }), w: 600, h: 420 },
    { html: invoice({ seed: 12 }), w: 380, h: 500 },
    { html: spreadsheet({ title: 'participants (copy) (2).xlsx', seed: 13 }), w: 600, h: 420 },
    { html: invoice({ no: 'FV/08/2026/114', total: '911,85 lei', seed: 14 }), w: 380, h: 500 },
    { html: spreadsheet({ title: 'exchange rates.xlsx', seed: 15 }), w: 600, h: 420 },
    { html: invoice({ no: 'R-55-2026', total: '€255.56', seed: 16 }), w: 380, h: 500 },
    // Tickets
    { html: boardingPass({ from: 'LIS', to: 'RIX', fromCity: 'Lisbon', toCity: 'Riga', name: 'ALMEIDA / SOFIA', flight: 'ER 482', date: '23 AUG', seat: '14A', color: '#7c3aed', seed: 21 }), w: 560, h: 236 },
    { html: trainTicket({ from: 'Berlin Hbf', to: 'Warszawa', when: '22 AUG 2026 · 09:38', price: '189,00 zł', seed: 22 }), w: 480, h: 210 },
    { html: busTicket({ from: 'Rīga', to: 'Valmiera', when: '24.08.2026 · 17:26', price: '€7.70', seed: 23 }), w: 400, h: 150 },
    { html: receipt({ shop: 'CAFÉ CENTRAL', lines: [['2x Coffee', '5,60'], ['Sandwich', '6,90'], ['Water', '2,10'], ['Soup', '5,80']], total: '20,40 €', seed: 24 }), w: 250, h: 400 },
    { html: boardingPass({ from: 'PRG', to: 'RIX', fromCity: 'Prague', toCity: 'Riga', name: 'DVORAK / TOMAS', flight: 'ER 216', date: '23 AUG', seat: '22C', color: '#db2777', seed: 25 }), w: 560, h: 236 },
    { html: email({ from: 'Jakub', subject: 'Re: Re: Re: my tickets', preview: 'Sorry, here is the right PDF this time…', color: '#f472b6' }), w: 500, h: 150 },
    { html: trainTicket({ from: 'Milano C.le', to: 'Zürich HB', when: '21 AUG 2026 · 07:10', price: 'CHF 62.00', color: '#0ea5e9', seed: 26, cls: 'Standard' }), w: 480, h: 210 },
    { html: sticky({ text: 'IBAN<br>Jakub ?!', color: '#fde68a', tilt: -4 }), w: 220, h: 220 },
    { html: busTicket({ from: 'Vilnius', to: 'Rīga', when: '06.09.2026 · 08:00', price: '€31.00', color: '#8b5cf6', seed: 27 }), w: 400, h: 150 },
    { html: receipt({ shop: 'STATION KIOSK', lines: [['Tea', '2,50'], ['Bagel', '4,20'], ['Juice', '3,10']], total: '9,80 €', seed: 28 }), w: 250, h: 360 },
    { html: boardingPass({ from: 'ATH', to: 'RIX', fromCity: 'Athens', toCity: 'Riga', name: 'PAPPAS / NIKOS', flight: 'ER 731', date: '24 AUG', seat: '7F', color: '#0891b2', seed: 29 }), w: 560, h: 236 },
    { html: email({ from: 'Chiara', subject: 'Fwd: booking confirmation', preview: 'Is a screenshot okay? I can’t find the invoice.', color: '#8b5cf6' }), w: 500, h: 150 },
    { html: sticky({ text: 'which<br>exchange<br>rate??', color: '#fbcfe8', tilt: 3 }), w: 220, h: 220 },
    { html: trainTicket({ from: 'Kraków Gł.', to: 'Katowice', when: '19 SEP 2026 · 14:02', price: '27,00 zł', color: '#e11d48', seed: 30 }), w: 480, h: 210 },
    { html: busTicket({ from: 'Suwałki', to: 'Vilnius', when: '05.09.2026 · 12:40', price: '€22.00', color: '#f59e0b', seed: 31 }), w: 400, h: 150 },
    { html: receipt({ shop: 'MINI MARKET', lines: [['Bread', '1,90'], ['Cheese', '4,60'], ['Apples', '2,30'], ['Yoghurt', '1,80'], ['Bag', '0,30']], total: '10,90 €', seed: 32 }), w: 250, h: 430 },
    { html: boardingPass({ from: 'MAD', to: 'RIX', fromCity: 'Madrid', toCity: 'Riga', name: 'ROMERO / LUCIA', flight: 'ER 905', date: '23 AUG', seat: '31B', color: '#ea580c', seed: 33 }), w: 560, h: 236 },
    { html: email({ from: 'Elīna', subject: 'boarding pass??', preview: 'I think I deleted it… what now?', color: '#10b981' }), w: 500, h: 150 },
    { html: sticky({ text: 'DEADLINE<br>FRIDAY!', color: '#bbf7d0', tilt: -2 }), w: 220, h: 220 },
    { html: trainTicket({ from: 'Wien Hbf', to: 'Praha hl.n.', when: '22 AUG 2026 · 10:10', price: '€38.90', color: '#7c3aed', seed: 34 }), w: 480, h: 210 },
    { html: busTicket({ from: 'Tallinn', to: 'Rīga', when: '23.08.2026 · 09:30', price: '€19.00', color: '#ec4899', seed: 35 }), w: 400, h: 150 },
    { html: receipt({ shop: 'HOSTEL OLD TOWN', lines: [['1 night', '24,00'], ['City tax', '1,00']], total: '25,00 €', seed: 36 }), w: 250, h: 320 },
    { html: boardingPass({ from: 'DUB', to: 'RIX', fromCity: 'Dublin', toCity: 'Riga', name: 'BYRNE / AOIFE', flight: 'ER 118', date: '23 AUG', seat: '9D', color: '#059669', seed: 37 }), w: 560, h: 236 },
    { html: email({ from: 'Nikos', subject: 'Re: reimbursement form', preview: 'Which cell do I put the bus in?', color: '#0ea5e9' }), w: 500, h: 150 },
    { html: sticky({ text: 'ask for<br>boarding<br>pass', color: '#fde68a', tilt: 2 }), w: 220, h: 220 },
    { html: trainTicket({ from: 'Lisboa Ori.', to: 'Madrid Ch.', when: '21 AUG 2026 · 21:25', price: '€52.40', color: '#16a34a', seed: 38 }), w: 480, h: 210 },
    { html: busTicket({ from: 'Rīga', to: 'Valmiera', when: '24.08.2026 · 17:26', price: '€7.70', color: '#06b6d4', seed: 39 }), w: 400, h: 150 },
    { html: boardingPass({ from: 'BUD', to: 'RIX', fromCity: 'Budapest', toCity: 'Riga', name: 'NAGY / ANNA', flight: 'ER 342', date: '23 AUG', seat: '18E', color: '#9333ea', seed: 40 }), w: 560, h: 236 },
    { html: receipt({ shop: 'FUEL STOP 24', lines: [['Diesel 31,2 L', '49,61'], ['Coffee', '2,40']], total: '52,01 €', seed: 41 }), w: 250, h: 330 },
    { html: sticky({ text: 'who paid<br>this taxi?', color: '#fbcfe8', tilt: -3 }), w: 220, h: 220 },
    { html: email({ from: 'Jonas', subject: 'When do I get paid?', preview: 'Hi! Any news about the reimbursement?', color: '#f59e0b' }), w: 500, h: 150 },
    { html: trainTicket({ from: 'Paris Est', to: 'Berlin Hbf', when: '22 AUG 2026 · 06:55', price: '€74.90', color: '#2563eb', seed: 42 }), w: 480, h: 210 },
    { html: busTicket({ from: 'Warszawa', to: 'Rīga', when: '23.08.2026 · 22:15', price: '€29.00', color: '#84cc16', seed: 43 }), w: 400, h: 150 },
    { html: boardingPass({ from: 'ROM', to: 'RIX', fromCity: 'Rome', toCity: 'Riga', name: 'CONTI / CHIARA', flight: 'ER 660', date: '23 AUG', seat: '3A', color: '#be185d', seed: 44 }), w: 560, h: 236 },
    // The hero: lands last, in the middle, and becomes the bird
    { html: boardingPass({ from: 'RIX', to: 'LIS', fromCity: 'Riga', toCity: 'Lisbon', name: 'ALMEIDA / SOFIA', flight: 'ER 483', date: '03 SEP', seat: '12A', color: '#a855f7', seed: 45 }), w: 560, h: 236, hero: true },
  ];
}

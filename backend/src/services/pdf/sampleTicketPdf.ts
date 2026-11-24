/**
 * Sample tickets for the practice project: plain PDFs that look like the e-tickets and
 * boarding passes participants upload, from made-up companies ("Example Air"). Every one says
 * at the bottom that it is a sample and not a valid travel document.
 */
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

const BUNDLED_FONT_DIR = path.join(__dirname, 'fonts');
const SYSTEM_FONT_DIR = '/usr/share/fonts/truetype/liberation';
const FONT_DIR = fs.existsSync(path.join(BUNDLED_FONT_DIR, 'LiberationSans-Regular.ttf')) ? BUNDLED_FONT_DIR : SYSTEM_FONT_DIR;
const FONT_REGULAR = path.join(FONT_DIR, 'LiberationSans-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'LiberationSans-Bold.ttf');

export type SampleTicketKind = 'FLIGHT_TICKET' | 'BOARDING_PASS' | 'TRAIN_TICKET' | 'BUS_TICKET';

export interface SampleTicket {
  kind: SampleTicketKind;
  /** A made-up company, e.g. "Example Air" */
  carrier: string;
  passenger: string;
  from: string;
  /** Airport code, for flights */
  fromCode?: string;
  to: string;
  toCode?: string;
  /** Day of travel (UTC date) */
  date: Date;
  /** "HH:MM" */
  departureTime: string;
  arrivalTime: string;
  /** Flight, train or bus number */
  serviceNumber: string;
  bookingReference: string;
  seat?: string;
  /** What was paid, in euro (not printed on a boarding pass) */
  amountEur?: number;
  purchaseDate?: Date;
}

const LOOK: Record<SampleTicketKind, { title: string; colour: string; service: string }> = {
  FLIGHT_TICKET: { title: 'E-ticket and receipt', colour: '#3730a3', service: 'Flight' },
  BOARDING_PASS: { title: 'Boarding pass', colour: '#3730a3', service: 'Flight' },
  TRAIN_TICKET: { title: 'Train ticket', colour: '#047857', service: 'Train' },
  BUS_TICKET: { title: 'Bus ticket', colour: '#b45309', service: 'Bus' },
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Monday 2 November 2026": a date nobody (and no AI) can read the wrong way round */
export function longDate(date: Date): string {
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const euro = (amount: number) => `EUR ${amount.toFixed(2)}`;
const place = (name: string, code?: string) => (code ? `${name} (${code})` : name);

/** "HH:MM" some minutes earlier (boarding time) */
function minutesBefore(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (((h * 60 + m - minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** The same bars for the same text, so a ticket looks the same every time it is made */
function bars(seed: string, count: number): number[] {
  let state = 7;
  for (const ch of seed) state = (state * 31 + ch.charCodeAt(0)) % 2147483647;
  return Array.from({ length: count }, () => {
    state = (state * 48271) % 2147483647;
    return 1 + (state % 3);
  });
}

export function sampleTicketFilename(ticket: SampleTicket): string {
  const kind = { FLIGHT_TICKET: 'e-ticket', BOARDING_PASS: 'boarding-pass', TRAIN_TICKET: 'train-ticket', BUS_TICKET: 'bus-ticket' }[ticket.kind];
  const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${kind}-${slug(ticket.from)}-${slug(ticket.to)}.pdf`;
}

export function sampleTicketPdf(ticket: SampleTicket): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const look = LOOK[ticket.kind];
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: { Title: `${ticket.carrier} ${look.title.toLowerCase()} (sample)`, Author: 'EasyReimburse practice project' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('R', FONT_REGULAR);
    doc.registerFont('B', FONT_BOLD);

    const left = 48;
    const width = doc.page.width - 96;
    const grey = '#6b7280';
    const ink = '#111827';

    // Company and kind of document
    doc.rect(left, 48, width, 64).fill(look.colour);
    doc.fill('#ffffff').font('B').fontSize(22).text(ticket.carrier, left + 20, 68, { lineBreak: false });
    doc.font('R').fontSize(13).text(look.title, left, 73, { width: width - 20, align: 'right' });

    // The journey
    let y = 140;
    doc.fill(grey).font('R').fontSize(10).text(`${look.service} ${ticket.serviceNumber}`, left, y);
    y += 16;
    doc.fill(ink).font('B').fontSize(20).text(`${place(ticket.from, ticket.fromCode)}  →  ${place(ticket.to, ticket.toCode)}`, left, y, { width });
    y = doc.y + 6;
    doc.fill(ink).font('R').fontSize(12).text(longDate(ticket.date), left, y);
    y = doc.y + 18;

    const field = (label: string, value: string, x: number, top: number, w: number) => {
      doc.fill(grey).font('R').fontSize(9).text(label.toUpperCase(), x, top, { width: w, characterSpacing: 0.4 });
      doc.fill(ink).font('B').fontSize(12).text(value, x, top + 13, { width: w });
    };
    const row = (fields: [string, string][]) => {
      const w = width / fields.length;
      fields.forEach(([label, value], i) => field(label, value, left + i * w, y, w - 8));
      y += 44;
    };

    doc.moveTo(left, y - 8).lineTo(left + width, y - 8).lineWidth(0.5).stroke('#d1d5db');
    row([
      ['Passenger', ticket.passenger],
      ['Booking reference', ticket.bookingReference],
    ]);
    if (ticket.kind === 'BOARDING_PASS') {
      row([
        ['Boarding', minutesBefore(ticket.departureTime, 40)],
        ['Departure', ticket.departureTime],
        ['Arrival', ticket.arrivalTime],
      ]);
      row([
        ['Gate', `B${(ticket.serviceNumber.replace(/\D/g, '').length % 9) + 4}`],
        ['Seat', ticket.seat ?? '14C'],
        ['Class', 'Economy'],
      ]);
    } else {
      row([
        ['Departure', ticket.departureTime],
        ['Arrival', ticket.arrivalTime],
        [ticket.kind === 'FLIGHT_TICKET' ? 'Class' : 'Seat', ticket.kind === 'FLIGHT_TICKET' ? 'Economy' : ticket.seat ?? 'Free seating'],
      ]);
    }

    // What was paid
    if (ticket.amountEur !== undefined && ticket.kind !== 'BOARDING_PASS') {
      doc.moveTo(left, y - 8).lineTo(left + width, y - 8).lineWidth(0.5).stroke('#d1d5db');
      doc.fill(ink).font('B').fontSize(12).text('Receipt', left, y);
      y += 22;
      const line = (label: string, value: string, bold = false) => {
        doc.fill(ink).font(bold ? 'B' : 'R').fontSize(bold ? 12 : 11).text(label, left, y, { width: width - 140, lineBreak: false });
        doc.text(value, left, y, { width, align: 'right' });
        y += bold ? 22 : 18;
      };
      const fare = Math.round(ticket.amountEur * (ticket.kind === 'FLIGHT_TICKET' ? 0.74 : 0.9) * 100) / 100;
      line(ticket.kind === 'FLIGHT_TICKET' ? 'Fare, 1 adult' : 'Ticket, 1 adult', euro(fare));
      line(ticket.kind === 'FLIGHT_TICKET' ? 'Taxes and airport charges' : 'VAT', euro(Math.round((ticket.amountEur - fare) * 100) / 100));
      doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.5).stroke('#d1d5db');
      y += 8;
      line('Total paid', euro(ticket.amountEur), true);
      if (ticket.purchaseDate) {
        doc.fill(grey).font('R').fontSize(10).text(`Paid by card on ${longDate(ticket.purchaseDate)}. Number of passengers: 1.`, left, y);
        y = doc.y + 16;
      }
    }

    // A boarding pass has something to scan
    if (ticket.kind === 'BOARDING_PASS') {
      let x = left;
      bars(`${ticket.bookingReference}${ticket.serviceNumber}`, 70).forEach((w, i) => {
        if (i % 2 === 0) doc.rect(x, y, w * 1.4, 46).fill(ink);
        x += w * 1.4;
      });
      y += 62;
    }

    doc
      .fill(grey)
      .font('R')
      .fontSize(9)
      .text(
        `Sample ticket from the EasyReimburse practice project.\n${ticket.carrier} is a made-up company and this is not a valid travel document.`,
        left,
        doc.page.height - 96,
        { width, align: 'center' }
      );

    doc.end();
  });
}

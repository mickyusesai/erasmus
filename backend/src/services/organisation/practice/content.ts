/**
 * What is in the practice project: a made-up youth exchange in Porto with five made-up
 * participants, each in a different state, so an organiser can try every step without
 * consequences. All people, companies, bookings and bank details are invented; the email
 * addresses are on a domain that can never receive mail.
 *
 * Everything here is plain data worked out from today's date (the exchange always "ended a
 * good two weeks ago"), so it can be tested without a database.
 */
import type { SampleTicket } from '../../pdf/sampleTicketPdf.js';

export const PRACTICE_PROJECT = {
  name: 'Common Ground',
  description: 'A made-up youth exchange to practise with. The participants and their tickets are not real.',
  country: 'Portugal',
  venueAddress: 'Porto, Portugal',
} as const;

/**
 * Told to the AI wherever it looks at files from the practice project, so it treats the sample
 * tickets like real ones and doesn't report that they are samples.
 */
export const PRACTICE_AI_NOTE =
  'PRACTICE PROJECT: this participant is part of a practice project. The files are sample tickets made by EasyReimburse, from made-up companies ("Example Air", "Example Rail", "Example Bus"), and say so at the bottom. Read and judge them exactly like real tickets. Never mention or flag that they are samples or that a company is made up.';

/** Reserved for examples (RFC 2606): mail to it can never arrive, and we never send any */
export const PRACTICE_EMAIL_DOMAIN = 'example.org';

const DAY = 24 * 60 * 60 * 1000;
const utcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/** The exchange ran for a week and ended 16 days ago, so every step after it can be tried today */
export function practiceDates(today: Date = new Date()): { startDate: Date; endDate: Date } {
  const base = utcDay(today).getTime();
  return { startDate: new Date(base - 23 * DAY), endDate: new Date(base - 16 * DAY) };
}

/** What each made-up participant is there for */
export const PRACTICE_ROLES = ['APPROVE', 'QUESTION', 'GREEN', 'INVITED', 'YOU'] as const;
export type PracticeRole = (typeof PRACTICE_ROLES)[number];

export interface PracticeTrip {
  mode: 'PLANE' | 'TRAIN' | 'BUS';
  from: string;
  fromCode?: string;
  to: string;
  toCode?: string;
  /** Day of travel, counted from the first ('start') or last ('end') day of the exchange */
  day: { from: 'start' | 'end'; plus: number };
  departureTime: string;
  arrivalTime: string;
  carrier: string;
  serviceNumber: string;
  bookingReference: string;
  seat?: string;
  /** What the ticket says, in euro */
  ticketEur: number;
  /** What the participant claims when they changed the amount by hand */
  claimedEur?: number;
  /** Bought this many days before the exchange started */
  boughtDaysBefore: number;
}

export interface PracticeFinding {
  severity: 'critical' | 'important' | 'info';
  category: string;
  message: string;
  /** The trip the finding is about (index in trips), when it is about one */
  trip?: number;
}

export interface PracticePerson {
  role: PracticeRole;
  firstName: string;
  lastName: string;
  country: string;
  /** Days after the exchange ended that they handed in (null = not handed in) */
  submittedDaysAfterEnd: number | null;
  /** Days after the exchange ended that the invitation went out (null = not invited yet) */
  invitedDaysAfterEnd: number | null;
  bank?: { iban: string; bic: string; street: string; postalCode: string; city: string };
  note?: string;
  trips: PracticeTrip[];
  findings: PracticeFinding[];
}

/** Maximum travel amount per sending country, as in a grant agreement (EUR) */
export const PRACTICE_COUNTRY_LIMITS: { country: string; max: number; greenTravel: boolean }[] = [
  { country: 'Germany', max: 395, greenTravel: false },
  { country: 'Italy', max: 309, greenTravel: false },
  { country: 'Spain', max: 285, greenTravel: true },
  { country: 'Ireland', max: 309, greenTravel: false },
  { country: 'Belgium', max: 309, greenTravel: false },
];

const AIR = 'Example Air';
const RAIL = 'Example Rail';
const BUS = 'Example Bus';

export const PRACTICE_PEOPLE: PracticePerson[] = [
  {
    role: 'APPROVE',
    firstName: 'Jonas',
    lastName: 'Weber',
    country: 'Germany',
    submittedDaysAfterEnd: 2,
    invitedDaysAfterEnd: 0,
    // The example IBANs every bank's documentation uses: they add up, and belong to nobody
    bank: { iban: 'DE89370400440532013000', bic: 'EXMPDEFF', street: 'Musterstraße 12', postalCode: '10115', city: 'Berlin' },
    trips: [
      {
        mode: 'PLANE', from: 'Berlin', fromCode: 'BER', to: 'Porto', toCode: 'OPO', day: { from: 'start', plus: 0 },
        departureTime: '09:25', arrivalTime: '12:05', carrier: AIR, serviceNumber: 'EX 2041', bookingReference: 'K7QM2A', seat: '14C',
        ticketEur: 104.9, boughtDaysBefore: 41,
      },
      {
        mode: 'PLANE', from: 'Porto', fromCode: 'OPO', to: 'Berlin', toCode: 'BER', day: { from: 'end', plus: 0 },
        departureTime: '13:10', arrivalTime: '17:45', carrier: AIR, serviceNumber: 'EX 2042', bookingReference: 'P3XW8D', seat: '21A',
        ticketEur: 107.9, boughtDaysBefore: 41,
      },
    ],
    // What the AI check says when it finds nothing
    findings: [{ severity: 'info', category: 'All Clear', message: 'All clear! This participant has their travel docs in perfect order. Gold star!' }],
  },
  {
    role: 'QUESTION',
    firstName: 'Elena',
    lastName: 'Rossi',
    country: 'Italy',
    submittedDaysAfterEnd: 3,
    invitedDaysAfterEnd: 0,
    bank: { iban: 'IT60X0542811101000000123456', bic: 'EXMPITMM', street: 'Via Esempio 8', postalCode: '20121', city: 'Milano' },
    note: 'On the way to Porto I paid €30 at the airport for my bag. I added it to the price of the flight, but I lost the receipt.',
    trips: [
      {
        mode: 'PLANE', from: 'Milan', fromCode: 'MXP', to: 'Porto', toCode: 'OPO', day: { from: 'start', plus: 0 },
        departureTime: '10:40', arrivalTime: '12:35', carrier: AIR, serviceNumber: 'EX 3317', bookingReference: 'R4TN9C', seat: '9F',
        ticketEur: 96.4, claimedEur: 126.4, boughtDaysBefore: 35,
      },
      {
        mode: 'PLANE', from: 'Porto', fromCode: 'OPO', to: 'Milan', toCode: 'MXP', day: { from: 'end', plus: 0 },
        departureTime: '14:20', arrivalTime: '18:10', carrier: AIR, serviceNumber: 'EX 3318', bookingReference: 'V8KD2H', seat: '17B',
        ticketEur: 88.1, boughtDaysBefore: 35,
      },
    ],
    findings: [
      {
        severity: 'critical',
        category: 'Amount Changed',
        trip: 0,
        message:
          'Elena changed the amount of the flight Milan → Porto by hand, from €96.40 to €126.40. The ticket says €96.40. Her note explains the €30 as a bag fee paid at the airport, but there is no receipt for it. Ask her for the receipt, or reimburse the ticket price only.',
      },
      {
        severity: 'info',
        category: 'Participant Note',
        message:
          'Elena left a note: "On the way to Porto I paid €30 at the airport for my bag. I added it to the price of the flight, but I lost the receipt."',
      },
    ],
  },
  {
    role: 'GREEN',
    firstName: 'Marta',
    lastName: 'Ruiz',
    country: 'Spain',
    submittedDaysAfterEnd: 4,
    invitedDaysAfterEnd: 0,
    bank: { iban: 'ES9121000418450200051332', bic: 'EXMPESMM', street: 'Calle Ejemplo 5', postalCode: '28013', city: 'Madrid' },
    trips: [
      {
        mode: 'TRAIN', from: 'Madrid', to: 'Vigo', day: { from: 'start', plus: 0 },
        departureTime: '07:35', arrivalTime: '11:52', carrier: RAIL, serviceNumber: 'ER 4105', bookingReference: 'T5H2QK', seat: 'Coach 4, seat 11A',
        ticketEur: 48.9, boughtDaysBefore: 20,
      },
      {
        mode: 'BUS', from: 'Vigo', to: 'Porto', day: { from: 'start', plus: 0 },
        departureTime: '13:15', arrivalTime: '14:20', carrier: BUS, serviceNumber: 'EB 73', bookingReference: 'B9W4LM',
        ticketEur: 14, boughtDaysBefore: 20,
      },
      {
        mode: 'BUS', from: 'Porto', to: 'Vigo', day: { from: 'end', plus: 0 },
        departureTime: '10:30', arrivalTime: '13:35', carrier: BUS, serviceNumber: 'EB 74', bookingReference: 'B2C7NP',
        ticketEur: 14, boughtDaysBefore: 20,
      },
      {
        mode: 'TRAIN', from: 'Vigo', to: 'Madrid', day: { from: 'end', plus: 0 },
        departureTime: '15:05', arrivalTime: '19:24', carrier: RAIL, serviceNumber: 'ER 4128', bookingReference: 'T8J3RV', seat: 'Coach 2, seat 6D',
        ticketEur: 51.2, boughtDaysBefore: 20,
      },
    ],
    findings: [{ severity: 'info', category: 'All Clear', message: 'Spotless! Every document, route, and amount checks out. Enjoy the free time!' }],
  },
  {
    role: 'INVITED',
    firstName: 'Liam',
    lastName: 'Byrne',
    country: 'Ireland',
    submittedDaysAfterEnd: null,
    invitedDaysAfterEnd: 0,
    trips: [],
    findings: [],
  },
  {
    // The organiser plays this participant: the trips below are the sample tickets they get
    // to upload on the participant's page, where the AI then reads them for real
    role: 'YOU',
    firstName: 'Sam',
    lastName: 'Peeters',
    country: 'Belgium',
    submittedDaysAfterEnd: null,
    invitedDaysAfterEnd: null,
    bank: { iban: 'BE68539007547034', bic: 'EXMPBEBB', street: 'Voorbeeldstraat 21', postalCode: '1000', city: 'Brussels' },
    trips: [
      {
        mode: 'PLANE', from: 'Brussels', fromCode: 'BRU', to: 'Porto', toCode: 'OPO', day: { from: 'start', plus: 0 },
        departureTime: '08:50', arrivalTime: '10:40', carrier: AIR, serviceNumber: 'EX 5120', bookingReference: 'H6PZ3N', seat: '12D',
        ticketEur: 118.6, boughtDaysBefore: 30,
      },
      {
        mode: 'PLANE', from: 'Porto', fromCode: 'OPO', to: 'Brussels', toCode: 'BRU', day: { from: 'end', plus: 0 },
        departureTime: '15:30', arrivalTime: '19:15', carrier: AIR, serviceNumber: 'EX 5121', bookingReference: 'L2QF7T', seat: '18A',
        ticketEur: 109.3, boughtDaysBefore: 30,
      },
    ],
    findings: [],
  },
];

export function practiceEmail(person: Pick<PracticePerson, 'firstName' | 'lastName'>): string {
  return `${person.firstName}.${person.lastName}@${PRACTICE_EMAIL_DOMAIN}`.toLowerCase();
}

/** Which made-up participant an email address belongs to (null for anyone else) */
export function practiceRoleOf(email: string): PracticeRole | null {
  const address = email.trim().toLowerCase();
  return PRACTICE_PEOPLE.find((p) => practiceEmail(p) === address)?.role ?? null;
}

export function practicePerson(role: PracticeRole): PracticePerson {
  return PRACTICE_PEOPLE.find((p) => p.role === role)!;
}

export function tripDate(trip: PracticeTrip, dates: { startDate: Date; endDate: Date }): Date {
  return new Date((trip.day.from === 'start' ? dates.startDate : dates.endDate).getTime() + trip.day.plus * DAY);
}

export function tripPurchaseDate(trip: PracticeTrip, dates: { startDate: Date }): Date {
  return new Date(dates.startDate.getTime() - trip.boughtDaysBefore * DAY);
}

/** What the participant claims for a trip */
export const claimedEur = (trip: PracticeTrip) => trip.claimedEur ?? trip.ticketEur;

export type SampleFileKind = 'TICKET' | 'BOARDING_PASS';

/** The files that belong to a trip: its ticket, and for a flight the boarding pass */
export function sampleTicketsFor(
  person: Pick<PracticePerson, 'firstName' | 'lastName'>,
  trip: PracticeTrip,
  dates: { startDate: Date; endDate: Date }
): { file: SampleFileKind; ticket: SampleTicket }[] {
  const base = {
    carrier: trip.carrier,
    passenger: `${person.firstName} ${person.lastName}`,
    from: trip.from,
    fromCode: trip.fromCode,
    to: trip.to,
    toCode: trip.toCode,
    date: tripDate(trip, dates),
    departureTime: trip.departureTime,
    arrivalTime: trip.arrivalTime,
    serviceNumber: trip.serviceNumber,
    bookingReference: trip.bookingReference,
    seat: trip.seat,
  };
  const ticket: SampleTicket = {
    ...base,
    kind: trip.mode === 'PLANE' ? 'FLIGHT_TICKET' : trip.mode === 'TRAIN' ? 'TRAIN_TICKET' : 'BUS_TICKET',
    amountEur: trip.ticketEur,
    purchaseDate: tripPurchaseDate(trip, dates),
  };
  const files: { file: SampleFileKind; ticket: SampleTicket }[] = [{ file: 'TICKET', ticket }];
  if (trip.mode === 'PLANE') files.push({ file: 'BOARDING_PASS', ticket: { ...base, kind: 'BOARDING_PASS' } });
  return files;
}

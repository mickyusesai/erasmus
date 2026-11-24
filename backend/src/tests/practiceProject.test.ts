import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  PRACTICE_COUNTRY_LIMITS,
  PRACTICE_EMAIL_DOMAIN,
  PRACTICE_PEOPLE,
  PRACTICE_ROLES,
  claimedEur,
  practiceDates,
  practiceEmail,
  practicePerson,
  practiceRoleOf,
  sampleTicketsFor,
  tripDate,
} from '../services/organisation/practice/content.js';
import { practiceGuide, type PracticeParticipant } from '../services/organisation/practice/guide.js';
import { readOnboarding, withPracticeGuideClosed, withPracticeRestarted, withPracticeStepSeen } from '../services/organisation/onboarding.js';
import { sampleTicketFilename, sampleTicketPdf, longDate } from '../services/pdf/sampleTicketPdf.js';
import { canNeverReceiveMail } from '../services/email/reservedAddresses.js';
import { PreviewEmailService } from '../services/email/previewEmail.js';
import { bankAccountProblem } from '../utils/bankAccount.js';

const DAY = 24 * 60 * 60 * 1000;

describe('the made-up exchange', () => {
  it('ran for a week and ended a good two weeks ago, whatever day it is', () => {
    const { startDate, endDate } = practiceDates(new Date('2026-11-23T15:30:00Z'));
    expect(startDate.toISOString()).toBe('2026-10-31T00:00:00.000Z');
    expect(endDate.toISOString()).toBe('2026-11-07T00:00:00.000Z');
  });

  it('has one participant for each thing to try', () => {
    expect(PRACTICE_PEOPLE.map((p) => p.role).sort()).toEqual([...PRACTICE_ROLES].sort());
  });

  it('gives every participant an address that can never receive mail', () => {
    const emails = PRACTICE_PEOPLE.map(practiceEmail);
    expect(new Set(emails).size).toBe(emails.length);
    for (const email of emails) {
      expect(email.endsWith(`@${PRACTICE_EMAIL_DOMAIN}`)).toBe(true);
      expect(canNeverReceiveMail(email)).toBe(true);
    }
  });

  it('knows its participants by their address, and nobody else', () => {
    expect(practiceRoleOf('Jonas.Weber@example.org')).toBe('APPROVE');
    expect(practiceRoleOf(' elena.rossi@example.org ')).toBe('QUESTION');
    expect(practiceRoleOf('sam.peeters@example.org')).toBe('YOU');
    expect(practiceRoleOf('jonas.weber@gmail.com')).toBeNull();
  });

  it('has a maximum for every sending country, and nobody claims more than it', () => {
    for (const person of PRACTICE_PEOPLE) {
      const limit = PRACTICE_COUNTRY_LIMITS.find((l) => l.country === person.country);
      expect(limit, person.country).toBeDefined();
      const total = person.trips.reduce((sum, trip) => sum + claimedEur(trip), 0);
      expect(total).toBeLessThanOrEqual(limit!.max);
    }
  });

  it('uses bank accounts that add up (the examples from bank documentation)', () => {
    for (const person of PRACTICE_PEOPLE.filter((p) => p.bank)) {
      expect(bankAccountProblem(person.bank!.iban), person.firstName).toBeNull();
    }
  });

  it('has three who handed in, one who was invited and has not started, and the one the organiser plays', () => {
    const handedIn = PRACTICE_PEOPLE.filter((p) => p.submittedDaysAfterEnd !== null);
    expect(handedIn.map((p) => p.role)).toEqual(['APPROVE', 'QUESTION', 'GREEN']);
    for (const person of handedIn) {
      expect(person.bank).toBeDefined();
      expect(person.trips.length).toBeGreaterThan(0);
    }
    expect(practicePerson('INVITED')).toMatchObject({ trips: [], invitedDaysAfterEnd: 0 });
    expect(practicePerson('YOU')).toMatchObject({ submittedDaysAfterEnd: null, invitedDaysAfterEnd: null });
    expect(practicePerson('YOU').trips.length).toBe(2);
  });

  it('gives Elena one thing to check: an amount she changed by hand, on the right trip', () => {
    const elena = practicePerson('QUESTION');
    const changed = elena.trips.filter((t) => t.claimedEur !== undefined);
    expect(changed).toHaveLength(1);
    const finding = elena.findings.find((f) => f.category === 'Amount Changed')!;
    expect(elena.trips[finding.trip!]).toBe(changed[0]);
    expect(finding.message).toContain('€96.40');
    expect(finding.message).toContain('€126.40');
    // The other two are all clear, in the words the AI check uses when it finds nothing
    expect(practicePerson('APPROVE').findings.map((f) => f.category)).toEqual(['All Clear']);
    expect(practicePerson('GREEN').findings.map((f) => f.category)).toEqual(['All Clear']);
  });

  it('only the green traveller comes from a green-travel country, and goes by train and bus', () => {
    const green = PRACTICE_COUNTRY_LIMITS.filter((l) => l.greenTravel).map((l) => l.country);
    expect(green).toEqual([practicePerson('GREEN').country]);
    expect(practicePerson('GREEN').trips.every((t) => t.mode !== 'PLANE')).toBe(true);
  });

  it('lets everybody travel out on the first day and home on the last', () => {
    const dates = practiceDates(new Date('2026-11-23T00:00:00Z'));
    for (const person of PRACTICE_PEOPLE) {
      for (const trip of person.trips) {
        const day = tripDate(trip, dates).getTime();
        expect(day === dates.startDate.getTime() || day === dates.endDate.getTime()).toBe(true);
      }
    }
  });
});

describe('the sample tickets', () => {
  const dates = practiceDates(new Date('2026-11-23T00:00:00Z'));

  it('a flight comes with its ticket and its boarding pass, a train or bus with its ticket', () => {
    const jonas = practicePerson('APPROVE');
    expect(sampleTicketsFor(jonas, jonas.trips[0], dates).map((f) => f.ticket.kind)).toEqual(['FLIGHT_TICKET', 'BOARDING_PASS']);
    const marta = practicePerson('GREEN');
    expect(sampleTicketsFor(marta, marta.trips[0], dates).map((f) => f.ticket.kind)).toEqual(['TRAIN_TICKET']);
    expect(sampleTicketsFor(marta, marta.trips[1], dates).map((f) => f.ticket.kind)).toEqual(['BUS_TICKET']);
  });

  it('the price is on the ticket, not on the boarding pass', () => {
    const jonas = practicePerson('APPROVE');
    const [ticket, boardingPass] = sampleTicketsFor(jonas, jonas.trips[0], dates);
    expect(ticket.ticket).toMatchObject({ passenger: 'Jonas Weber', amountEur: 104.9, from: 'Berlin', to: 'Porto' });
    expect(ticket.ticket.purchaseDate!.getTime()).toBe(dates.startDate.getTime() - 41 * DAY);
    expect(boardingPass.ticket.amountEur).toBeUndefined();
  });

  it('are made out to the name the participant has now', () => {
    const you = practicePerson('YOU');
    const [ticket] = sampleTicketsFor({ firstName: 'Robin', lastName: 'Example' }, you.trips[0], dates);
    expect(ticket.ticket.passenger).toBe('Robin Example');
  });

  it('are real one-page PDFs with a readable name', async () => {
    const jonas = practicePerson('APPROVE');
    for (const { ticket } of sampleTicketsFor(jonas, jonas.trips[0], dates)) {
      const buffer = await sampleTicketPdf(ticket);
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
      const pdf = await PDFDocument.load(buffer);
      expect(pdf.getPageCount()).toBe(1);
      expect(pdf.getTitle()).toContain('(sample)');
    }
    expect(sampleTicketFilename(sampleTicketsFor(jonas, jonas.trips[0], dates)[1].ticket)).toBe('boarding-pass-berlin-porto.pdf');
  });

  it('write dates that cannot be read the wrong way round', () => {
    expect(longDate(new Date('2026-11-02T00:00:00Z'))).toBe('Monday 2 November 2026');
  });
});

describe('the guide through the practice project', () => {
  const person = (email: string, over: Partial<PracticeParticipant> = {}): PracticeParticipant => ({
    id: email.split('.')[0],
    email,
    firstName: email.split('.')[0],
    status: 'PARTICIPANT_COMPLETE',
    reopenedAt: null,
    magicLinkToken: `token-${email.split('.')[0]}`,
    ...over,
  });
  const everyone = (over: Record<string, Partial<PracticeParticipant>> = {}) => [
    person('jonas.weber@example.org', over.jonas),
    person('elena.rossi@example.org', over.elena),
    person('marta.ruiz@example.org', over.marta),
    person('liam.byrne@example.org', { status: 'DRAFT', ...over.liam }),
    person('sam.peeters@example.org', { status: 'DRAFT', ...over.sam }),
  ];
  const done = (guide: ReturnType<typeof practiceGuide>) => guide.steps.filter((s) => s.done).map((s) => s.id);

  it('starts with looking around', () => {
    const guide = practiceGuide('p1', everyone(), undefined);
    expect(guide.steps.map((s) => s.id)).toEqual(['MEET', 'APPROVE', 'QUESTION', 'PARTICIPANT', 'AUDIT']);
    expect(done(guide)).toEqual([]);
    expect(guide).toMatchObject({ projectId: 'p1', next: 'MEET', complete: false, closed: false });
    expect(guide.you).toEqual({ participantId: 'sam', firstName: 'sam', token: 'token-sam' });
  });

  it('reads from the practice project what was done there', () => {
    const guide = practiceGuide(
      'p1',
      everyone({ jonas: { status: 'ADMIN_APPROVED' }, elena: { status: 'DRAFT', reopenedAt: new Date() }, sam: { status: 'PARTICIPANT_COMPLETE' } }),
      { seen: ['MEET'] }
    );
    expect(done(guide)).toEqual(['MEET', 'APPROVE', 'QUESTION', 'PARTICIPANT']);
    expect(guide.next).toBe('AUDIT');
    expect(guide.steps.find((s) => s.id === 'AUDIT')).toMatchObject({ participantId: 'jonas', possible: true });
  });

  it('a paid Jonas is an approved Jonas', () => {
    expect(done(practiceGuide('p1', everyone({ jonas: { status: 'PAID' } }), undefined))).toEqual(['APPROVE']);
  });

  it('is complete once all five are done', () => {
    const guide = practiceGuide(
      'p1',
      everyone({ jonas: { status: 'PAID' }, elena: { reopenedAt: new Date() }, sam: { status: 'ADMIN_APPROVED' } }),
      { seen: ['MEET', 'AUDIT'] }
    );
    expect(guide).toMatchObject({ complete: true, next: null });
  });

  it('skips a step whose participant was deleted, and says it cannot be done', () => {
    const guide = practiceGuide('p1', everyone().filter((p) => !p.email.startsWith('jonas')), { seen: ['MEET'] });
    expect(guide.steps.find((s) => s.id === 'APPROVE')).toMatchObject({ done: false, possible: false, participantId: null });
    expect(guide.next).toBe('QUESTION');
    expect(guide.complete).toBe(false);
  });

  it('points the audit file at whoever is approved when Jonas is not', () => {
    const guide = practiceGuide('p1', everyone({ marta: { status: 'ADMIN_APPROVED' } }), undefined);
    expect(guide.steps.find((s) => s.id === 'AUDIT')).toMatchObject({ participantId: 'marta' });
  });

  it('knows when it was put away', () => {
    expect(practiceGuide('p1', everyone(), { closedAt: '2026-11-23T10:00:00.000Z' }).closed).toBe(true);
  });
});

describe('what is remembered of the practice guide', () => {
  it('keeps the steps that leave no trace, each once and in order', () => {
    let state = withPracticeStepSeen({}, 'AUDIT');
    state = withPracticeStepSeen(state, 'MEET');
    state = withPracticeStepSeen(state, 'MEET');
    expect(state.practice).toEqual({ seen: ['MEET', 'AUDIT'] });
  });

  it('puts the guide away and takes it out again, without losing the steps or the welcome', () => {
    const start = { welcomeSeenAt: '2026-11-23T09:00:00.000Z', practice: { seen: ['MEET' as const] } };
    const closed = withPracticeGuideClosed(start, true, new Date('2026-11-23T10:00:00Z'));
    expect(closed).toEqual({ welcomeSeenAt: start.welcomeSeenAt, practice: { seen: ['MEET'], closedAt: '2026-11-23T10:00:00.000Z' } });
    expect(withPracticeGuideClosed(closed, false)).toEqual(start);
  });

  it('starts again when the practice starts again, and still knows the welcome was seen', () => {
    expect(withPracticeRestarted({ welcomeSeenAt: '2026-11-23T09:00:00.000Z', practice: { seen: ['MEET', 'AUDIT'], closedAt: '2026-11-23T10:00:00.000Z' } })).toEqual({
      welcomeSeenAt: '2026-11-23T09:00:00.000Z',
    });
  });

  it('reads only what it knows from the stored value', () => {
    expect(readOnboarding({ practice: { seen: ['MEET', 'SOMETHING', 'AUDIT'], closedAt: 'not a date' } })).toEqual({ practice: { seen: ['MEET', 'AUDIT'] } });
    expect(readOnboarding({ practice: 'yes' })).toEqual({});
    expect(readOnboarding({ practice: { seen: [] } })).toEqual({});
    expect(readOnboarding({ welcomeSeenAt: '2026-11-23T09:00:00.000Z', practice: { closedAt: '2026-11-23T10:00:00.000Z' } })).toEqual({
      welcomeSeenAt: '2026-11-23T09:00:00.000Z',
      practice: { closedAt: '2026-11-23T10:00:00.000Z' },
    });
  });
});

describe('emails to example addresses', () => {
  it('are never sent: the addresses set aside for examples and tests', () => {
    for (const address of ['jonas.weber@example.org', 'A@EXAMPLE.COM', 'x@mail.example.net', 'x@practice.example', 'x@something.test', 'x@nowhere.invalid']) {
      expect(canNeverReceiveMail(address), address).toBe(true);
    }
  });

  it('real addresses are not held back', () => {
    for (const address of ['marija@kalm.lt', 'someone@gmail.com', 'info@example.de', 'x@myexample.org', 'x@contest.com', 'not-an-address']) {
      expect(canNeverReceiveMail(address), address).toBe(false);
    }
  });

  it('in the practice project an email is written and kept, not sent', async () => {
    const mail = new PreviewEmailService();
    const result = await mail.sendMagicLink('liam.byrne@example.org', 'Liam', 'Common Ground', 'https://app.example/reimbursement?token=abc', {
      organisationName: 'Youth Bridge',
      replyTo: 'hello@youthbridge.example',
    });
    expect(result).toEqual({ success: true, messageId: 'preview-only' });
    expect(mail.written).toHaveLength(1);
    expect(mail.written[0]).toMatchObject({ to: 'liam.byrne@example.org', fromName: 'Youth Bridge via EasyReimburse' });
    expect(mail.written[0].subject).toContain('Common Ground');
    expect(mail.written[0].html).toContain('https://app.example/reimbursement?token=abc');
  });
});

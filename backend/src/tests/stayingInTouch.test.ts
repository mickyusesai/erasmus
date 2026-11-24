import { describe, it, expect } from 'vitest';
import {
  onboardingReminderHtml,
  onboardingReminderSubject,
  onboardingReminderText,
  welcomeHtml,
  welcomeSubject,
  welcomeText,
} from '../services/email/templates.js';
import { REMINDER_SINCE, reminderAge, reminderWords, type ReminderCandidate } from '../services/organisation/onboardingReminder.js';
import { gettingStarted, type ProjectProgress } from '../services/organisation/onboarding.js';
import { progressStage } from '../services/organisation/progress.js';

const DAY = 24 * 60 * 60 * 1000;

describe('the welcome email', () => {
  const details = { organisationName: 'Youth Bridge', firstName: 'Marija', loginUrl: 'https://app.example/org/dashboard' };

  it('greets the person who signed up by their first name', () => {
    expect(welcomeSubject('Marija')).toBe('Welcome to EasyReimburse, Marija');
    expect(welcomeText(details)).toMatch(/^Hi Marija,/);
    expect(welcomeHtml(details)).toContain('Hi Marija,');
  });

  it('works without a first name', () => {
    expect(welcomeSubject(null)).toBe('Welcome to EasyReimburse');
    expect(welcomeText({ ...details, firstName: '  ' })).toMatch(/^Hi,/);
  });

  it('has one button, points at the practice project and the free first project', () => {
    const html = welcomeHtml(details);
    expect(html.match(/<a href="https:\/\/app\.example\/org\/dashboard"/g)).toHaveLength(1);
    expect(html).toContain('practice project');
    expect(html).toContain('free for up to 10 participants');
    expect(welcomeText(details)).toContain('Open EasyReimburse: https://app.example/org/dashboard');
  });

  it('invites a reply instead of forbidding it', () => {
    expect(welcomeHtml(details)).toContain('You can reply to this email');
    expect(welcomeHtml(details)).not.toContain('do not reply');
    expect(welcomeText(details)).toContain('Just reply to this email');
  });

  it('shows a name as text, whatever is in it', () => {
    const html = welcomeHtml({ ...details, organisationName: 'Bridge <b>&</b> Co', firstName: '<i>Ann</i>' });
    expect(html).toContain('Bridge &lt;b&gt;&amp;&lt;/b&gt; Co');
    expect(html).toContain('&lt;i&gt;Ann&lt;/i&gt;');
  });
});

describe('the one reminder', () => {
  const org = (over: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
    createdAt: new Date(REMINDER_SINCE.getTime() + DAY),
    onboardingReminderSentAt: null,
    isTestAccount: false,
    isActive: true,
    ...over,
  });
  const after = (days: number) => new Date(REMINDER_SINCE.getTime() + DAY + days * DAY);

  it('is due three days after signing up, not before', () => {
    expect(reminderAge(org(), after(2.9))).toBe(false);
    expect(reminderAge(org(), after(3))).toBe(true);
    expect(reminderAge(org(), after(10))).toBe(true);
  });

  it('is not sent any more after two weeks: by then it is no reminder', () => {
    expect(reminderAge(org(), after(14))).toBe(false);
  });

  it('is sent once', () => {
    expect(reminderAge(org({ onboardingReminderSentAt: after(3) }), after(5))).toBe(false);
  });

  it('never goes to organisations from before it existed, the test account or a closed account', () => {
    expect(reminderAge(org({ createdAt: new Date(REMINDER_SINCE.getTime() - DAY) }), new Date(REMINDER_SINCE.getTime() + 3 * DAY))).toBe(false);
    expect(reminderAge(org({ isTestAccount: true }), after(4))).toBe(false);
    expect(reminderAge(org({ isActive: false }), after(4))).toBe(false);
  });

  const project = (over: Partial<ProjectProgress> = {}): ProjectProgress => ({
    id: 'p1',
    name: 'Bridges',
    country: 'Italy',
    isTestProject: true,
    createdAt: new Date('2026-11-25T10:00:00Z'),
    participants: [],
    limits: [],
    ...over,
  });

  it('says where the organisation is', () => {
    expect(reminderWords(gettingStarted([]), null)!.where).toContain('You have not set up a project yet');
    expect(reminderWords(gettingStarted([project()]), 'Bridges')).toMatchObject({ button: 'Add the participants' });
    expect(reminderWords(gettingStarted([project()]), 'Bridges')!.where).toContain('"Bridges" is waiting for its participants');
    const withPeople = project({ participants: [{ country: 'Italy', invited: false }] });
    expect(reminderWords(gettingStarted([withPeople]), 'Bridges')).toMatchObject({ button: 'Set the amounts' });
    expect(reminderWords(gettingStarted([project({ ...withPeople, limits: [{ country: 'Italy', max: 275 }] })]), 'Bridges')).toMatchObject({ button: 'Send the invitations' });
  });

  it('is not needed once somebody was invited, or the invitations are planned', () => {
    const invited = project({ participants: [{ country: 'Italy', invited: true }], limits: [{ country: 'Italy', max: 275 }] });
    expect(reminderWords(gettingStarted([invited]), 'Bridges')).toBeNull();
    const planned = project({ participants: [{ country: 'Italy', invited: false }], limits: [{ country: 'Italy', max: 275 }], invitationsPlanned: true });
    expect(reminderWords(gettingStarted([planned]), 'Bridges')).toBeNull();
  });

  it('reads as a note from a person, with one button and the promise that it is the only one', () => {
    const details = { organisationName: 'Youth Bridge', firstName: 'Marija', loginUrl: 'https://app.example/org/dashboard', where: 'Your project "Bridges" is ready.', button: 'Send the invitations' };
    expect(onboardingReminderSubject('Marija')).toBe('Marija, shall I help you get started?');
    expect(onboardingReminderSubject(null)).toBe('Shall I help you get started with EasyReimburse?');
    const text = onboardingReminderText(details);
    expect(text).toContain('Hi Marija,');
    expect(text).toContain('Your project "Bridges" is ready.');
    expect(text).toContain('Send the invitations: https://app.example/org/dashboard');
    expect(text).toContain('This is the only reminder you will get.');
    const html = onboardingReminderHtml(details);
    expect(html.match(/<a href="https:\/\/app\.example\/org\/dashboard"/g)).toHaveLength(1);
    expect(html).toContain('Your project &quot;Bridges&quot; is ready.');
    expect(html).not.toContain('do not reply');
  });
});

describe('how far an organisation has come', () => {
  it('is the furthest point it reached with its own projects', () => {
    expect(progressStage({ projects: 0, participants: 0, invited: 0, submitted: 0 })).toBe('SIGNED_UP');
    expect(progressStage({ projects: 1, participants: 0, invited: 0, submitted: 0 })).toBe('PROJECT');
    expect(progressStage({ projects: 1, participants: 8, invited: 0, submitted: 0 })).toBe('PARTICIPANTS');
    expect(progressStage({ projects: 1, participants: 8, invited: 8, submitted: 0 })).toBe('INVITED');
    expect(progressStage({ projects: 2, participants: 30, invited: 30, submitted: 4 })).toBe('SUBMISSION');
  });
});

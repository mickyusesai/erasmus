# EasyReimburse Onboarding Plan

Status: **proposal, waiting for seven decisions** (18 November 2026). Nothing of the new onboarding is
built yet. The onboarding test account (see the end) is built.

Goal: a new organisation sees a finished reimbursement within two minutes, tries both sides with
sample tickets, and sets up its own project in four short steps.

---

## What a new organisation meets today

Found by signing up as a new organisation and clicking through, in the order the screens come.

1. **Five slides of text.** `OnboardingWizard.tsx` explains the product in words over a dimmed
   dashboard. One slide says you can create a free test project; it is created at sign-up and
   cannot be created by hand.
2. **Dead end: the intro ends at a locked form.** The last button, "Create my first project", opens
   `/org/projects/new`, where every field is disabled and a notice says to purchase credits.
3. **The dashboard opens with a warning and prices.** "No Credits Available", a disabled New Project
   button, "Welcome back!" on the first visit. The free project is at the bottom, named
   "Test Project" in the country "Test".
4. **Dead end: the first invitation is refused.** Send Link opens "Reimbursement Not Configured" and
   points to the Settings tab; the only button is Close.
5. **Dead end: the AI never runs in the free project.** Trip building is locked until the project
   end date (`aiAnalysisUnlocked`), and the test project ends one year after sign-up. A trial user
   never sees tickets become trips unless they find "Open AI analysis early" in Settings.
6. **Every setting at once.** The Settings tab shows six blocks with about twenty settings.

Also:

- `GET /api/organisation/projects/:id` does not return `isTestProject` or `maxParticipants`, so the
  test project's banner (free, 10 participants, Upgrade) and the "Upgrade to Full Project" block
  never show.
- Trying the participant side needs real tickets and inviting yourself by email.
- "Intro seen" lives in the browser (`localStorage` key `org-onboarding-<orgId>`): it returns on
  another computer and cannot be replayed.
- There is no help entry after the intro.
- The welcome email lists the same steps and leads into the same dead ends.

---

## The idea: see it, try it, set up yours

| When | What the new user does |
| --- | --- |
| Minute 0 to 2 | **See it.** A practice project is waiting with four made-up participants; one is ready to approve. |
| Minute 2 to 6 | **Try it.** Approve one, send one back with a question, play a participant with sample tickets (the AI runs for real). |
| Minute 6 to 10 | **Set up yours.** Four short steps: project, participants, amounts, invitations. |

Rules: show the result first; one next step at a time; no screen without a way forward; rules
(green travel, declarations, exchange rates) get defaults and stay folded away; the guide can be
skipped and replayed at any time.

## What gets built

1. **Welcome screen** instead of the five slides: "See how it works (2 minutes)" or "Set up my own
   project", plus the 35-second film and "I'll look around on my own".
2. **Practice project** ("Common Ground", youth exchange in Porto, clearly marked as sample data):
   - Jonas Weber (Germany): submitted, AI review all clear, ready to approve.
   - Elena Rossi (Italy): submitted, one thing to check.
   - Marta Kowalska (Poland): green travel by train, ready to approve.
   - Liam Byrne (Ireland): invited, not started.
   - "You": play a participant with four sample tickets.
   The four participants are prepared rows and sample files (no AI cost). Emails to them are shown,
   not sent. "Start the practice again" resets it. It is not counted as a project and uses no credit.
   People, organisations and tickets are made up; no real airline or rail brands.
3. **Guide**: five steps (meet the practice project, approve Jonas, send Elena a question, be a
   participant yourself, download the audit file), with a spotlight on the real button of each step.
   Progress is stored per organisation on the server.
4. **Dashboard for new organisations**: greeting, one "next step" card with the progress, the
   projects. The credit warning and price cards move to Billing and appear only when a credit is needed.
5. **Real project setup in four steps**: project (name, country, place, dates), participants (paste a
   list, CSV, by hand, or later), one maximum amount per sending country, invitations (now, on a date,
   or later). Project settings split into basics and folded rules that show their current choice.
6. **Help button** in the header: replay the tour, the film, short "How do I…" answers, write to Micky.
7. **Emails**: a new welcome email with one button, and a reminder after three days if nothing
   happened. Sign-up asks for a first name.
8. **Super-admin**: per organisation, how far they got (signed up, toured, own project, invited,
   first submission, first purchase).

## Decisions (recommendation first)

1. What a new organisation tries with: **A** a ready-made practice project, or B keep the empty test
   project and only fix the dead ends.
2. What is free for real use: **A** the first real project is free up to 10 participants (the
   website's promise), or B only the practice project is free.
3. The guide: **A** step list plus spotlight on the real buttons, or B step list only.
4. The 35-second film inside the app: **A** yes (welcome screen and Help), or B no.
5. One optional question at the start ("When is your next project?"): **A** yes, or B no.
6. Personal help: **A** "Write to Micky" (replies to Micky's inbox), B that plus a link to book a
   15-minute call, or C only the guide.
7. Emails: **A** welcome plus one reminder after 3 days, B welcome plus reminders after 3 and 10
   days, or C welcome only.

## Build order

Each part is usable on its own and is checked in the onboarding test account before the next starts.

- **Part 1, no more dead ends**: welcome screen; next-step card on the dashboard; Send Link offers
  "Set the amounts now"; the free project lets the AI run; the test project's banner and Upgrade
  button come back; onboarding progress stored per organisation.
- **Part 2, the practice project**: the sample project, participants and tickets; the five-step
  guide; "be a participant yourself"; emails shown and not sent; start the practice again.
- **Part 3, the real project in four steps**: the setup, pasting a participant list, settings split
  into basics and folded rules.
- **Part 4, staying in touch**: Help button; welcome email and reminder; progress per organisation
  in super-admin.

What stays as it is: the participant pages, the prices, the rules of real projects. Existing
organisations keep their Test Project and get the Help button.

---

## The onboarding test account (built)

Super-admin → **Test account** → **Open as a brand-new organisation** opens the app in a new tab as
an organisation that signed up this second. Inside it, the **Test account** button in the
bottom-left corner starts over without going back to super-admin.

- Every start deletes the previous test account (projects, participants, stored files) and creates a
  fresh one with `createOrganisationWithTestProject` (`backend/src/services/organisation/signup.ts`),
  the same code sign-up uses. Whatever sign-up creates in future, the test account gets too.
- It can start with no credits (like a real new organisation) or with one project credit, and can
  send the welcome email. "Continue where it is" signs in without starting over.
- Only organisations marked `Organisation.isTestAccount` can be deleted this way
  (`backend/src/services/organisation/testAccount.ts`); a real organisation's email is refused.
- Routes: `GET /api/super-admin/test-account`, `POST /api/super-admin/test-account/start`,
  `POST /api/super-admin/test-account/open`, `POST /api/organisation/test-account/restart`.
- Frontend: `components/superadmin/TestAccountPanel.tsx`, `components/support/TestAccountBar.tsx`,
  `pages/organisation/TestAccountSession.tsx`, `utils/testAccount.ts`.

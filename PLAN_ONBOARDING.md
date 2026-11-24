# EasyReimburse Onboarding Plan

Status: **being built** (24 November 2026). The seven decisions are made. Part 1 (no more dead ends),
part 2 (the practice project) and part 3 (the real project in four steps) are built; part 4 follows. The
onboarding test account (see the end) is built.

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
   - Marta Ruiz (Spain): green travel by train and bus, ready to approve.
   - Liam Byrne (Ireland): invited, not started.
   - Sam Peeters (Belgium): the one the organiser plays, with four sample tickets.
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

## Decisions (made on 23 November 2026)

1. What a new organisation tries with: **a ready-made practice project** (part 2).
2. What is free for real use: **the first real project is free up to 10 participants**, as the website
   promises.
3. The guide: **step list plus spotlight** on the real buttons.
4. The 35-second film inside the app: **yes** (welcome screen and Help).
5. One optional question at the start ("When is your next project?"): **no**.
6. Personal help: **"Write to Micky"**, replies to Micky's inbox. No call link.
7. Emails: **welcome plus one reminder after 3 days**.

## Build order

Each part is usable on its own and is checked in the onboarding test account before the next starts.

### Part 1, no more dead ends (built)

- **No automatic "Test Project" any more.** Sign-up creates the organisation only
  (`services/organisation/signup.ts`). The first project an organisation creates itself is free for up
  to 10 participants: `POST /api/organisation/projects` with `free: true`. It is the old "test project"
  under the hood (`isTestProject`, `maxParticipants: 10`), so the limit and the Upgrade work as before.
  Once per organisation (`Organisation.freeProjectUsedAt`), also after deleting or upgrading it.
- **Older sign-ups** keep their "Test Project": it is their free project, so they get no second one
  (`freeProjectAvailable`: created before `FREE_FIRST_PROJECT_SINCE`, or already has a free project).
  While it is untouched (placeholder name and country) the AI is open in it, and the welcome and the
  next-step card send them to its Settings.
- **Welcome screen** (`WelcomeScreen.tsx`) instead of the five slides: set up my project, watch the
  35-second film (`/film/how-it-works.mp4`), or look around. Seen = stored on the server
  (`Organisation.onboarding.welcomeSeenAt`, `PATCH /api/organisation/onboarding`), never by a support
  session. The practice project becomes its first way in with part 2.
- **Dashboard**: until the first invitation is out it greets, shows one next-step card
  (project → participants → amounts → invitations; `gettingStarted` in
  `services/organisation/onboarding.ts`, words in `frontend/src/utils/gettingStarted.ts`) and the
  projects. No credit warning and no prices; those appear on the project creation page only when a
  credit is really needed. Afterwards the overview with the numbers is back.
- **Project creation**: the form is open for the free project; with credits as well there is a choice
  (free is the default); with neither, the page says a credit is needed and shows the prices.
- **Send Link** asks for the missing maximum amounts on the spot (`SetAmountsModal.tsx`) and sends
  afterwards. The dashboard's next step opens the same window (`?do=amounts`, also `?do=add`,
  `?do=invite`, `?tab=settings`).
- **When the AI builds the trips** is said on the participants tab, with the switch right there.
- **Free project banner and Upgrade button** are back (`GET /projects/:id` did not return
  `isTestProject` and `maxParticipants`). Upgrading gives room for 60 participants, like a credit does
  everywhere else (it used to remove the limit altogether).

### Part 2, the practice project (built)

- **The practice project** is "Common Ground", a made-up youth exchange in Porto that always "ended 16
  days ago" (`Project.isPracticeProject`). What is in it is plain data in
  `backend/src/services/organisation/practice/content.ts`; `practiceProject.ts` puts it in the database
  and in storage. Five made-up participants, each at a different point: Jonas Weber (ready to approve,
  AI check all clear), Elena Rossi (one thing to check: an amount she changed by hand, with her note),
  Marta Ruiz (green travel by train and bus), Liam Byrne (invited, not started) and Sam Peeters (the one
  the organiser plays). Their tickets are real PDF files from made-up companies ("Example Air", "Example
  Rail", "Example Bus"; `services/pdf/sampleTicketPdf.ts`), each saying at the bottom that it is a sample.
- **It is made** for every new organisation at sign-up (in the background) and for the test account; an
  organisation from before gets it the moment it asks (`POST /api/organisation/practice-project`). It
  costs no credit, takes no participants of its own, and is counted nowhere: not on the dashboard, not
  in `gettingStarted`, not in super-admin. It can be started again (`…/practice-project/restart`),
  removed (`DELETE …/practice-project`) and brought back.
- **No email ever leaves it.** Its participants have `@example.org` addresses; both email senders refuse
  addresses that can never receive mail (`services/email/reservedAddresses.ts`), whatever part of the app
  tries. Where an organiser's action would send an email (link, reminder, approval, paid, reopen), the
  email is written and returned instead (`mailerFor()` in `services/email/previewEmail.ts`) and shown:
  "This is the email they would get" (`EmailPreview.tsx`).
- **Be a participant yourself.** On Sam's participant page "Use the sample tickets" puts four files in
  the file (`POST /api/participant/practice/sample-tickets`), made out to Sam's name and the project's
  dates. From there everything is real: the AI reads them, builds the trips and reviews the hand-in (it
  is told that the files are sample tickets and to judge them like real ones: `PRACTICE_AI_NOTE`).
  Sample bank details fill in with one click.
- **The guide** has five steps: look around, approve Jonas, ask Elena a question, be a participant,
  download the audit file. Whether a step is done is read from the practice project itself where it
  leaves a trace; the two that leave none (looked around, audit file downloaded) are remembered with the
  organisation (`Organisation.onboarding.practice`, never by a support session). Logic in
  `services/organisation/practice/guide.ts`, words and places in `frontend/src/utils/practiceGuide.ts`.
  It is a small panel in the corner of the practice project's pages (`PracticeGuidePanel.tsx`) that takes
  you to the page of the step and there points at the real button (`Spotlight.tsx`, `data-tour`
  attributes). It can be made small, put away and taken out again.
- **Welcome screen**: "See how it works" (the practice project) is the first of three ways in, next to
  "Set up your first project" and the film. **Dashboard**: a new organisation sees a card with the
  practice step it is at; afterwards, and for organisations that are under way, it is one quiet line.

### Part 3, the real project in four steps (built)

- **Four steps, shown as one row** (`SetupSteps.tsx`): project, participants, amounts, invitations.
  Creating the project (`ProjectCreate.tsx`) is step 1 and asks for name, place and dates only; the
  description and the exchange rate rule sit under "More options". After creating, the set-up goes on at
  `/org/projects/:id/setup` (`ProjectSetup.tsx`), which opens at the first step that is still to do.
  Every step can be left for later; the dashboard's next step opens the set-up at that step
  (`?step=2|3|4`).
- **Participants: paste a list** (`PasteParticipants.tsx`). Rows copied from a sheet, lines from a
  message, or the "To" line of an email, with or without a header row: the columns are recognised by
  what is in them (`mapColumnsByContent` in `backend/src/utils/participantCsv.ts`), and what was
  understood is shown before anything is added. A list without a country asks for one for all of them.
  The import routes take the text (`{ text, defaultCountry }`) next to an uploaded file. "Paste a list"
  is on the project page too, and a single participant can still be added by hand.
- **Amounts**: one maximum per sending country of the participants, saved together.
- **Invitations: now, on a day, or later** (`POST /api/organisation/projects/:id/invitations`). "On a
  day" stores `Project.inviteAt` (07:00 UTC of that day); a job that runs every 10 minutes
  (`sendDueInvitations` in `services/organisation/invitations.ts`) then sends the link to everybody who
  has none, once: the plan is cleared before the first email leaves. The project page says when they go
  out, with "Send them now", "Another day" and "Cancel the plan" (`PlannedInvitations.tsx`). A plan counts
  as the last set-up step done. The invitation can be read before anything is sent
  (`GET …/invitation-preview`).
- **An invitation that could not be sent is said so** and the participant is not marked as invited
  (`sendInvitation`; before, a refused email still counted as sent).
- **Project settings**: the basics (details, maximum amounts) are open; the rest is folded away under
  "Rules and options", each line saying what is chosen now (`FoldedSetting` in `ProjectDetail.tsx`).

### Part 4, staying in touch

Help button (replay the tour, the film, "How do I…", Write to Micky); welcome email and one reminder
after 3 days; a first name at sign-up; progress per organisation in super-admin.

What stays as it is: the participant pages, the prices, the rules of real projects. Existing
organisations keep their Test Project (as their free project) and get the Help button.

---

## The onboarding test account (built)

Super-admin → **Test account** → **Open as a brand-new organisation** opens the app in a new tab as
an organisation that signed up this second. Inside it, the **Test account** button in the
bottom-left corner starts over without going back to super-admin.

- Every start deletes the previous test account (projects, participants, stored files) and creates a
  fresh one with `createNewOrganisation` (`backend/src/services/organisation/signup.ts`),
  the same code sign-up uses. Whatever sign-up creates in future, the test account gets too.
- It can start with no credits (like a real new organisation) or with one project credit, and can
  send the welcome email. "Continue where it is" signs in without starting over.
- Only organisations marked `Organisation.isTestAccount` can be deleted this way
  (`backend/src/services/organisation/testAccount.ts`); a real organisation's email is refused.
- Routes: `GET /api/super-admin/test-account`, `POST /api/super-admin/test-account/start`,
  `POST /api/super-admin/test-account/open`, `POST /api/organisation/test-account/restart`.
- Frontend: `components/superadmin/TestAccountPanel.tsx`, `components/support/TestAccountBar.tsx`,
  `pages/organisation/TestAccountSession.tsx`, `utils/testAccount.ts`.

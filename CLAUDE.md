# EasyReimburse (Erasmus+) - Project Context for Claude Code

## Project Overview

EasyReimburse is a web application for managing Erasmus+ travel reimbursements. Organisations create projects and invite participants via magic links. Participants upload travel documents, which are processed by AI (document OCR + consolidation), then reviewed by AI before the organisation approves and pays.

### Tech Stack
- **Backend**: Node.js + Express + TypeScript, Prisma ORM, PostgreSQL (Railway)
- **Frontend**: React + TypeScript + Vite, TailwindCSS, TanStack Query (React Query), Lucide icons
- **AI**: OpenAI GPT-5.2 for document consolidation and review; Anthropic Claude for additional AI services
- **Storage**: AWS S3 for documents
- **Email**: Postmark for transactional emails (magic links, notifications)
- **PDF**: PDFKit for Declaration on Honor PDF generation
- **Deployment**: Railway (Docker-based), internal Postgres at `postgres.railway.internal:5432`

### Architecture
```
erasmus/
├── backend/
│   ├── src/
│   │   ├── index.ts                          # Express server entry point
│   │   ├── routes/
│   │   │   ├── admin/                        # Organisation/admin routes (JWT auth)
│   │   │   └── participant/index.ts          # Participant routes (magic link auth)
│   │   ├── services/
│   │   │   ├── ai/
│   │   │   │   ├── claudeAiService.ts        # AI review + reimbursement validation
│   │   │   │   └── reviewRules.ts            # Configurable AI review rule definitions
│   │   │   ├── pdf/
│   │   │   │   ├── declarationPdfService.ts  # Declaration on Honor PDF generation
│   │   │   │   └── fonts/                    # Liberation Sans TTF (Unicode-capable)
│   │   │   ├── storage/                      # S3 storage abstraction
│   │   │   ├── email/                        # Postmark email service
│   │   │   └── inforeuro/                    # Exchange rate service (InforEuro)
│   │   └── middleware/
│   ├── prisma/
│   │   ├── schema.prisma                     # Database schema
│   │   └── migrations/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── participant/
│   │   │   │   ├── ReimbursementPage.tsx      # Main participant page (~2500 lines)
│   │   │   │   └── DisseminationPage.tsx      # Social media dissemination
│   │   │   └── organisation/
│   │   │       ├── ProjectDetail.tsx           # Org project + participant list
│   │   │       ├── ParticipantDetail.tsx       # Org view of single participant
│   │   │       └── Dashboard.tsx               # Org dashboard
│   │   ├── services/
│   │   │   └── api.ts                          # API client + types
│   │   └── components/
│   └── package.json
└── CLAUDE.md (this file)
```

### Auth Systems
- **Organisations**: JWT-based auth (`/api/admin/*` routes), tokens stored in localStorage as `admin-auth`
- **Participants**: Magic link tokens in URL query params (`?token=xxx`), validated per-request via `participantApi.authenticate()`

### Key Flows
1. **Org creates project** → invites participants via email (magic link)
2. **Participant clicks link** → uploads travel documents (Step 1)
3. **AI consolidates documents** → extracts travel items, amounts, currencies (automatic)
4. **Participant reviews data** → corrects AI extractions, adds missing info (Step 2)
5. **Participant submits** → bank details + final review (Step 3)
6. **AI reviews submission** → flags issues via configurable review rules
7. **Org reviews findings** → approves or reopens for corrections
8. **Org marks as paid** → participant notified

## Development Notes

### Running Locally
```bash
# Backend
cd backend && npm install && npm run dev  # Uses tsx watch

# Frontend
cd frontend && npm install && npm run dev  # Vite dev server
```

### Database
- Provider: PostgreSQL (Railway in production, needs `DATABASE_URL` env var)
- Schema changes: Edit `prisma/schema.prisma`, then `npx prisma generate` for types
- **Important**: `prisma db push --accept-data-loss` runs at server startup (not during build), because Railway's internal DB is only accessible at runtime
- Manual migrations go in `backend/prisma/migrations/`

### Build & Deploy
- Build: `tsc && cp -r src/services/pdf/fonts dist/services/pdf/fonts && prisma generate`
- Start: `prisma db push --accept-data-loss && node dist/index.js`
- TypeScript compiles to CommonJS (no `"type": "module"` in package.json), so use `__dirname` not `import.meta.url`
- The `.js` extensions in imports (e.g., `'../storage/index.js'`) are NodeNext module resolution convention, compiled to `require()`

### Key Conventions
- Frontend uses React Query with `invalidateQueries` / `refetchQueries` for data sync
- Participant API functions live in `participantApi` object in `api.ts`
- Org/admin API functions live in `adminApi` object in `api.ts`
- UI components are in `frontend/src/components/ui/` (Card, Button, Input, Select, Modal)
- Toast notifications via `react-hot-toast`
- File uploads via `react-dropzone`
- Exchange rates from InforEuro service, cached and looked up by currency + date
- AI review rules defined in `reviewRules.ts` with severity levels: `critical`, `important`, `info`
- PDF generation uses Liberation Sans fonts (bundled in `backend/src/services/pdf/fonts/`) for Unicode support

---

## Recent Work History

### Batch 1 (Previously Completed)
Major feature additions including: AI-detected currency display, manual exchange rate override, CSV template download, delete participants (individual + bulk), car travel declarations on honor, declaration reason field, company/airline name field, varied AI review messages, and various bug fixes.

### Batch 2 (Just Completed - commit `0e678b6`)
20 issues across 6 phases:

**Phase 1 - AI Review Prompt Cleanup:**
- Removed false-positive flags: consolidationNotes, hardcoded FX rate, validationWarnings
- Added `purchaseDate` to travel item data in AI prompt
- Disabled `exceeds-limit` review rule
- Removed max reimbursement / total claimed from AI prompt

**Phase 2 - Multi-Person Booking & No-Reimbursement:**
- Replaced multi-person portion splitting with informational badge
- Added `noReimbursement` boolean to Participant schema + migration
- Added `PATCH /api/participant/no-reimbursement` endpoint
- Participants who don't need reimbursement can skip bank details, get auto-completed
- No-reimbursement checkbox UI on Step 1 with skip-to-complete flow

**Phase 3 - Organisation Frontend:**
- Persistent sort via localStorage (`participant-sort-${projectId}`)
- Removed Progress column from participant overview (kept Status)
- Green styling (emerald) for "All Clear" AI review findings

**Phase 4 - Participant UX:**
- 500ms debounce for purchase date/currency exchange lookups (was 5000ms for everything)
- `submitAttempted` state: bank detail warnings hidden until submit
- Radio-button indicators + instruction text for document selection
- Removed AI consolidation warnings from participant view
- `ConsolidationLoading` component accepts `documentCount` prop for dynamic time estimate
- Header price uses `localAmount` for instant update during editing

**Phase 5 - Document Handling:**
- Safe document deletion: checks for cross-references before deleting
- `InlineDocumentUpload` component: dropzone replacing "No document linked" warning
- Enhanced Add Travel Modal: image preview via `URL.createObjectURL`, PDF preview with filename/size

**Phase 6 - Backend Fixes:**
- Unicode PDF: Liberation Sans fonts (supports ș, ț, ă, î, â) replacing Helvetica
- Fonts bundled in project with system font fallback
- Magic link retry: `ApiError` exported, participant-auth query retries on 5xx (up to 3x with exponential backoff), never retries on 4xx

---

## Known Issues / Future Work

### From Batch 1 (may need verification)
These items were planned in Batch 1 but the user indicated they were "already executed." They may need verification:
- AI detected currency display in org participant overview
- Manual exchange rate override for orgs
- Remove "mark AI check ok" button
- Email warning for unconfigured reimbursement amounts
- Remove number spinner arrows from reimbursement limit input
- CSV template download button
- Delete participants (individual + bulk)
- Remove car rate from project creation
- Interrail pass handling (auto-create items + require declarations)
- Fix email link readability in Outlook
- Travel-themed animation + time estimate for waiting page
- Delete unlinked documents from Add Travel modal
- Fix stale reimbursement amount after travel item deletion
- Multi-item PDF extraction
- Company/airline name field
- Fix declaration created UI delay
- Car travel declaration on honor
- Declaration reason field
- Fix AI review FX rate false positive
- Varied AI review all-good messages

### Deployment
- Railway Docker deployment
- `prisma db push` runs at startup (not build) because Railway's internal Postgres is only reachable at runtime
- If SIGTERM occurs at startup, it's likely a cold-start timeout — retry or increase Railway healthcheck grace period

### Large Files
- `ReimbursementPage.tsx` is ~2500 lines — could benefit from being split into separate step components
- `api.ts` is ~1600 lines — types could be extracted to a separate file

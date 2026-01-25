# Erasmus+ Travel Reimbursement Portal

A modern web application to simplify travel reimbursements for Erasmus+ youth projects. Built with TypeScript, React, and Express.

## Features

### For Project Admins
- Dashboard with real-time statistics
- Create and manage multiple projects
- Set country-specific reimbursement limits
- Import participants via CSV
- Send magic link emails (bulk or individual)
- Review documents and travel items
- Approve reimbursements and track payments
- Export data to CSV for financial reporting

### For Participants
- Access personal reimbursement page via magic link (no registration needed)
- Upload travel documents (PDF, JPG, PNG)
- Automatic document analysis and data extraction
- Review and correct extracted travel data
- Sign declarations on honor for missing documents
- Submit reimbursement with bank details

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js + Express + TypeScript |
| Database | SQLite + Prisma ORM |
| Frontend | React 18 + TypeScript + Vite |
| Styling | TailwindCSS |
| State | React Query + Zustand |
| Testing | Vitest |

## Prerequisites

- Node.js 18+
- npm 9+

## Quick Start

### 1. Install Dependencies

```bash
# Install all dependencies (root + backend + frontend)
npm install
```

### 2. Set Up Environment Variables

The backend `.env` file is pre-configured for development. Review and modify if needed:

```bash
# backend/.env
PORT=3001
NODE_ENV=development
DATABASE_URL="file:./dev.db"
ADMIN_PASSWORD=admin123
STORAGE_TYPE=local
STORAGE_LOCAL_PATH=./uploads
EMAIL_PROVIDER=console
FRONTEND_URL=http://localhost:5173
SESSION_SECRET=dev_session_secret_change_in_production
```

### 3. Initialize the Database

```bash
# Generate Prisma client and run migrations
cd backend
npx prisma migrate dev --name init

# Seed with sample data
npm run db:seed
```

### 4. Start Development Servers

From the root directory:

```bash
npm run dev
```

This starts both:
- Backend API: http://localhost:3001
- Frontend: http://localhost:5173

### 5. Access the Application

- **Admin Portal**: http://localhost:5173/admin
  - Password: `admin123` (or whatever you set in `ADMIN_PASSWORD`)

- **Participant Portal**: Use magic links printed in the console after seeding

## Project Structure

```
erasmus/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma    # Database schema
│   │   └── seed.ts          # Seed data
│   └── src/
│       ├── index.ts         # Server entry point
│       ├── middleware/      # Auth, error handling
│       ├── routes/
│       │   ├── admin/       # Admin API routes
│       │   └── participant/ # Participant API routes
│       ├── services/
│       │   ├── storage/     # File storage abstraction
│       │   ├── email/       # Email service abstraction
│       │   └── ai/          # Document AI abstraction
│       └── utils/
│
├── frontend/
│   └── src/
│       ├── components/      # Reusable UI components
│       ├── pages/
│       │   ├── admin/       # Admin pages
│       │   └── participant/ # Participant pages
│       ├── services/        # API client
│       └── hooks/           # Custom hooks & stores
│
└── README.md
```

## Available Scripts

### Root (runs both backend and frontend)
```bash
npm run dev         # Start development servers
npm run build       # Build for production
npm test            # Run all tests
```

### Backend
```bash
cd backend
npm run dev         # Start dev server with hot reload
npm run build       # Compile TypeScript
npm run db:migrate  # Run Prisma migrations
npm run db:seed     # Seed database
npm run db:studio   # Open Prisma Studio
npm test            # Run tests
```

### Frontend
```bash
cd frontend
npm run dev         # Start Vite dev server
npm run build       # Build for production
npm run preview     # Preview production build
npm test            # Run tests
```

## API Endpoints

### Admin Routes (require Bearer token auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/auth/login` | Login with password |
| GET | `/api/admin/dashboard/stats` | Get dashboard statistics |
| GET | `/api/admin/projects` | List all projects |
| POST | `/api/admin/projects` | Create project |
| GET | `/api/admin/projects/:id` | Get project details |
| DELETE | `/api/admin/projects/:id` | Delete project (GDPR) |
| POST | `/api/admin/participants/import` | Import CSV |
| POST | `/api/admin/participants/:id/send-magic-link` | Send magic link |

### Participant Routes (require magic link token)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/participant/auth?token=...` | Authenticate & get data |
| POST | `/api/participant/documents` | Upload document |
| PATCH | `/api/participant/travel-items/:id` | Update travel item |
| PATCH | `/api/participant/bank-details` | Update bank details |
| POST | `/api/participant/mark-complete` | Submit reimbursement |

## Service Abstractions

The application is designed with pluggable service abstractions:

### Storage Service
```typescript
// Currently: Local filesystem
// Future: S3, Azure Blob Storage, etc.
interface StorageService {
  store(file, path): Promise<StoredFile>;
  retrieve(path): Promise<Buffer>;
  delete(path): Promise<void>;
  getUrl(path): Promise<string>;
}
```

### Email Service
```typescript
// Currently: Console logging
// Future: SMTP, SendGrid, AWS SES, etc.
interface EmailService {
  send(options): Promise<EmailResult>;
  sendMagicLink(to, name, project, link): Promise<EmailResult>;
}
```

### AI/Document Service
```typescript
// Currently: Mock with pattern matching
// Future: Google Vision, AWS Textract, OpenAI, etc.
interface TravelDocumentAiService {
  analyzeDocument(file, mimeType, filename): Promise<DocumentAnalysisResult>;
  validateReimbursement(participantId): Promise<ReimbursementValidation>;
  recalculateParticipantSummary(participantId): Promise<void>;
  convertToEur(amount, currency, date?): Promise<number>;
}
```

## Data Model

```
Organisation
  └── Project
        ├── ProjectCountryLimit (max reimbursement per country)
        └── Participant
              ├── Document (uploaded files)
              ├── TravelItem (travel segments)
              ├── ReimbursementSummary
              ├── ChangeLogEntry (audit trail)
              └── DeclarationOnHonor (for missing docs)
```

## Security Features

- Admin authentication via Bearer token
- Participant authentication via magic link tokens
- Data isolation between participants
- Rate limiting on API endpoints
- Helmet.js security headers
- CORS configuration
- Full project/participant deletion for GDPR compliance

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | 3001 |
| `NODE_ENV` | Environment | development |
| `DATABASE_URL` | Prisma database URL | file:./dev.db |
| `ADMIN_PASSWORD` | Admin login password | admin123 |
| `STORAGE_TYPE` | Storage backend | local |
| `STORAGE_LOCAL_PATH` | Local upload path | ./uploads |
| `EMAIL_PROVIDER` | Email backend | console |
| `FRONTEND_URL` | Frontend URL for magic links | http://localhost:5173 |

## Running Tests

```bash
# All tests
npm test

# Backend only
cd backend && npm test

# Frontend only
cd frontend && npm test

# Watch mode
npm run test:watch
```

## Production Deployment

1. Set secure environment variables
2. Use PostgreSQL instead of SQLite
3. Configure real email provider (SMTP/SendGrid)
4. Set up S3 or similar for file storage
5. Enable HTTPS
6. Set strong `ADMIN_PASSWORD` and `SESSION_SECRET`

## Future Improvements

- [ ] Multi-organisation support
- [ ] Real OCR/AI integration for document processing
- [ ] Email provider integration (SMTP, SendGrid)
- [ ] S3 storage integration
- [ ] Historical exchange rate API
- [ ] PDF export for reimbursement reports
- [ ] Audit log export
- [ ] Two-factor authentication for admins

## License

MIT

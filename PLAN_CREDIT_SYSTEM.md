# EasyReimburse Credit System Implementation Plan

## Overview

Transform EasyReimburse from a single-tenant application to a multi-tenant SaaS with:
- Organization accounts with email/password authentication
- Credit-based project creation
- Stripe payment integration
- Super admin oversight
- Founding credit invitation system

---

## Phase 1: Database Schema Changes

### New Tables

```prisma
// Organization - the paying customer
model Organisation {
  id                    String   @id @default(uuid())
  name                  String
  email                 String   @unique  // Login email
  passwordHash          String
  organisationId        String?  // OID - optional, used for founding credit

  // Credit tracking
  projectCredits        Int      @default(0)
  hasAnnualLicense      Boolean  @default(false)
  annualLicenseExpiresAt DateTime?

  // Founding credit tracking
  foundingCreditClaimed Boolean  @default(false)
  foundingCreditClaimedAt DateTime?
  foundingCreditExpiresAt DateTime?  // Must start project within 1 month
  foundingCreditUsed    Boolean  @default(false)

  // Metadata
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  // Relations
  projects              Project[]
  purchases             Purchase[]
}

// Purchase history for audit trail
model Purchase {
  id              String   @id @default(uuid())
  organisationId  String
  organisation    Organisation @relation(fields: [organisationId], references: [id])

  type            PurchaseType  // SINGLE, PACK_5, PACK_10, ANNUAL
  amount          Int           // Amount in cents (e.g., 9500 = €95)
  currency        String        @default("EUR")
  creditsGranted  Int           // Number of credits added

  stripeSessionId   String?   @unique
  stripePaymentId   String?
  stripeInvoiceUrl  String?

  status          PurchaseStatus @default(PENDING)
  createdAt       DateTime @default(now())
  completedAt     DateTime?
}

enum PurchaseType {
  SINGLE      // €95, 1 credit
  PACK_5      // €395, 5 credits
  PACK_10     // €595, 10 credits
  ANNUAL      // €995, unlimited for 1 year
  FOUNDING    // Free, 1 credit (invitation only)
}

enum PurchaseStatus {
  PENDING
  COMPLETED
  FAILED
  REFUNDED
}
```

### Modified Tables

```prisma
model Project {
  // ... existing fields ...

  // Add organization relationship
  organisationId  String
  organisation    Organisation @relation(fields: [organisationId], references: [id])

  // Track which credit was used
  creditSource    PurchaseType?  // Which type of credit created this project
}
```

### Super Admin Table

```prisma
model SuperAdmin {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
}
```

---

## Phase 2: Authentication System

### Organization Authentication

**Endpoints:**
```
POST /api/auth/register          - Create new organization account
POST /api/auth/login             - Login, returns JWT token
POST /api/auth/logout            - Invalidate token
POST /api/auth/forgot-password   - Send password reset email
POST /api/auth/reset-password    - Reset password with token
GET  /api/auth/me                - Get current organization info
```

**JWT Token Structure:**
```json
{
  "type": "organisation",
  "organisationId": "uuid",
  "email": "org@example.com",
  "exp": 1234567890
}
```

### Super Admin Authentication

**Endpoints:**
```
POST /api/super-admin/login      - Super admin login
GET  /api/super-admin/me         - Get super admin info
```

**JWT Token Structure:**
```json
{
  "type": "superadmin",
  "adminId": "uuid",
  "email": "admin@easyreimburse.com",
  "exp": 1234567890
}
```

### Password Requirements
- Minimum 8 characters
- At least one uppercase, one lowercase, one number
- Hashed with bcrypt (12 rounds)

---

## Phase 3: Credit System Logic

### Credit Consumption Rules

```typescript
function canCreateProject(org: Organisation): { allowed: boolean; reason?: string } {
  // Annual license holders can always create
  if (org.hasAnnualLicense && org.annualLicenseExpiresAt > new Date()) {
    return { allowed: true };
  }

  // Check founding credit (must use within 1 month)
  if (org.foundingCreditClaimed && !org.foundingCreditUsed) {
    if (org.foundingCreditExpiresAt && org.foundingCreditExpiresAt < new Date()) {
      return { allowed: false, reason: 'Founding credit expired. Please purchase credits.' };
    }
    return { allowed: true };
  }

  // Check regular credits
  if (org.projectCredits > 0) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'No credits available. Please purchase credits.' };
}

function consumeCredit(org: Organisation): PurchaseType {
  // Priority: Founding credit > Regular credits > Annual (no consumption)

  if (org.foundingCreditClaimed && !org.foundingCreditUsed) {
    // Mark founding credit as used
    org.foundingCreditUsed = true;
    return 'FOUNDING';
  }

  if (org.hasAnnualLicense && org.annualLicenseExpiresAt > new Date()) {
    // Annual license - no credit consumed
    return 'ANNUAL';
  }

  // Consume one regular credit
  org.projectCredits -= 1;
  return 'SINGLE'; // or could track original purchase type
}
```

### Credit Grant Rules

| Purchase Type | Credits Granted | Price |
|--------------|-----------------|-------|
| SINGLE | 1 | €95 |
| PACK_5 | 5 | €395 |
| PACK_10 | 10 | €595 |
| ANNUAL | 0 (unlimited flag) | €995 |
| FOUNDING | 1 (special) | €0 |

---

## Phase 4: Stripe Integration

### Products to Create in Stripe Dashboard

1. **Single Project Credit** - €95, one-time
2. **5 Project Pack** - €395, one-time
3. **10 Project Pack** - €595, one-time
4. **Annual Organisation License** - €995, one-time (not subscription)

### Checkout Flow (Sales Page → App)

```
1. User visits sales page (separate URL)
2. User selects a package
3. Sales page redirects to Stripe Checkout with:
   - success_url: https://app.easyreimburse.com/payment/success?session_id={CHECKOUT_SESSION_ID}
   - cancel_url: https://sales.easyreimburse.com/pricing
   - client_reference_id: organisation_id (if logged in) OR "new"
   - customer_email: pre-filled if known

4. After payment, Stripe sends webhook to app
5. Webhook handler:
   - If existing org: Add credits
   - If new user: Create pending registration, redirect to complete signup

6. User lands on success page:
   - If existing org: "Credits added! Go to dashboard"
   - If new user: "Complete your registration" form
```

### Webhook Endpoint

```
POST /api/stripe/webhook
```

**Events to handle:**
- `checkout.session.completed` - Payment successful
- `checkout.session.expired` - Session expired (cleanup)

### API Endpoints

```
POST /api/stripe/create-checkout-session
  Body: { packageType: 'SINGLE' | 'PACK_5' | 'PACK_10' | 'ANNUAL' }
  Returns: { checkoutUrl: string }

GET  /api/stripe/session/:sessionId
  Returns: { status, organisationId, packageType }
```

---

## Phase 5: Founding Credit System

### Invitation Flow

```
1. Shared link: https://app.easyreimburse.com/founding-access

2. Landing page shows:
   - Welcome message
   - "Claim your free project credit"
   - Registration form:
     * Organisation name
     * Email
     * Password
     * Organisation ID (OID) - required

3. On submit:
   - Check OID not already used for founding credit
   - Create organisation account
   - Grant founding credit (expires in 1 month)
   - Redirect to dashboard

4. Dashboard shows:
   - "1 Founding Credit available"
   - "Expires on [date] - start a project to use it"
```

### Validation Rules

```typescript
async function claimFoundingCredit(oid: string): Promise<boolean> {
  // Check if OID already used
  const existing = await prisma.organisation.findFirst({
    where: {
      organisationId: oid,
      foundingCreditClaimed: true
    }
  });

  if (existing) {
    throw new Error('This Organisation ID has already claimed a founding credit');
  }

  return true;
}
```

---

## Phase 6: Organisation Dashboard

### Routes

```
/org/login                    - Login page
/org/register                 - Registration (redirects from Stripe or founding link)
/org/dashboard                - Main dashboard
/org/projects                 - List projects
/org/projects/new             - Create new project
/org/projects/:id             - Project detail
/org/projects/:id/participants - Manage participants
/org/settings                 - Organisation settings
/org/billing                  - Purchase history, buy more credits
```

### Dashboard Overview

```
┌─────────────────────────────────────────────────────────────┐
│  EasyReimburse                              [Organisation ▼] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Welcome, [Organisation Name]                               │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Credits   │  │  Projects   │  │   Active    │         │
│  │      3      │  │      2      │  │ Participants│         │
│  │  available  │  │   total     │  │     47      │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  [+ Create New Project]        [Buy More Credits]           │
│                                                             │
│  Recent Projects                                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Youth Exchange 2025    │ 12 participants │ Active  │    │
│  │ Training Course 2024   │ 25 participants │ Archived│    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Credit Display Logic

```typescript
function getCreditDisplay(org: Organisation): string {
  if (org.hasAnnualLicense && org.annualLicenseExpiresAt > new Date()) {
    const daysLeft = dayjs(org.annualLicenseExpiresAt).diff(dayjs(), 'day');
    return `Annual License (${daysLeft} days remaining)`;
  }

  let credits = org.projectCredits;
  let extra = '';

  if (org.foundingCreditClaimed && !org.foundingCreditUsed) {
    credits += 1;
    const expiresIn = dayjs(org.foundingCreditExpiresAt).diff(dayjs(), 'day');
    extra = ` (includes 1 founding credit - expires in ${expiresIn} days)`;
  }

  return `${credits} project credit${credits !== 1 ? 's' : ''}${extra}`;
}
```

---

## Phase 7: Super Admin Dashboard

### Routes

```
/admin/login                  - Super admin login
/admin/dashboard              - Overview
/admin/organisations          - List all organisations
/admin/organisations/:id      - Organisation detail
/admin/projects               - List all projects
/admin/purchases              - All purchase history
/admin/founding-credits       - Track founding credit usage
```

### Organisation Management

Super admin can:
- View all organisations and their credits
- View all projects across organisations
- Manually add/remove credits (for refunds, support)
- See founding credit claims by OID
- Deactivate organisations if needed

### Overview Stats

```
┌─────────────────────────────────────────────────────────────┐
│  Super Admin Dashboard                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Orgs      │  │  Revenue    │  │  Founding   │         │
│  │     127     │  │  €12,450    │  │  Credits    │         │
│  │   total     │  │   total     │  │  89 claimed │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  Recent Signups                   Recent Purchases          │
│  ┌────────────────────┐          ┌────────────────────┐    │
│  │ Org ABC - 2h ago   │          │ €395 - Pack 5      │    │
│  │ Org XYZ - 1d ago   │          │ €95 - Single       │    │
│  └────────────────────┘          └────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 8: Migration Plan

### Step 1: Database Migration
1. Add new tables (Organisation, Purchase, SuperAdmin)
2. Add organisationId to Project table (nullable initially)
3. Create default super admin account

### Step 2: Clean Existing Data
1. Delete existing test projects and participants
2. Or: Create a "Demo Organisation" and assign test data to it

### Step 3: Environment Variables

```env
# Authentication
JWT_SECRET=<generate-secure-secret>
JWT_EXPIRES_IN=7d

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_SINGLE=price_...
STRIPE_PRICE_PACK_5=price_...
STRIPE_PRICE_PACK_10=price_...
STRIPE_PRICE_ANNUAL=price_...

# App URLs
APP_URL=https://app.easyreimburse.com
SALES_URL=https://easyreimburse.com

# Email (for password reset)
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
FROM_EMAIL=noreply@easyreimburse.com
```

---

## Implementation Order

### Sprint 1: Foundation (Week 1)
1. Database schema changes
2. Organisation authentication (register, login, JWT)
3. Basic organisation dashboard shell

### Sprint 2: Credit System (Week 2)
4. Credit tracking and consumption logic
5. Project creation with credit check
6. Organisation dashboard with credit display

### Sprint 3: Payments (Week 3)
7. Stripe integration
8. Checkout flow
9. Webhook handling
10. Purchase history

### Sprint 4: Admin & Polish (Week 4)
11. Super admin dashboard
12. Founding credit invitation page
13. Password reset flow
14. Testing and bug fixes

---

## Security Considerations

1. **Password Storage**: bcrypt with 12 rounds
2. **JWT Tokens**: Signed with RS256, 7-day expiry
3. **Rate Limiting**: 5 login attempts per 15 minutes
4. **Stripe Webhooks**: Verify signature before processing
5. **CORS**: Restrict to known domains
6. **Input Validation**: Zod schemas for all endpoints

---

## Questions Resolved

| Decision | Choice |
|----------|--------|
| Auth method | Email + Password |
| Users per org | One account per organisation |
| OID validation | Text field, no external validation |
| Payment flow | Sales page → Stripe → App webhook |
| Founding link | Single shared link |
| AI uploads | Skip for now |
| Existing data | Start fresh |
| Credit expiry | None (except founding: 1 month to start) |
| Annual renewal | Manual invoice, no auto-renew |

---

## Files to Create/Modify

### Backend (New)
- `src/routes/auth/index.ts` - Organisation auth
- `src/routes/organisation/index.ts` - Org dashboard API
- `src/routes/stripe/index.ts` - Stripe webhooks
- `src/routes/super-admin/index.ts` - Super admin API
- `src/middleware/orgAuth.ts` - Organisation JWT middleware
- `src/services/credits/index.ts` - Credit management
- `prisma/schema.prisma` - Schema updates

### Backend (Modify)
- `src/routes/admin/index.ts` - Becomes super admin routes
- `src/index.ts` - Mount new routes

### Frontend (New)
- `src/pages/org/Login.tsx`
- `src/pages/org/Register.tsx`
- `src/pages/org/Dashboard.tsx`
- `src/pages/org/Projects.tsx`
- `src/pages/org/ProjectDetail.tsx`
- `src/pages/org/Settings.tsx`
- `src/pages/org/Billing.tsx`
- `src/pages/founding/index.tsx` - Founding credit claim
- `src/pages/payment/Success.tsx`

### Frontend (Modify)
- `src/App.tsx` - Add new routes
- `src/services/api.ts` - Add new API functions

---

## Approval Checklist

Please confirm:
- [ ] Database schema looks correct
- [ ] Authentication flow is acceptable
- [ ] Credit logic matches your requirements
- [ ] Stripe integration approach works
- [ ] Dashboard layouts meet expectations
- [ ] Implementation order makes sense

Ready to proceed?

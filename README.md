# SPVMS — Smart Permit Verification & Monitoring System

A full-stack web application for the Department of Home Affairs, South Africa, providing real-time permit verification, issuance, and intelligent monitoring across border checkpoints.

---

## Overview

SPVMS enables Home Affairs officials and enforcement officers to verify visas, residence permits, and work permits instantly by scanning barcodes at border posts. The platform connects issuance, verification, and intelligence in a single, unified system with role-based access control, AI-powered fraud detection, and complete audit trails.

---

## Features

### Core Operations
- **Instant barcode verification** — Scan permit barcodes at checkpoints; receive validated results in under two seconds with full holder details
- **Digital permit issuing** — Create, extend, and revoke visas, residence permits, and work permits from a centralised console
- **Renewal management** — Handle permit renewal requests with status tracking and approval workflows
- **Permit holder portal** — Permit holders can view their own permit status and history

### Monitoring & Intelligence
- **Real-time operations dashboard** — Live metrics on active permits, scan activity, violation hotspots, and expiring permits
- **AI fraud detection** — Automated alerts for repeated expired scans, location anomalies, burst invalid patterns, and suspicious activity
- **Power BI integration** — Embedded Power BI reports for high-level system-wide monitoring and executive reporting
- **Data export** — Export scan records to CSV or JSON with date-range filtering

### Security & Governance
- **Role-based access control** — Three roles: `admin`, `officer`, and `permit_holder`
- **Full audit trail** — Every scan is recorded with timestamp, location, officer identity, and result
- **Account suspension** — Administrators can suspend user accounts
- **User management** — Bulk user import via CSV, role assignment, and profile management

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | [TanStack Start](https://tanstack.com/start) v1 (React 19 full-stack) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4 with custom design tokens |
| State & Data | TanStack Query, Zustand |
| Routing | TanStack Router (file-based) |
| UI Components | shadcn/ui + Radix UI primitives |
| Charts | Recharts |
| Authentication | Firebase Authentication |
| Database | Firebase Firestore |
| Barcode Scanning | @zxing/browser |
| Build Tool | Vite 7 |

---

## Project Structure

```text
src/
  components/          # Reusable UI components, PowerBIPanel, StatusBadge, AppLayout
  components/ui/       # shadcn/ui primitives (Button, Card, Dialog, Table, etc.)
  hooks/               # Custom React hooks
  integrations/        # Supabase integration (auth, client, types)
  lib/                 # Business logic, stores, and Firestore API modules
    api/               # createServerFn server functions
    auth-store.ts      # Zustand auth store (Firebase Auth + Firestore profiles)
    permits-firestore.ts
    scans-firestore.ts
    alerts-firestore.ts
    users-firestore.ts
    renewal-firestore.ts
    settings-firestore.ts
    audit-firestore.ts
  routes/              # TanStack Start file-based routes
    __root.tsx         # Root layout (html/head/body shell)
    index.tsx          # Public landing page
    auth.tsx           # Sign in / register
    _app.tsx           # Authenticated layout guard
    _app.overview.tsx  # Operations dashboard
    _app.verify.tsx    # Barcode scanner / verification
    _app.issue.tsx     # Permit issuance console
    _app.permits.tsx   # Permit management (list, edit, revoke, print)
    _app.alerts.tsx    # AI fraud alerts
    _app.users.tsx     # User administration
    _app.renewals.tsx  # Renewal requests
    _app.scans.tsx     # Scan history
    _app.permit-holder.tsx  # Permit holder self-service
  styles.css           # Tailwind v4 entry + design tokens
  start.ts             # TanStack Start server configuration
```

---

## Getting Started

### Prerequisites
- [Bun](https://bun.sh/) (or Node.js with a compatible package manager)
- A Firebase project with Authentication and Firestore enabled

### Installation

1. Clone the repository and install dependencies:

```bash
bun install
```

2. Configure environment variables in `.env`:

```bash
# Firebase (required)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

# Supabase (for integrations)
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

3. Configure Firestore security rules in `firestore.rules` (see file in repo).

4. Start the development server:

```bash
bun run dev
```

5. Build for production:

```bash
bun run build
```

---

## Authentication & Roles

The system supports three user roles stored in Firestore (`users/{uid}`):

| Role | Description | Access |
|------|-------------|--------|
| `admin` | System administrators | Full access: permits, users, alerts, renewals, issuance |
| `officer` | Field enforcement / checkpoint officers | Permits, alerts, renewals, issuance; no user management |
| `permit_holder` | Individual permit holders | Read-only self-service portal only |

Authentication is handled via Firebase Auth (email/password). All routes under `/_app` are protected; unauthenticated users are redirected to `/auth`.

---

## Data Model

Key Firestore collections:

- **`users`** — Profile, role, suspension status, contact info
- **`permits`** — Permit records with type, status, holder details, validity dates
- **`scans`** — Checkpoint scan events (barcode, result, location, officer, timestamp)
- **`alerts`** — AI-generated fraud alerts with severity and resolution status
- **`renewals`** — Permit renewal requests with documents and approval workflow
- **`audit_logs`** — Immutable audit trail of system actions
- **`settings`** — System configuration including Power BI embed URL

---

## Power BI Integration

Administrators can embed a Power BI report on the Overview dashboard for executive-level monitoring.

1. In Power BI Desktop, build your report and publish to Power BI Service.
2. In Power BI Service, open the report and choose **File → Embed report → Publish to web**.
3. Copy the embed URL (or full iframe snippet).
4. In SPVMS, navigate to **Overview → Configure** (admin-only) and paste the URL.

> **Security note:** "Publish to web" creates a publicly accessible link. Use it only for non-sensitive aggregate dashboards. For sensitive data, use Power BI Embedded with a secure embed token instead.

---

## Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start Vite development server |
| `bun run build` | Production build |
| `bun run build:dev` | Development build |
| `bun run preview` | Preview production build locally |
| `bun run lint` | ESLint check |
| `bun run format` | Prettier formatting |

---

## Deployment

This project is built with TanStack Start and deploys to a serverless edge runtime. Ensure your hosting platform supports:

- Vite 7 builds
- TanStack Start server functions
- Environment variable injection at runtime

Firebase Firestore serves as the primary database and must remain accessible from both the client and server contexts.

---

## License

Proprietary — Department of Home Affairs, Republic of South Africa. Authorised personnel only.

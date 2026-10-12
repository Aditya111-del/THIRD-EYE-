---
name: fullstack-saas-development
description: Architect and construct complete full-stack SaaS applications with API endpoints, database persistence, authentication, and frontend dashboards
tools: [listDir, readFile, writeFile, editFile, runTerminal, openPreview]
---
# Full-Stack SaaS Development Skill

## Goal
Build end-to-end, multi-tier SaaS web applications containing complete frontend interfaces, backend REST/tRPC APIs, database ORM models, user authentication, and billing/subscription models with zero hollow placeholders.

---

## Architecture Principles

### 1. Multi-Tier Structure
```
src/
├── components/          # Reusable UI components (Sidebar, TopNav, DataTable, StatCard)
├── pages/               # Route views (Dashboard, Analytics, Users, Settings, Billing)
├── server/
│   ├── routes/          # Express/Hono/FastAPI routers with typed inputs
│   ├── middleware/      # Auth (JWT/Sessions), CORS, Rate limiting, Request logging
│   └── services/        # Domain business logic (billing, notifications, user management)
├── db/
│   ├── schema.ts        # Prisma, Drizzle, or SQLAlchemy schema definitions
│   └── seed.ts          # Complete seed script populating realistic sample records
├── hooks/               # Custom React hooks (useAuth, useCart, useMetrics)
└── types/               # Shared TypeScript schemas and DTOs
```

### 2. Authentication & Security
- Implement complete sign-in and sign-up forms with client and server validation.
- Hash passwords using `bcrypt` (or `argon2`).
- Issue JWT tokens or session cookies with expiration and refresh token rotation.
- Guard private routes using auth middleware (`requireAuth`).

### 3. Data Flow & State Synchronization
- Use TanStack Query (React Query) or SWR for API cache management, background refetching, and optimistic mutations.
- Centralize app state in Zustand or Redux Toolkit.
- Include complete loading skeletons (`animate-pulse`), error boundaries, and empty state illustrations.

### 4. Interactive SaaS Dashboard Standards
- **Metric Stat Cards**: 4 key KPI cards (e.g. Total Revenue, Active Users, Conversion Rate, Churn) with percentage changes (+14.2% from last month) and sparkline indicators.
- **Interactive Data Table**: Pagination, search filter, column sorting, status badges (`active`, `pending`, `suspended`), and row action menus.
- **Settings & Profile**: Tabs for General, Security, Notifications, Team Members, and API Keys.
- **Billing / Pricing**: Tier cards (Free, Pro, Enterprise) with feature checklist, monthly/yearly toggle, and upgrade action.

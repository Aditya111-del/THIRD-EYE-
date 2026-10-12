---
name: database-and-orm
description: Design normalized database schemas, write migrations, and optimize queries using Prisma, Drizzle, SQLAlchemy, and raw SQL
tools: [listDir, readFile, writeFile, editFile, runTerminal]
---
# Database Architecture & ORM Mastery Skill

## Goal
Design relational and document database schemas, manage seamless migration pipelines, optimize slow queries, and ensure complete data integrity with ACID transactions.

---

## Guidelines

### 1. Schema Design Best Practices
- **Primary Keys**: Use UUIDv4 or CUID2 for distributed scalability, or auto-incrementing BigInt for internal lookup tables.
- **Foreign Keys**: Define explicit foreign key constraints with sensible `onDelete` behaviors (`CASCADE`, `SET NULL`, or `RESTRICT`).
- **Indexes**:
  * Create B-tree indexes on all foreign keys and frequently filtered columns (`status`, `created_at`, `email`).
  * Create composite indexes for multi-column sort/filter patterns (`[tenant_id, status, created_at]`).
- **Timestamps**: Always include `created_at` (default `now()`) and `updated_at` timestamps on all entity tables.

### 2. ORM Patterns (Prisma & Drizzle)
- **Prisma**:
  * Define clean relational models in `schema.prisma`.
  * Run `npx prisma generate` to keep client types in sync.
  * Use interactive transactions (`prisma.$transaction(async (tx) => { ... })`) for multi-table updates.
- **Drizzle ORM**:
  * Write schema in TypeScript (`pgTable`, `sqliteTable`) with type inference.
  * Use the relational query builder (`db.query.users.findMany(...)`) with fine-grained select filtering.

### 3. Realistic Seed Scripts
- Always generate a complete, runnable seed script (`db/seed.ts` or `seeds/dev.py`).
- Populate at least 15–30 realistic, interrelated records (e.g. 5 users, 20 products, 10 orders, 30 line items).
- Ensure seed data is deterministic or idempotent so re-running does not violate unique constraints.

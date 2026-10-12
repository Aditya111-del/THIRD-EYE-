---
name: performance-optimization-profiling
description: Profile, diagnose, and optimize web applications, backend APIs, and database queries for maximum performance
tools: [listDir, readFile, writeFile, editFile, runTerminal]
---
# Performance Optimization & Profiling Mastery Skill

## Core Philosophy: Sub-100ms Responses & 60FPS Fluidity
High performance is not an afterthought; it is a fundamental design constraint. Elite applications load in under 1 second, respond to user inputs in under 50ms, and maintain 60 FPS scrolling and rendering without jank or memory bloat.

---

## 1. Frontend Performance & Core Web Vitals
- **Target Metrics**:
  - **LCP (Largest Contentful Paint)**: < 1.2s
  - **INP (Interaction to Next Paint)**: < 100ms
  - **CLS (Cumulative Layout Shift)**: < 0.05
- **Optimization Techniques**:
  1. **Bundle Budgeting & Code Splitting**:
     - Use dynamic imports (`React.lazy(() => import('./HeavyModal'))`) for non-critical routes and heavy widgets.
     - Analyze bundle sizes (`rollup-plugin-visualizer` or `@next/bundle-analyzer`) to ensure initial bundle < 150KB gzip.
  2. **Render Optimization**:
     - Avoid premature re-renders: Use granular state selectors (`useStore(s => s.item)` instead of reading entire store).
     - Memoize expensive transformations with `useMemo` and stable callbacks with `useCallback`.
     - Virtualize long lists (>50 items) using `@tanstack/react-virtual` or `react-window`.
  3. **Asset & Image Mastery**:
     - Serve modern image formats (WebP/AVIF) with explicit `width` and `height` attributes to prevent CLS layout shift.
     - Lazy load below-the-fold images (`loading="lazy"`).
     - Preload critical fonts with `rel="preload"` and `font-display: swap`.

---

## 2. Backend & API Performance
- **Target Metrics**:
  - P95 response time < 80ms
  - P99 response time < 150ms
- **Optimization Techniques**:
  1. **Connection Pooling**: Always use connection pools for databases (e.g., `pg.Pool`, Prisma pool size configuration) instead of opening fresh connections per request.
  2. **Multi-Layer Caching**:
     - L1: In-memory LRU cache (`lru-cache`) for hot static data (1–5 second TTL).
     - L2: Redis cache with cache-aside pattern for shared read-heavy entity lookups.
     - HTTP Caching: Set explicit `Cache-Control` (`public, max-age=3600, stale-while-revalidate=86400`) and `ETag` headers.
  3. **Payload Optimization**:
     - Enable Brotli / Gzip compression middleware.
     - Stream large datasets with Node.js streams or chunked transfer encoding instead of buffering massive arrays in memory.

---

## 3. Database Query Performance
- **Zero Slow Queries Mandate**:
  - Run `EXPLAIN ANALYZE` on any query touching more than 1,000 rows.
  - Eliminate Sequential Scans on filter columns: Create B-Tree composite indexes matching query WHERE and ORDER BY clauses.
  - Fix N+1 queries: Always use eager loading (`prisma.user.findMany({ include: { posts: true } })`) or data loaders (`DataLoader`).

---

## 4. Production Verification Checklist
1. Inspect bundle sizes after build to ensure zero duplicate packages.
2. Verify all API endpoints return within acceptable latency thresholds.
3. Check memory stability under load testing to ensure zero memory leaks.

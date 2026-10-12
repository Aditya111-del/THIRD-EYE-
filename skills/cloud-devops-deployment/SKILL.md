---
name: cloud-devops-deployment
description: Containerize applications with Docker, author CI/CD GitHub Actions pipelines, and prepare production deployments
tools: [listDir, readFile, writeFile, editFile, runTerminal]
---
# Cloud, DevOps & Deployment Skill

## Goal
Prepare applications for automated, reproducible cloud deployment using multi-stage Docker builds, docker-compose environments, GitHub Actions CI/CD workflows, and production configuration best practices.

---

## Directives

### 1. Multi-Stage Dockerfile Patterns
- Always separate build dependencies from runtime dependencies:
  ```dockerfile
  # Build Stage
  FROM node:20-alpine AS builder
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci
  COPY . .
  RUN npm run build

  # Production Runtime Stage
  FROM node:20-alpine AS runner
  WORKDIR /app
  ENV NODE_ENV=production
  COPY --from=builder /app/package*.json ./
  RUN npm ci --omit=dev
  COPY --from=builder /app/dist ./dist
  USER node
  EXPOSE 3000
  CMD ["node", "dist/index.js"]
  ```
- Always include `.dockerignore` ignoring `node_modules`, `.git`, `.env*`, and build caches.

### 2. Multi-Service Local Environments (`docker-compose.yml`)
- Define local application, database (PostgreSQL/MySQL), cache (Redis), and reverse proxy (Nginx).
- Configure persistent volume mounts for database data.
- Use explicit health checks to ensure dependencies boot in correct sequence.

### 3. GitHub Actions CI/CD Workflows (`.github/workflows/ci.yml`)
- Automate linting, unit test execution, and production builds on push to `main` and pull requests.
- Cache dependencies (`actions/cache` or `actions/setup-node` with `cache: 'npm'`).

---
name: api-backend-engineering
description: Design, implement, and optimize high-throughput REST and GraphQL backend microservices across Node.js, Python, Go, and Rust
tools: [listDir, readFile, writeFile, editFile, runTerminal]
---
# API & Backend Engineering Skill

## Goal
Build production-ready, resilient backend web services and REST/GraphQL APIs adhering to 12-factor application standards, strict input validation, layered architecture, and enterprise error handling.

---

## Polyglot Framework Guidelines

### 1. Node.js / TypeScript (Express, Fastify, Hono, NestJS)
- **Layered Architecture**:
  * `routes/`: Map HTTP verbs to controller actions.
  * `controllers/`: Parse and validate incoming requests using Zod schemas (`req.body`, `req.query`, `req.params`).
  * `services/`: Encapsulate core business logic and third-party integrations.
  * `repositories/`: Abstract database interactions.
- **Error Handling Middleware**: Global error interceptor returning standard envelope:
  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION_FAILED",
      "message": "Invalid email address format",
      "details": []
    }
  }
  ```
- **Health Checks & Graceful Shutdown**: Expose `GET /health` with memory, uptime, and database ping. Intercept `SIGTERM` / `SIGINT` to gracefully drain connections.

### 2. Python (FastAPI, Flask)
- Use Pydantic v2 schemas for request and response models with strict typing.
- Dependency injection for database sessions (`Depends(get_db)`) and authentication tokens (`Depends(get_current_user)`).
- Asynchronous route handlers (`async def`) for non-blocking I/O operations.

### 3. Go (Gin, Fiber, Chi)
- Structure: `cmd/api/main.go`, `internal/handler/`, `internal/service/`, `internal/repository/`, `pkg/`.
- Strict error checking: Return wrapped errors with context (`fmt.Errorf("failed fetching user %d: %w", id, err)`).
- Context propagation: Pass `context.Context` through every database query and outbound HTTP call.

### 4. Rust (Axum, Actix-web)
- Safe concurrency, type-safe route extractors (`Path`, `Query`, `Json`), and error enums implementing `IntoResponse`.

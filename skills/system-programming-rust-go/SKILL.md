---
name: system-programming-rust-go
description: Develop high-performance, concurrent, memory-safe systems and microservices in Rust and Go
tools: [listDir, readFile, writeFile, editFile, runTerminal]
---
# Systems Programming in Rust & Go Mastery Skill

## Core Philosophy: Maximum Throughput, Zero Regressions, Memory Safety
When engineering systems, CLI utilities, low-latency microservices, or networking tools in Rust or Go, the code must achieve maximum throughput, zero memory leaks, and crystal-clear concurrent safety. Adhere strictly to the idiomatic idioms of each language.

---

## 1. Rust Best Practices (Idiomatic Rust)
- **Project Structure (Cargo)**:
  - `Cargo.toml`: Explicit dependencies, feature flags, release optimization profiles (`opt-level = 3`, `lto = true`, `codegen-units = 1`).
  - `src/main.rs` / `src/lib.rs`: Clean boundary separation.
  - `src/domain/`, `src/services/`, `src/adapters/`, `src/errors.rs`.
- **Error Handling**:
  - Never use `.unwrap()` or `.expect()` in production paths. Use `thiserror` for library domain errors and `anyhow` for top-level application error context.
  - Propagate errors with the `?` operator cleanly.
- **Concurrency & Async**:
  - Use `tokio` with `#[tokio::main]`.
  - Prefer message passing via `tokio::sync::mpsc` channels over shared mutable state.
  - When shared state is necessary, use `Arc<RwLock<T>>` or `Arc<Mutex<T>>` with minimal lock contention windows.
- **Serialization & Web**:
  - Use `serde` with `#[derive(Serialize, Deserialize)]`.
  - For HTTP microservices, use `axum` with layered towers (TraceLayer, CorsLayer, TimeoutLayer).

---

## 2. Go Best Practices (Idiomatic Go)
- **Project Structure**:
  - Standard Go layout: `cmd/<app>/main.go`, `internal/service/`, `internal/repository/`, `internal/model/`, `pkg/`.
  - `go.mod` and `go.sum` properly synced (`go mod tidy`).
- **Error Handling**:
  - Always check `if err != nil`. Wrap errors with context: `fmt.Errorf("reading config file %s: %w", path, err)`.
  - Never silently swallow errors or print them without returning or handling.
- **Concurrency**:
  - Manage goroutines with `sync.WaitGroup` or `golang.org/x/sync/errgroup`.
  - Always provide cancellation via `context.Context` (`ctx, cancel := context.WithTimeout(...)`).
  - Prevent goroutine leaks: every spawned goroutine must have a defined exit trigger via context or channel closure.
- **Web & Microservices**:
  - Use standard library `net/http` or lightweight routers like `chi` / `gin`.
  - Implement graceful shutdown listening for `os.Interrupt` and `syscall.SIGTERM`.

---

## 3. Production Verification Checklist
1. **Rust**:
   - Run `cargo check` and `cargo clippy -- -D warnings` to enforce zero warnings.
   - Run `cargo test` to verify unit and integration tests.
2. **Go**:
   - Run `go vet ./...` and `golangci-lint run`.
   - Run `go test -race ./...` to verify zero data races under concurrent execution.
   - Verify binary builds cleanly: `go build -o bin/app ./cmd/...`.

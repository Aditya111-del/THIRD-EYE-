---
name: debugging-diagnostics
description: Diagnose complex runtime stack traces, memory leaks, TypeScript compilation failures, port conflicts, and backend crashes
tools: [runTerminal, readFile, searchCode, editFile, listDir]
---
# Debugging & Root Cause Analysis (RCA) Skill

## Goal
Rapidly diagnose, isolate, and resolve tricky software bugs, runtime crashes, TypeScript compiler errors, port collisions, and logic regressions with mathematical precision.

---

## 4-Step RCA Methodology

### 1. Ingest & Isolate the Exact Trace
- Read error output verbatim: Do not guess or assume.
- Find the root cause frame in the stack trace (ignore node internals or framework plumbing).
- Inspect the offending source code around the exact line using `readFile`.

### 2. Formulate Hypothesis & Test
- Check common culprits:
  * Undefined/null property access (`cannot read properties of undefined`).
  * Type mismatches or unhandled asynchronous promise rejections.
  * Port already in use (`EADDRINUSE`): Find PID via `lsof -i :<port>` and kill with `kill -9 <pid>`.
  * Missing package dependencies or misconfigured import aliases (`tsconfig.json` paths).

### 3. Surgical Atomic Hotfix
- Use `editFile` with exact character matching.
- Fix the root bug, not just the symptom (e.g. guard with nullish coalescing `?.` and fallback defaults, or correct the invalid data flow).
- Never introduce new unrelated mutations during a bugfix pass.

### 4. Verification Pass
- Re-run the failing command or test using `runTerminal`.
- Verify the error is completely eliminated with exit code 0.

---
name: enterprise-project-scaffolding
description: Architect, scaffold, and configure enterprise multi-package repositories and clean architectures with zero placeholder stubs
tools: [listDir, readFile, writeFile, editFile, runTerminal]
---
# Enterprise Project Scaffolding Skill

## Goal
Architect robust, scalable, enterprise-grade project layouts for complex codebases in any programming language, adhering to Clean Architecture principles, strict separation of concerns, and zero empty files.

---

## Architecture Principles

### 1. Clean Architecture Layering
```
project-root/
├── core/ / domain/      # Pure business entities, domain interfaces (zero external dependencies)
├── use-cases/ / app/    # Application workflows and orchestrators
├── infrastructure/      # Database drivers, HTTP clients, third-party adapters
└── presentation/ / api/ # Web controllers, UI components, CLI commands
```

### 2. Mandatory Scaffolding Completeness
- Every scaffolded project MUST include:
  1. **Working Manifest**: Complete `package.json` (or `pyproject.toml`, `Cargo.toml`, `go.mod`) with exact working scripts (`dev`, `build`, `test`, `lint`).
  2. **Configuration Files**: Correct `tsconfig.json`, `.gitignore`, `eslint.config.js`, `.env.example`.
  3. **Documentation**: Clear `README.md` with prerequisites, architecture diagram, and setup instructions.
  4. **Working End-to-End Demo**: A fully functional runnable entrypoint proving all layers work together smoothly on turn one.

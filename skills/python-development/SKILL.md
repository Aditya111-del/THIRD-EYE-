---
name: python-development
description: Expert Python engineering, virtual environments, FastAPI/Flask backends, async programming, data pipelines, and pytest testing
tools: [runTerminal, readFile, writeFile, editFile, listDir]
---
# Python Development & Engineering Mastery Skill

## Goal
Build, debug, and maintain production-grade Python code adhering to PEP 8 standards, static type hints (`mypy`), async I/O patterns, robust dependency isolation, and pytest suites.

---

## Directives

### 1. Environment & Dependency Management
- Always check if a virtual environment exists (`.venv`, `venv`, or `env`).
- Never install packages globally: activate or execute via `.venv/bin/python` or `.venv/bin/pip`.
- Declare dependencies in modern `pyproject.toml` (Poetry/Hatch/Flit) or `requirements.txt`.

### 2. Modern Python Standards
- Type annotations: Annotate all function signatures with `typing` (`Optional[T]`, `List[T]`, `Union[A, B]` or Python 3.10+ union `A | B`).
- Data structures: Prefer `@dataclass(slots=True)` or Pydantic `BaseModel` over raw untyped dictionaries.
- Async I/O: Use `asyncio` and `httpx` / `aiohttp` for concurrent network and file operations.

### 3. Testing with Pytest
- Structure tests in `tests/test_*.py`.
- Use pytest fixtures for mock databases, API clients, and temporary file directories (`tmp_path`).
- Run tests via `.venv/bin/pytest -v`.

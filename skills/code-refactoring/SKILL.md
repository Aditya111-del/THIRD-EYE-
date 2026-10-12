---
name: code-refactoring
description: Perform safe, atomic refactoring and clean architecture migrations across the codebase
tools: [searchCode, readFile, editFile, writeFile, runTerminal]
---
# Code Refactoring Skill

## Goal
Safely refactor functions, classes, and modules while keeping all existing tests passing.

## Guidelines
1. **Discover Call Sites**: Always search for all references using `searchCode` before renaming or changing signatures.
2. **Inspect Context**: Read the entire file buffer with `readFile` before proposing changes.
3. **Plan First**: Formulate an atomic step-by-step plan.
4. **Safe Edits**: Use `editFile` to propose minimal, clean diffs. Never wipe out unrelated code.
5. **Session Verification**: Run `runTerminal` to execute tests and ensure zero regressions.

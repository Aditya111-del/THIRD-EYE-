# THIRD EYE Agent Guidelines

This frontend forms the user interface of **THIRD EYE**. It is integrated with:
- `electron/`: The Electron desktop wrapper and native PTY engine.
- `backend/pty-service`: The PTY microservice on port 4001.
- `backend/ai-service`: The AI microservice on port 4002.

When editing:
- Keep the terminal state synchronized with `useTerminalSession`.
- Maintain strict TypeScript safety and compatibility with Tailwind and Radix UI.

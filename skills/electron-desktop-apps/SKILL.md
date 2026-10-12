---
name: electron-desktop-apps
description: Build secure, cross-platform Electron desktop applications with React, Vite, native window menus, and PTY processes
tools: [listDir, readFile, writeFile, editFile, runTerminal]
---
# Electron Desktop Applications Skill

## Goal
Build production-grade, secure Electron applications with seamless frontend integration, robust IPC communication, native desktop window controls, and system integrations.

---

## Architecture & Security Rules

### 1. IPC Security Mandates
- **Context Isolation**: Always configure `webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }`.
- **Preload Bridge**: Expose safe, typed APIs through `contextBridge.exposeInMainWorld('electronAPI', { ... })`.
- **IPC Handlers**: Use `ipcMain.handle` / `ipcRenderer.invoke` for asynchronous request-response flows.
- **Strict Channel Whitelisting**: Never allow renderer to send arbitrary bash commands or raw filesystem write calls without path verification inside workspace root.

### 2. Main Process Architecture
- **Window Management**: Remember window bounds across restarts.
- **Menu Bar**: Provide native application menus (File, Edit, View, Window, Help) with native macOS and Windows shortcuts (`CmdOrCtrl+Q`, `CmdOrCtrl+W`, `CmdOrCtrl+S`).
- **Tray & Background Tasks**: System tray support with context menu for quick actions.
- **Graceful Cleanup**: Cleanly kill spawned child processes, PTY nodes, and HTTP servers on `before-quit` or `window-all-closed`.

---
name: e2e-testing
description: Author and execute robust End-to-End, unit, and integration tests with Playwright, Cypress, Vitest, and Jest
tools: [searchCode, readFile, writeFile, editFile, runTerminal]
---
# E2E & Integration Testing Skill

## Goal
Author resilient unit, integration, and end-to-end tests covering critical business paths, user interactions, edge cases, and API error states with zero flaky assertions.

---

## Testing Hierarchy

### 1. Unit & Integration Testing (Vitest / Jest)
- Co-locate tests alongside components (`Button.test.tsx`, `authService.spec.ts`) or in `tests/`.
- Test user interactions via `@testing-library/react` (clicking buttons, typing into inputs, submitting forms).
- Query elements using accessible role selectors (`screen.getByRole('button', { name: /add to cart/i })`).
- Mock network requests cleanly with MSW (Mock Service Worker) or `vi.fn()` / `jest.fn()`.

### 2. End-to-End Testing (Playwright / Cypress)
- Write full end-to-end user journeys (e.g. browsing the menu, adding an item to the cart, opening the checkout modal, filling details, placing order, verifying toast).
- Use resilient locators: `page.getByRole()`, `page.getByLabel()`, `page.getByPlaceholder()`. Avoid brittle CSS selectors like `div > span:nth-child(3)`.
- Assert visible states: `await expect(page.getByText('Order Placed Successfully')).toBeVisible()`.

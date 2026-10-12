---
name: state-management-and-data-flow
description: Master client-side and server-side state architectures using Zustand, Redux Toolkit, TanStack Query, and persistent storage
tools: [listDir, readFile, writeFile, editFile]
---
# State Management & Data Flow Architecture Skill

## Goal
Implement robust, predictable, and scalable state management patterns in modern applications with zero state synchronization bugs, zero memory leaks, and optimal rendering performance.

---

## State Patterns

### 1. Zustand (Lightweight & High-Performance)
- Store separation: Create small, focused stores (e.g. `useCartStore`, `useAuthStore`, `useUiStore`).
- State slices: Combine slices cleanly using the slice pattern:
  ```ts
  export const useCartStore = create<CartState>()(
    persist(
      (set, get) => ({
        items: [],
        addItem: (item) => set((state) => {
          const existing = state.items.find((i) => i.id === item.id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity: 1 }] };
        }),
        removeItem: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
        clearCart: () => set({ items: [] }),
      }),
      { name: 'app_cart_storage' }
    )
  );
  ```
- Granular Selectors: Always select specific properties to prevent unnecessary component re-renders:
  `const itemsCount = useCartStore((s) => s.items.length);`

### 2. TanStack Query (Server State & Caching)
- Never mix server cache into global client stores.
- Use query keys with array parameters: `['todos', { filter: activeTab }]`.
- Implement optimistic updates for instant UI feedback with automatic rollback on network failure.

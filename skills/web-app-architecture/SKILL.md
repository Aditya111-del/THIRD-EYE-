---
name: web-app-architecture
description: Architect, scaffold, and implement complete, visually stunning, production-grade web applications and frontend sites
tools: [listDir, readFile, writeFile, editFile, runTerminal, openPreview]
---
# Web Application Architecture & Modern Frontend Mastery Skill

## Core Philosophy: World-Class Engineering & Aesthetics
When building any web application or site (e-commerce, SaaS, dashboard, food delivery, landing page, portfolio), the application must look like a **million-dollar product** crafted by elite design engineers. It must feel like a technical miracle that outclasses Cursor and Antigravity.

---

## 1. Zero-Stub & Strict Completeness Mandate
- **NEVER create empty files (0 bytes)** or files with just `export {};`. Every created file must contain complete, functional code.
- **FORBIDDEN placeholders**: Never write `// TODO: implement later`, `// add more items here`, or truncated code blocks.
- **Full Scope Execution**: Every web app MUST include:
  1. **Responsive Navbar**: Brand logo, navigation links, search input, active badges, theme toggle, cart/user buttons.
  2. **Hero Section**: Catchy title, subtitle, badges, call-to-action buttons, background gradients or subtle radial glows.
  3. **Data / Product Grid**: 8–16 rich, realistic items with real high-res Unsplash image URLs, prices, category tags, ratings, star counts, reviews, and interactive action buttons.
  4. **Category / Filter Tabs & Search Bar**: Live filtering by category, search text, and sorting (price, popularity, rating).
  5. **Interactive Cart / Action Drawer**: Slide-over or modal with quantity increment/decrement, item removal, tax/subtotal calculation, empty state, and checkout action.
  6. **Interactive Detail & Checkout Modals**: Item customization (sizes, toppings, options), checkout form with validation, and order confirmation toasts.
  7. **Footer**: Social links, newsletter subscription, copyright, navigation columns.
  8. **State Persistence**: Persist cart and user preferences in `localStorage` so refreshing does not reset the user's progress.

---

## 2. Visual Excellence & Aesthetic Design Standards
- **Strictly FORBIDDEN**: Raw default browser HTML (Times New Roman, unstyled tables, default blue links, raw `<button>` elements, plain `border: 1px solid black`).
- **Curated Color Palettes**:
  - *Food / Lifestyle (e.g. Milkshake, Bakery, Cafe)*: Rich strawberry pink (`#F43F5E`), chocolate cream (`#78350F`), vanilla gold (`#FBBF24`), soft cream backgrounds (`#FFFBEB` or `#18181B`).
  - *Tech / SaaS / Enterprise*: Sleek dark-mode slate/zinc (`#090A0F`, `#12131A`, `#1E202E`) with electric violet (`#8B5CF6`) and cyan accents (`#06B6D4`).
- **Typography**: Inter, Outfit, Plus Jakarta Sans, or Poppins with distinct weights, tracked letter spacing, and clear font hierarchy (`text-3xl font-extrabold`, `text-sm font-medium`, `text-xs text-zinc-400`).
- **Micro-Animations & Depth**:
  - Smooth hover lifts: `hover:-translate-y-1 hover:shadow-xl transition-all duration-300`.
  - Glassmorphic card styling: `backdrop-blur-md bg-white/70 dark:bg-zinc-900/80 border border-white/20 dark:border-white/10 shadow-lg`.
  - Badges: `inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold`.
  - Active button states: `active:scale-95 transition-transform`.

---

## 3. High-Resolution Real Assets (Unsplash)
Always use real, high-resolution photography URLs from Unsplash for products and heroes:
- Milkshakes: `https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=80`
- Chocolate: `https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&w=600&q=80`
- Strawberry: `https://images.unsplash.com/photo-1553787499-6f9133860278?auto=format&fit=crop&w=600&q=80`
- Smoothies: `https://images.unsplash.com/photo-1505252585461-04db1eb84625?auto=format&fit=crop&w=600&q=80`
Never use broken local paths like `/images/shake1.jpg` unless confirmed existing on disk.

---

## 4. Execution Workflow
1. **Analyze**: Inspect directory with `listDir` and check `package.json` with `readFile`.
2. **Scaffold Foundation**: Ensure styling tokens (Tailwind / CSS variables) and fonts are in place.
3. **Data Layer**: Create `types.ts` and `data/items.ts` with complete, rich data.
4. **Components**: Build components in separate modular files (`Navbar.tsx`, `Hero.tsx`, `ProductCard.tsx`, `CartDrawer.tsx`, `CheckoutModal.tsx`).
5. **Assemble & Wire State**: Connect everything in the main view with interactive state.
6. **Verify**: Ensure zero compile errors, verify all files are non-empty, and verify dev server responds on localhost.

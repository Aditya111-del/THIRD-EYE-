---
name: mobile-app-development
description: Architect, scaffold, and implement world-class mobile applications using React Native, Expo, and Flutter
tools: [listDir, readFile, writeFile, editFile, runTerminal]
---
# Mobile Application Development Mastery Skill

## Core Philosophy: 60FPS Native Experience & Pixel-Perfect Design
When engineering mobile applications (iOS and Android), the end result must feel indistinguishable from top-tier native applications (Airbnb, Linear, Cash App). It must run smoothly at 60 FPS, handle edge cases (offline state, screen rotation, safe areas), and adhere to human interface and Material 3 design guidelines.

---

## 1. Zero-Stub & Complete Implementation Mandate
- **NEVER create empty placeholder screens** or stub navigation routes.
- **FORBIDDEN placeholders**: Never write `// TODO: add forms here` or blank placeholder views.
- **Full Architecture Requirements**:
  1. **Navigation Structure**: Clean stack and tab navigation (Expo Router / React Navigation). Deep linking ready.
  2. **Safe Area & Responsive Layout**: Strict use of `SafeAreaView` and responsive dimensions (`useWindowDimensions`, flexbox). Never overlap status bars or home indicators.
  3. **Theme Engine**: Seamless Light/Dark mode tokens for background, card, text, border, and brand colors.
  4. **Smooth Gestures & Micro-Interactions**: Use `react-native-reanimated` or `Animated` with spring configurations. Touch feedback on all interactable elements (`Pressable` with opacity / scale press feedback).
  5. **Rich Mock Data & Offline Storage**: Complete, realistic datasets with high-res cached images, persistent storage (`AsyncStorage`, `expo-sqlite`, or `MMKV`).
  6. **Network & Error Boundaries**: Graceful pull-to-refresh (`RefreshControl`), shimmer skeleton loading states, and offline retry banners.

---

## 2. Best Practices by Framework

### Expo / React Native
- Structure with Expo Router:
  - `app/_layout.tsx` (Root Provider, theme, font loading, stack)
  - `app/(tabs)/_layout.tsx` (Bottom tab bar with icons & badges)
  - `app/(tabs)/index.tsx`, `explore.tsx`, `profile.tsx`
  - `components/` (Card, Button, Input, Modal, Shimmer)
  - `store/` (Zustand or Redux store with persistence)
  - `types/` (TypeScript interfaces for all models and route params)
- Always verify dependencies: Check `app.json` / `package.json` for compatible SDK versions.
- Fast lists: Use `FlashList` or properly tuned `FlatList` with `keyExtractor`, `getItemLayout`, and memoized render items.

### Flutter (Dart)
- Structure:
  - `lib/core/` (Theme, constants, network, error handlers)
  - `lib/features/<feature>/` (Presentation, domain, data / repository)
  - Use Riverpod or Bloc for predictable state management.
  - Strict Null Safety: No unhandled nulls or forced `!` operators without assertions.

---

## 3. Production Verification Checklist
1. All screens are fully interactive (cards can be tapped, forms can be typed in, tabs switch seamlessly).
2. Keyboard handling: Use `KeyboardAvoidingView` or `react-native-keyboard-controller` so inputs are never obstructed.
3. No build or lint errors: Run `npx tsc --noEmit` or `flutter analyze` to guarantee zero compilation errors.

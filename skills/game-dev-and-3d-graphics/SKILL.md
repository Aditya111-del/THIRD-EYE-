---
name: game-dev-and-3d-graphics
description: Architect and implement interactive 2D/3D games, Three.js scenes, WebGL shaders, Canvas animations, and immersive experiences
tools: [listDir, readFile, writeFile, editFile, runTerminal, openPreview]
---
# Game Development & 3D Web Graphics Mastery Skill

## Core Philosophy: 60FPS Immersive Experiences & Visual Spectacle
When building browser games, 3D interactive visualizations, or WebGL experiences, the visual aesthetic must be breathtaking, silky smooth (locked at 60–120 FPS), and responsive to player input with zero input lag.

---

## 1. Zero-Stub & Implementation Mandate
- **NEVER create empty canvas stubs** or static scenes without animation loops.
- **Full Architecture Requirements**:
  1. **Deterministic Game Loop**: Fixed timestep or delta-time scaling (`requestAnimationFrame` with `deltaTime = Math.min(dt, 0.1)`) so movement is frame-rate independent.
  2. **Lighting & Atmosphere**: High-end lighting setup (Ambient light + Directional light with soft shadows + Hemisphere light + Bloom / Vignette post-processing where appropriate).
  3. **Materials & Shaders**: PBR (Physically Based Rendering) materials (`MeshStandardMaterial` / `MeshPhysicalMaterial`) with roughness, metalness, and environment map reflections.
  4. **Camera Controls & Viewports**: Smooth OrbitControls or custom first/third-person camera controllers with mouse dampening (`dampingFactor: 0.05`).
  5. **HUD & User Interface**: High-contrast, futuristic or arcade HUD (Score, Health, Level, Speedometer, Pause Menu, Sound Toggle) styled with modern overlays.
  6. **Audio & Particles**: Web Audio API sound effects (synthesized or loaded) and particle systems (explosions, sparks, smoke, stars) using GPU instanced meshes.
  7. **Clean Asset Preloading**: Loading screen with a real progress bar (`THREE.LoadingManager` or React Suspense) before rendering the interactive world.

---

## 2. Framework Guidelines

### Three.js / React Three Fiber (R3F)
- **Scene Hierarchy**:
  - `Scene`, `PerspectiveCamera`, `WebGLRenderer` with `antialias: true`, `powerPreference: "high-performance"`.
  - Color space: Set `renderer.outputColorSpace = THREE.SRGBColorSpace;` and `renderer.toneMapping = THREE.ACESFilmicToneMapping;`.
- **Memory Management**:
  - Always clean up on unmount: dispose of geometries, materials, and textures (`geometry.dispose()`, `material.dispose()`, `texture.dispose()`).
  - Use InstancedMesh (`THREE.InstancedMesh`) for rendering hundreds/thousands of identical objects in a single draw call.

### 2D Canvas Games (HTML5 / PixiJS)
- Use object pooling for bullets, enemies, and particles to prevent Garbage Collection (GC) pauses.
- Spatial partitioning (Grid or QuadTree) for collision detection instead of $O(N^2)$ brute-force checks.

---

## 3. Production Verification Checklist
1. Responsive Resize: Window resize listener updates camera aspect ratio and renderer size (`camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h)`).
2. Input Handling: Keyup, keydown, touch, and mouse listeners properly bound and cleaned up.
3. Performance: Zero memory leaks during level transitions; draw calls minimized.

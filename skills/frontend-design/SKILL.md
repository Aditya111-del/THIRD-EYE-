---
name: frontend-design
description: Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one. Helps with aesthetic direction, typography, and making choices that don't read as templated defaults.
license: Complete terms in LICENSE.txt
tools: [listDir, readFile, writeFile, editFile, runTerminal, openPreview]
---
# Frontend Design Mastery Skill

## Core Philosophy: Distinctive, Studio-Lead Visual Identity
Approach this as the design lead at a design studio known for giving every client a distinct visual identity that is not mistaken for anyone else's. This client has already rejected proposals that felt cliché or templated, and is paying for a distinctive point of view: make deliberate, opinionated choices about palette, typography, and layout that are specific to this brief, and take aesthetic risk if justified.

---

## 1. Ground Your Designs in the Subject Matter
If the brief does not identify what the product or subject matter is, identify it yourself before designing, and confirm with the client. You can come up with one concrete subject, the design's audience, and the design's primary job, as a proposal. If there's any information in your memory about the client's preferences or context about what they're building, use that as a hint. The subject's industry, subject matter, materials, and vernacular are where distinctive visual choices come from — a design for a toy for girls aged 8–11 will be very aesthetically different from a dashboard for financial analysts. Build with the brief's real content and subject matter throughout.

---

## 2. Design Principles

### Hero Section Deliberation
For web designs, the hero is the first thing viewers will see. Open with the most characteristic thing in the subject's world, in the form that is most appropriate: a headline, an image, an animation, a live demo, an interactive moment, or other treatments. Be deliberate with your choice: a big number with a small label, supporting stats, and a gradient accent is the default treatment, so only use it if that's truly the best option.

### Typography Carries Personality
- Typography carries the personality of the page. You don't need a different typeface for display or headline text and body content: use one family or two, and if two, make them clearly distinct.
- Choose your typefaces deliberately, not the default families you would reach for on any other project, and set a clear type scale following the guidance of *The Elements of Typographic Style* with intentional weights, widths, and spacing.
- When type is used as a headline or visual element, use the type treatment itself as an active part of the design, not a neutral delivery vehicle for the content.
- Default to line lengths of less than 80 characters. Serif typefaces can have slightly longer line lengths; give serif body text slightly more line-height than a sans-serif.

### AVOID Common AI-Generated Typographic Tells
These default typographic treatments are the commonest tells of an AI-generated page:
1. Accenting just a single word or phrase in a headline (e.g. putting one word in italic/bold or a different color).
2. Using all caps for labels.
3. Adding unnecessary typographic labels above content.

### Visual Structure is Information
Structural devices like outlines, borders, numbering, eyebrows, dividers, labels, etc., encode useful information about the content rather than decorate it. Many generic designs use numbered markers (`01 / 02 / 03`), but that's only appropriate if the content actually is a sequence — like a stepped process or a timeline. Before adding numbered markers, check the content really is a sequence.

### Motion: Intentional & Answered
Use non-user-triggered motion sparingly and deliberately, only to draw attention. A single orchestrated moment — one page-load sequence or one reveal — lands better than scattered effects; fade-and-slide-up entrances on each section and hover transitions on every card are the generic default and read as AI-generated. Motion that answers a person's action (opening, expanding, confirming) is welcome when it shows what changed.

---

## 3. Process: Plan, Review, Build, Critique

### Calibration: Avoid Generic AI Clichés
For calibration, AI-generated design right now clusters around these tells:
- A warm cream background (near `#F4F1EA`) with a high-contrast serif display and a terracotta/warm-clay accent (near `#D97757` — Anthropic Claude interaction accent).
- A near-black background with a single bright acid-green or vermilion accent.
- A broadsheet-style layout with hairline rules, zero border-radius, and dense newspaper-like columns.
- The SaaS-card kit: content chopped into identical rounded cards, one border-radius on everything regardless of hierarchy, the same soft grey shadow (`rgba(0,0,0,.1)`) under each, and gradient washes as decoration.
- Template chrome that appears whatever the subject: a tracked-out ALL-CAPS eyebrow label above every heading; meta strings joined with middle dots (`'A · B · C'`); labels built as `'WORD — fragment'` with a spaced em dash; tinted near-black (`#0B0B0B`, `#111`) standing in for black; a monospace face for small data labels; a `'→'` appended to link and button text.

Where the brief pins down a visual direction, follow it exactly. Where it leaves an axis free, do NOT spend that freedom on these defaults.

### Two-Pass Workflow
1. **Pass 1: Brainstorm a Short Design Plan**
   - **Color**: Describe the core base palette as 4–6 named hex values tailored to the subject.
   - **Type**: The typefaces and their distinct roles.
   - **Layout**: A layout concept using one-sentence prose descriptions and ASCII wireframes to ideate and compare. Include alignment guidance (left-aligned, center-aligned, justified).
   - **Principles**: High-level guidance for what makes this page unique.
2. **Review Against the Brief**:
   - If any part reads like the generic default you would produce for any similar page, revise that part, state what changed and why.
3. **Pass 2: Build & Code**:
   - Write clean, non-conflicting CSS. Be careful of structuring CSS selector specificities so classes don't cancel each other out (especially with `.section` vs `.cta` padding/margin).

---

## 4. Restraint & Self-Critique
Spend your boldness in one place. Let one element be the memorable thing, keep everything around it quiet and disciplined, and cut any decoration that does not serve the brief. Build to a quality floor without announcing it: responsive down to mobile, visible keyboard focus, reduced motion respected, visually accessible, harmonious color palettes.
*Consider Chanel's advice*: Before leaving the house, take a look in the mirror and remove one accessory.

---

## 5. Writing & Microcopy in Design
Words appear in a design for one reason: to make it easier to understand and use. They are design content, not decoration. Bring the same intentionality and minimalism to copywriting that you would bring to spacing and color.
- **End-User Perspective**: Name things by what users will understand in simple language, not by how the system is built (e.g. manage notifications, not webhook config).
- **Active Voice**: A CTA says exactly what happens: "Save changes," not "Submit." An action keeps the same name throughout (the button that says "Publish" produces a toast that says "Published").
- **Direction over Mood for Errors & Emptiness**: Explain what went wrong and how to fix it in the interface's voice. Errors don't apologize and are never vague. An empty screen is an invitation to act.
- **Conversational Tone**: Plain verbs, sentence case, no filler, matched to the brand and audience. Let each written element do exactly one job.

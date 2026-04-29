---
name: amauta-design
description: Sistema de diseño de Amauta Inversiones extraído de amautainversiones.com con la extensión designMD (TypeUI). Fuente de verdad para tokens visuales (colores, tipografía, spacing, radius, shadows, motion) en este proyecto. Usar siempre que se cree o modifique UI en monitor-fci-amauta para garantizar consistencia con el sitio público.
---

<!-- TYPEUI_SH_MANAGED_START -->

# Amauta Inversiones — Design System (extraído de amautainversiones.com)

## Mission
Deliver implementation-ready design-system guidance for the Monitor FCIs dashboard that mirrors the visual language of amautainversiones.com.

## Brand
- Product/brand: Amauta Inversiones Financieras
- URL: https://amautainversiones.com/
- Audience: authenticated users and operators (asesores, mesa, clientes)
- Product surface: dashboard web app

## Style Foundations
- Visual style: structured, accessible, implementation-first
- Main font style: `font.family.primary=Fira Sans`, `font.family.stack=Fira Sans, Helvetica, Arial, Lucida, sans-serif`, `font.size.base=20px`, `font.weight.base=800`, `font.lineHeight.base=20px`
- Typography scale: `font.size.xs=13px`, `font.size.sm=14px`, `font.size.md=15px`, `font.size.lg=16px`, `font.size.xl=17px`, `font.size.2xl=20px`, `font.size.3xl=21px`, `font.size.4xl=22px`
- Color palette: `color.surface.base=#000000`, `color.text.secondary=#621044`, `color.text.tertiary=#666666`, `color.text.inverse=#ffffff`, `color.surface.raised=#f3cf11`, `color.surface.strong=#231f20`
- Spacing scale: `space.1=6.6px`, `space.2=8px`, `space.3=10px`, `space.4=11px`, `space.5=14px`, `space.6=16px`, `space.7=18px`, `space.8=20px`
- Radius/shadow/motion tokens: `radius.xs=3px`, `radius.sm=5px` | `shadow.1=rgba(0, 0, 0, 0.3) 0px 12px 18px -6px` | `motion.duration.instant=200ms`, `motion.duration.fast=300ms`, `motion.duration.normal=400ms`

## Accessibility
- Target: WCAG 2.2 AA
- Keyboard-first interactions required.
- Focus-visible rules required.
- Contrast constraints required.

## Writing Tone
concise, confident, implementation-focused. Spanish formal "usted" for client-facing copy.

## Rules: Do
- Use semantic tokens, not raw hex values in component guidance.
- Every component must define required states: default, hover, focus-visible, active, disabled, loading, error.
- Responsive behavior and edge-case handling should be specified for every component family.
- Accessibility acceptance criteria must be testable in implementation.
- Mantener disclaimer CNV 1029 visible en footer (legal, no decorativo).

## Rules: Don't
- Do not allow low-contrast text or hidden focus indicators.
- Do not introduce one-off spacing or typography exceptions.
- Do not use ambiguous labels or non-descriptive actions.
- No usar radios mayores a 5px (excepto pill/circular en avatares); el sitio es conservador.

## Guideline Authoring Workflow
1. Restate design intent in one sentence.
2. Define foundations and tokens.
3. Define component anatomy, variants, and interactions.
4. Add accessibility acceptance criteria.
5. Add anti-patterns and migration notes.
6. End with QA checklist.

## Required Output Structure
- Context and goals
- Design tokens and foundations
- Component-level rules (anatomy, variants, states, responsive behavior)
- Accessibility requirements and testable acceptance criteria
- Content and tone standards with examples
- Anti-patterns and prohibited implementations
- QA checklist

## Component Rule Expectations
- Include keyboard, pointer, and touch behavior.
- Include spacing and typography token requirements.
- Include long-content, overflow, and empty-state handling.

## Quality Gates
- Every non-negotiable rule must use "must".
- Every recommendation should use "should".
- Every accessibility rule must be testable in implementation.
- Prefer system consistency over local visual exceptions.

<!-- TYPEUI_SH_MANAGED_END -->

## Notas de aplicación en este proyecto

- Tailwind v4 lee tokens desde `@theme` en `src/app/globals.css`. Cualquier nuevo color o radius debe declararse ahí para que las utilidades `bg-*` / `rounded-*` se generen.
- Mapeo Tailwind ↔ designMD:
  - `bg-amauta-yellow` ↔ `surface.raised` (#f3cf11)
  - `bg-amauta-dark` ↔ `surface.strong` (#231f20)
  - `bg-black` ↔ `surface.base` (#000000)
  - `text-amauta-bordo` ↔ `text.secondary` (#621044)
  - `text-amauta-text-secondary` ↔ `text.tertiary` (#666666)
- Logo oficial: `/logo_amauta.png` (servido desde `public/`, descargado de WordPress).
- Disclaimer CNV: `Amauta Inversiones Financieras (Matrícula CNV 1029) ...` — obligatorio en footer.

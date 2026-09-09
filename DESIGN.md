---
name: TRX Daylight
description: A calm, practical workspace for tasks, plans, notes, and focus.
colors:
  bg: "#f7f8fa"
  surface: "#fff"
  surface-alt: "#f1f3f7"
  text: "#252b38"
  muted: "#697183"
  stroke: "#e5e8ee"
  accent: "#345bdd"
  accent-hover: "#244ac7"
  accent-soft: "#edf1ff"
  danger: "#bb4352"
  success: "#2e7961"
  amber: "#9b6825"
  sidebar: "#f1f3f8"
  note: "#fff7df"
  note-text: "#685632"
  focus: "#263e85"
  focus-text: "#c8d4f7"
  dark-bg: "#151821"
  dark-surface: "#1c202c"
  dark-surface-alt: "#252a37"
  dark-text: "#e8eaf1"
  dark-muted: "#a1aabd"
  dark-stroke: "#303647"
  dark-accent: "#91a9ff"
  dark-accent-hover: "#b0c0ff"
  dark-accent-soft: "#2b3553"
  dark-danger: "#f3919d"
  dark-success: "#86cdb1"
  dark-amber: "#eac28a"
  dark-sidebar: "#191d28"
  dark-note: "#353126"
  dark-note-text: "#f1dba9"
typography:
  headline:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "30px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-.035em"
  title:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "20px"
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: "-.025em"
  body:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "14px"
    lineHeight: 1.5
  label:
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0"
rounded:
  badge: "5px"
  control: "8px"
  note: "10px"
  task-container: "12px"
  card: "14px"
  gate: "18px"
spacing:
  gap: "16px"
  pad: "22px"
  compact-gap: "12px"
  compact-pad: "16px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#fff"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "{spacing.pad}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  nav-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.control}"
    height: "41px"
    padding: "9px 12px"
---

# Design System: TRX Daylight

## Overview

**Creative North Star: Daylight.** Cool surfaces, clear task hierarchy, and an ink blue focus panel make this a calm place to plan and act. Desktop and mobile share the same visual language, with layouts adapted to their available space.

This document extracts the implemented system from `design.css`, the screen structure in `index.html`, and the icon primitives in `js/00-design.js`. The stylesheet remains the implementation source of truth; the frontmatter records its principal tokens, not every one-off value.

Key characteristics: restrained blue accents, flat bordered surfaces, system typography, compact supporting information, and warm notes.

## Colors

The primary accent identifies actions and selected navigation. Soft accent fills distinguish selected surfaces. Cool neutrals separate the page, sidebar, cards, text, and dividers. Green, amber, and red communicate status; priority badges also use their own tinted pairs in the stylesheet.

The fixed ink blue focus panel and desktop sign-in introduction use white headings and pale blue supporting text. Notes use a warm background and brown text. `body.light` selects light semantic tokens; `body:not(.light)` replaces them with the dark set. `--panel` and `--card` alias the surface value, and `--accent2` repeats the accent. Dark primary buttons use dark ink text for contrast.

## Typography

Use Segoe UI Variable, Segoe UI, then sans-serif. Main headings use modest negative tracking and medium-to-semibold weights. Base body text is 14px; controls use 13px, labels 12px, and dense metadata commonly uses 11px. Section headings vary from 16px within the overview to 28px on feature pages. Main mobile headings step down to 28px, 26px, and 25px at the implemented breakpoints.

Focus duration uses 46px light text and tabular numerals. Keep numbers stable in timer and date displays. Icons are inline 24×24 SVGs with a 1.7px rounded stroke, normally rendered at 20px; use `trxIcon()` and the existing registry.

## Layout

Desktop has a fixed 224px sidebar and a flexible content column capped at 1440px, with 44px horizontal padding. The overview pairs a flexible main column with a 284px aside and a 34px gap. A seven-column week strip precedes a bordered task list; focus and notes occupy the aside.

At 1600px, content padding grows to 60px and the aside to 310px. At 1180px, padding becomes 28px and the aside narrows. At 980px, navigation becomes a 254px sliding drawer plus a fixed bottom navigation bar with safe-area padding. At 740px, the overview becomes one column with a two-column aside; at 480px, the aside also stacks and content gutters become 17px. The 520px rule adapts toolbars and scrolling filters. Short desktop viewports use a denser sidebar at heights up to 820px.

The mobile calendar uses compact dots below 480px. Kanban columns can scroll horizontally below 740px. Modals constrain both width and viewport height and scroll internally. The mobile sign-in view stacks the form and introduction into a single surface. Compact mode changes the existing padding and gap variables to 16px and 12px.

## Elevation & Depth

Cards and controls are flat, separated by a 1px stroke or tonal fill. Modals, drawers, onboarding, and toasts use `--shadow`: `0 14px 45px rgba(27,39,67,.12)` in light mode and `0 14px 45px rgba(0,0,0,.25)` in dark mode. The sign-in card has a softer, broader shadow. Overlays combine translucent ink with 3px backdrop blur.

## Shapes

Controls use 8px corners; badges use 5px; notes 10px; task containers 12px; cards and modal surfaces 14px. Desktop sign-in uses 18px. Avatars, status dots, and the timer are circular. Preserve the border and radius hierarchy instead of wrapping every section in another card.

## Components

- **Buttons:** 38px minimum height, 9px × 14px padding, 13px semibold text. Primary fills use the accent, ghost actions are transparent, and danger actions use red text. Hover changes fill; pressing moves buttons down 1px. Small variants and contextual mobile controls have separate observed dimensions.
- **Fields:** 40px minimum height, a surface fill, 1px stroke, and 10px × 12px padding. Focus changes the border to the accent. The global keyboard focus indicator is a 2px accent outline with a 3px offset. Disabled buttons reduce opacity to .45.
- **Navigation:** muted labels and geometric icons, with a soft blue active fill. Desktop rows are 41px tall; mobile bottom-navigation targets are at least 44px tall and expose the current page.
- **Tasks:** rows share one bordered container; completed titles are struck through. Status and priority pair text with color. The selected week date uses solid accent fill.
- **Focus panel:** ink blue with pale supporting text, light oversized duration, a white start button, and subtle outlined orbit geometry.
- **Notes:** warm flat surfaces, readable multiline text, and small editing controls. Overview notes stack; the main notes view changes from multiple columns to one on narrow phones.
- **Dialogs and feedback:** floating surfaces reuse the semantic palette and shared shadow. Keep overflow within the viewport. Preserve accessible names for icon-only controls.

## Do's and Don'ts

- Do reuse semantic CSS variables so light and dark modes remain coherent.
- Do check mobile content, drawer navigation, bottom navigation, and viewport-constrained dialogs alongside desktop.
- Do use short color transitions: controls use 160ms, week dates 150ms, and the mobile drawer 200ms ease.
- Do honor reduced motion: the implemented media query disables animations and transitions and restores automatic scrolling.
- Don't add decorative shadows to flat task rows and cards.
- Don't replace the shared SVG icon vocabulary with unrelated icon styles.
- Don't remove text labels or focus indicators when adapting controls to small screens.

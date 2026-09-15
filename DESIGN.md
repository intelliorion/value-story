---
color:
  bg:            "#FFFFFF"
  surface:       "#F5F5F7"
  surface-raised:"#FFFFFF"
  ink:           "#1D1D1F"
  ink-dim:       "#55555A"
  ink-faint:     "#C7C7CC"
  ink-muted:     "#6E6E73"
  rule:          "#E5E5EA"
  accent:        "#0062C4"
  accent-soft:   "rgba(0,98,196,0.10)"
  positive:      "#007A52"
  negative:      "#C0341A"
  print-bg:      "#FFFFFF"
  print-ink:     "#111111"
  print-rule:    "#CCCCCC"
type:
  display: "-apple-system, 'SF Pro Display', Inter, system-ui, sans-serif"
  text:    "ui-serif, 'Iowan Old Style', Palatino, Georgia, serif"
  mono:    "ui-monospace, 'SF Mono', Menlo, monospace"
  scale-hero:      "clamp(3.5rem, 9vw, 7.5rem)"
  scale-hero-unit: "clamp(1rem, 1.5vw, 1.5rem)"
  scale-h1:        "clamp(1.75rem, 2.9vw, 2.6rem)"
  scale-h2:        "1.375rem"
  scale-body:      "1.0625rem"
  scale-small:     "0.9375rem"
  scale-micro:     "0.6875rem"
space:
  unit: "8px"
  measure: "1240px"
  gutter: "clamp(1.5rem, 4vw, 3.5rem)"
  chapter: "clamp(3rem, 6vh, 5rem)"
radius:
  card: "12px"
motion:
  duration: "820ms"
  ease: "cubic-bezier(0.16, 1, 0.3, 1)"
  stagger: "70ms"
---

# Design

Dark, editorial, high contrast. One accent, used sparingly and only for
measured evidence. Generous negative space. Numerals are the loudest element
on the page; everything else recedes.

Explicitly not corporate-deck blue and grey.

## Rules

- The renderer never authors a hex value. It selects semantic classes whose
  colours resolve from the tokens above.
- Print colours are tokens too (`print-bg`, `print-ink`, `print-rule`) — a
  designer changing the print treatment edits the token system, not a renderer.
- The accent marks measured evidence only. An estimate never receives it.
- Type: display face for numerals and headlines, serif for prose. The contrast
  between the two is the editorial signal.
- Motion runs once on entry and resolves. See the motion budget in the spec.
- Layout is measured, not full-bleed. `space.measure` caps the reading column and
  centres it; the hero and every prose chapter run as a two-column grid —
  headline left, supporting detail right — so a wide viewport is used rather
  than left empty.
- The outcome chapter is the peak of the page, not a footnote. It carries its own
  lighter background band, extra vertical padding and the largest claim cards.
- `type.scale-hero-unit` sizes the hero's unit label independently of the numeral
  so a long unit (`kWh/m2/yr`) stays legible instead of being scaled from the
  numeral's size.
- `type.scale-small` is the floor for prose-adjacent text (evidence rows,
  assumption notes). `scale-micro` is reserved for eyebrows and tier labels.

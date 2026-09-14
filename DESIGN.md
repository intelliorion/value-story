---
color:
  bg:            "#0A0B0D"
  surface:       "#14161A"
  surface-raised:"#1B1E24"
  ink:           "#F4F5F7"
  ink-dim:       "#8B929C"
  ink-faint:     "#5A616B"
  rule:          "#23272E"
  accent:        "#F5B942"
  accent-soft:   "rgba(245,185,66,0.14)"
  positive:      "#4ADE80"
  negative:      "#FF6B5A"
  print-bg:      "#FFFFFF"
  print-ink:     "#111111"
  print-rule:    "#CCCCCC"
type:
  display: "-apple-system, 'SF Pro Display', Inter, system-ui, sans-serif"
  text:    "ui-serif, 'Iowan Old Style', Palatino, Georgia, serif"
  mono:    "ui-monospace, 'SF Mono', Menlo, monospace"
  scale-hero:  "clamp(4rem, 12vw, 9rem)"
  scale-h1:    "clamp(2rem, 4vw, 3rem)"
  scale-h2:    "1.5rem"
  scale-body:  "1.0625rem"
  scale-micro: "0.75rem"
space:
  unit: "8px"
  gutter: "clamp(1.5rem, 5vw, 5rem)"
  chapter: "clamp(4rem, 10vh, 8rem)"
radius:
  card: "10px"
motion:
  duration: "820ms"
  ease: "cubic-bezier(0.16, 1, 0.3, 1)"
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

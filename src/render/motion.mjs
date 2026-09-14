// src/render/motion.mjs
//
// Spec §6.3, the motion budget: "Static meaning must remain complete. Motion is
// finite and reader-controlled. Exports stay clean." Every animation here runs
// ONCE on entry and resolves. Nothing loops, pulses or bounces -- a looping
// effect would also hang `visual-check`, which waits for every animation to
// finish before it measures.
//
// Motion lives in this one file so the guarantee is reviewable in one place:
// what animates, for how long, and what switches it all off.
import { normalizedDiagnostic } from '../diagnostics.mjs';

// Every animation must resolve well inside the gate's 2000ms settle budget.
// Worst case is the last claim card: base delay 5 x 70ms, then 820ms.
export const MOTION_CSS = `
:root{--vs-motion:entry}
@keyframes vs-rise-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes vs-node-in{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
@keyframes vs-dot-in{from{transform:scale(0)}to{transform:scale(1)}}
@keyframes vs-figure-in{from{opacity:0;transform:translateY(10px) scale(0.96)}to{opacity:1;transform:none}}

/* Chapters arrive in reading order. They animate on LOAD, not on scroll: a
   scroll-triggered reveal leaves content parked invisible for any reader whose
   browser does not run it, and the artifact is forwarded more often than it is
   presented. By the time a reader scrolls, these have long since resolved. */
.vs-chapter{animation:vs-rise-in var(--vs-duration) var(--vs-ease) both;
  animation-delay:var(--vs-delay,0ms)}
.vs-chapter:nth-of-type(1){--vs-delay:0ms}
.vs-chapter:nth-of-type(2){--vs-delay:calc(var(--vs-stagger)*1)}
.vs-chapter:nth-of-type(3){--vs-delay:calc(var(--vs-stagger)*2)}
.vs-chapter:nth-of-type(4){--vs-delay:calc(var(--vs-stagger)*3)}

/* The claim cards are the peak of the page, so they arrive one after another
   rather than as a block, and the CURRENT figure lands after the card that
   carries it -- the delta is the point, so the delta is what moves last. */
.vs-chapter__claims .vs-claim{animation:vs-rise-in var(--vs-duration) var(--vs-ease) both;
  animation-delay:var(--vs-card-delay,0ms)}
.vs-chapter__claims .vs-claim:nth-child(1){--vs-card-delay:calc(var(--vs-stagger)*1)}
.vs-chapter__claims .vs-claim:nth-child(2){--vs-card-delay:calc(var(--vs-stagger)*2)}
.vs-chapter__claims .vs-claim:nth-child(3){--vs-card-delay:calc(var(--vs-stagger)*3)}
.vs-chapter__claims .vs-claim:nth-child(4){--vs-card-delay:calc(var(--vs-stagger)*4)}
.vs-chapter__claims .vs-claim:nth-child(5){--vs-card-delay:calc(var(--vs-stagger)*5)}
.vs-chapter__claims .vs-claim:nth-child(n+6){--vs-card-delay:calc(var(--vs-stagger)*6)}
.vs-claim__to{display:inline-block;
  animation:vs-figure-in var(--vs-duration) var(--vs-ease) both;
  animation-delay:calc(var(--vs-card-delay,0ms) + 300ms)}

/* The constellation lights up in reading order, and the PRIMARY driver lands
   last: it is the one the reader should still be looking at when the page
   settles. The dot scales from nothing; the label only fades, because a label
   that slides is a label you cannot read while it moves. */
.vs-node{animation:vs-node-in var(--vs-duration) var(--vs-ease) both;
  animation-delay:var(--vs-node-delay,0ms)}
.vs-node:nth-of-type(1){--vs-node-delay:calc(var(--vs-stagger)*0.5)}
.vs-node:nth-of-type(2){--vs-node-delay:calc(var(--vs-stagger)*1)}
.vs-node:nth-of-type(3){--vs-node-delay:calc(var(--vs-stagger)*1.5)}
.vs-node:nth-of-type(4){--vs-node-delay:calc(var(--vs-stagger)*2)}
.vs-node:nth-of-type(5){--vs-node-delay:calc(var(--vs-stagger)*2.5)}
.vs-node:nth-of-type(6){--vs-node-delay:calc(var(--vs-stagger)*3)}
.vs-node:nth-of-type(n+7){--vs-node-delay:calc(var(--vs-stagger)*3.5)}
.vs-node[data-state="primary"]{--vs-node-delay:calc(var(--vs-stagger)*5)}
.vs-node circle{transform-box:fill-box;transform-origin:center;
  animation:vs-dot-in var(--vs-duration) var(--vs-ease) both;
  animation-delay:calc(var(--vs-node-delay,0ms) + 90ms)}

/* Both exits from motion are absolute and universal, so they also cover the
   hero animation defined in delta.mjs. A forwarded artifact prints identically
   to one presented, and a reader who has asked for less motion gets none. */
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation:none !important;transition:none !important}
}
@media print{
  *,*::before,*::after{animation:none !important;transition:none !important}
}
`;

// `meta.motion: "static"` is a promise that the artifact carries NO motion at
// all. It is kept by omitting MOTION_CSS and then disabling whatever any other
// stylesheet declared, rather than by trusting every stylesheet to comply.
export const MOTION_OFF_CSS = `
:root{--vs-motion:static}
*,*::before,*::after{animation:none !important;transition:none !important}
`;

export function motionProfile(doc) {
  return doc?.meta?.motion === 'static' ? 'static' : 'entry';
}

// The profile is stamped as a custom property rather than inferred from the
// presence of a disabling rule: MOTION_CSS carries its own universal disable
// inside the reduced-motion and print media blocks, so "a disable exists" is
// true of BOTH profiles and cannot distinguish them.
const STATIC_STAMP = /--vs-motion:static/;

/**
 * Spec §6.3 named `motion/budget-exceeded` and nothing ever emitted it. What it
 * can honestly check is the one motion promise the document itself makes: a
 * declared `static` profile must produce an artifact that does not animate.
 *
 * This is a RENDERER defect when it fires, not an authoring one -- the same
 * class as `layout/*` -- because nothing an author writes in the value case can
 * cause it. It exists so the guarantee is verified rather than asserted.
 */
export function motionDiagnostics(doc, html) {
  if (motionProfile(doc) !== 'static') return [];
  if (STATIC_STAMP.test(html)) return [];
  return [normalizedDiagnostic({
    code: 'motion/budget-exceeded',
    severity: 'error',
    message: 'This value case declares `meta.motion: "static"`, and the rendered artifact still carries motion. '
      + 'A static profile must produce an artifact that does not animate at all, in any medium.',
    subject: { pointer: '/meta/motion', declared: 'static' },
    evidence: { declaredProfile: 'static', staticStampPresent: false },
    supportedFixes: [
      'this is a renderer defect, not a repair to the value case: report it verbatim to the maintainer of src/render/motion.mjs',
    ],
  })];
}

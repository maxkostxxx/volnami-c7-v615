# C7: wave motion v647

## Outcome

Give the C7 content a visible but controlled wave entrance in both directions
of native scrolling. The motion must support the live Three.js scene, not add
a second scrolling engine or compete for the main thread.

## Design contract

1. A section arrives through a single broad wave cue, then reading units rise
   in their natural reading order.
2. The same entrance runs after an item has fully left the viewport and the
   visitor scrolls back. An element must never reset while it is still grazing
   the viewport.
3. No layout properties, dynamic SVG path construction, per-frame DOM writes,
   or animated `clip-path` are used for content reveal.
4. The visible motion lasts 680 ms on desktop and 600 ms on phone. Stagger is
   capped at 296 ms, so a group cannot wait for a late, theatrical reveal.
5. `prefers-reduced-motion`, the in-site motion switch, hidden documents and
   keyboard focus always show content immediately.

## Implementation

- `C7WaveReveal` owns IntersectionObserver state for actual reading units.
- Items outside the safe viewport are armed with an entry direction. When they
  enter, only `opacity` and compositor `transform` animate.
- `C7WaveLines` is the shared visual wave, rather than a clipping mask for
  each individual card.
- The decorative mouse-following cursor is removed from the C7 page. It added
  a pointer, scroll and rAF loop without contributing to the requested scroll
  narrative.

## Acceptance checks

- Production build passes.
- At 1440x900 and 390x844, direct and reverse scroll leave no visible reveal
  element at zero opacity after the transition settles.
- Reduced motion has zero pending/running content reveals and no infinite DOM
  animation.
- No console/page errors during the exercise.

## Follow-up visual QA

Review the actual published route on a physical iOS/Android device before
calling motion fully accepted. Headless mobile is a layout and state check,
not proof of device frame pacing.

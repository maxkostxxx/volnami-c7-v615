# C7 world v3

## World sentence

One continuous sculptural landscape follows the supplied moodboard: smooth green waves meet a calm lake while one sun travels from dawn on the left to dusk on the right.

## Visual contract

- The supplied moodboard is the primary composition reference, not a loose inspiration.
- The scene uses rounded S-curve hills, a clear sky, five sparse trees and mirrored water.
- Rocks, mountain valleys, fog, random forests, low-poly geometry and photographic clutter are excluded.
- The source plate remains sharp. Motion is added through registered depth, camera travel, light and water shimmer, never through whole-frame blur or UV smearing.
- Desktop and portrait use separately authored compositions.

## Chapters

| Chapter | Camera and light |
|---|---|
| Hero | Wide dawn frame, sun partially above the left ridge |
| About | Camera eases backward, morning light opens the middle hills |
| Process | Highest daylight phase, full layered silhouette is visible |
| Services and cases | Quiet daylight-to-afternoon transition behind paper sections |
| Testimonials | Camera returns to the lake as light warms |
| Contacts | Dusk frame, sun on the right and a narrow reflection in the water |

## Runtime budget

- One subdivided depth card and one terrain-masked sun pass.
- No reflection render, HDR environment, GLB model, shadow map or post-processing chain.
- Desktop DPR is capped at 1.2; portrait DPR is capped at 1.
- Active motion targets about 30 fps; idle water motion updates at 8 fps desktop and 6 to 7 fps compact devices.
- Reduced motion and Save-Data render the exact captured first frame without loading Three.js.

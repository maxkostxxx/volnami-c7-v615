# C7: real-time 3D world

Implementation guide: `build-threejs-scroll-worlds` from MengTo/Skills, used together with the local Three.js production skill.

## World sentence

The visitor moves through one continuous landscape of wave-shaped hills and a lake while a single day travels from dawn through clear daylight to a warm sunset.

Native scroll controls the camera and global time. Pointer movement adds only restrained local parallax. The DOM remains the complete semantic site.

## Visual bible

- Scale: 1 Three.js unit is treated as roughly one metre.
- Silhouette: broad authored folds first, rounded secondary hills second, sparse conifer landmarks last.
- World dark: `#071510`.
- Terrain shadow: `#173323`.
- Terrain mid: `#41633a`.
- Terrain light: `#9aaa69`.
- Dawn: warm rose and apricot.
- Day: pale sage and cream.
- Sunset: coral horizon and deep blue-green zenith.
- Materials: matte velvet grass, dark rough trunks, reflective deep-green water.
- Lens: 39–48 degree perspective, low water-level hero, higher wide middle, low sunset finish.
- Signature: the same physical sun drives the sky, terrain light, shadows, fog and water reflection.

## Scene graph

```text
scene
  worldRoot
    sky
    terrain
    water
    trees
    atmosphere
    sunCore + sunHalo
  cameraRig
    inputRig
      PerspectiveCamera
```

## Chapter ledger

| Beat | Camera | Light | Spatial change |
| --- | --- | --- | --- |
| Hero | low over the lake | dawn, low left | foreground bank opens onto the first valley |
| About | rises and shifts left | early morning | a second ridge and tree cluster become visible |
| Process | travels above the water | morning | the serpentine lake leads into deeper hills |
| Services | widest elevated view | daylight | the full system of ridges reads as waves |
| Cases | lateral move to the right | afternoon | foreground terrain crosses the frame |
| Testimonials | descends toward the lake | golden hour | water and silhouettes regain dominance |
| Contacts | low final approach | sunset, low right | the sun meets the far ridge and reflects in water |

Desktop and mobile use separate camera endpoints. Mobile preserves the same landmarks with a taller lens and reduced foreground density.

## Runtime contracts

- One renderer, one scene and one native-scroll conductor.
- Exact scroll state controls anchors and chapter time.
- Damped state controls camera and visual interpolation.
- Intro ambient motion runs for less than five seconds. Scroll and pointer input wake short animation bursts afterwards.
- `prefers-reduced-motion` snaps to the exact authored frame and disables ambient motion.
- The first composed poster stays visible until WebGL has compiled and rendered the first frame.
- Page visibility pauses rendering and resume does not advance time.

## Performance budget

- DPR: 1.1–1.25 mobile, 1.25–1.5 desktop.
- Terrain: at most about 45k triangles desktop and 18k mobile.
- Trees: instanced trunks and crowns, two draw calls.
- One shadow-casting directional light.
- Shadow map: 1024 desktop, 512 mobile.
- No texture-backed live background and no full-resolution post-processing chain.
- Target: fewer than 20 draw calls and fewer than 100k visible triangles.

## Acceptance

- The frame remains spatially convincing with all DOM copy hidden.
- Water and foliage visibly move on first load.
- Slow, fast and reverse scrolling produce the same deterministic scene state.
- The sun is naturally occluded by geometry and visibly changes the world, not only its own position.
- At 390, 768, 980, 1440 and 1920 px there is no horizontal overflow or accidental text column narrower than the approved reading measure.
- WebGL failure and reduced motion retain the complete readable page.

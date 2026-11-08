# C7 world v4

## Reference contract

The composition reference is the landscape on page 1 of `ПРАВКА ПО САЙТУ.docx`, specifically the image marked as the desired result. It is not the earlier moodboard and not the v3 valley.

- Preserve the reference rhythm of many low rolling hills, a central lake, sparse trees, generous sky and foreground banks.
- Keep the plate crisp and premium. Do not use whole-frame blur, artificial fog, cartoon geometry or aggressive UV warping.
- Remove both baked suns, halos and reflection streaks from the base image.
- Render exactly one procedural sun. The same position drives its halo, terrain illumination, phase grading and water glint.
- Use the authored sky and water masks for real ridge occlusion and shoreline-safe reflection.
- Desktop and portrait use separately composed plates rather than a destructive center crop.

## Scroll chapters

| Chapter | Camera and light |
|---|---|
| Hero | Dawn, the sun emerges from behind the left ridge |
| About | The camera eases back and reveals more layers |
| Process | Clear daylight, the sun is highest and the scene is brightest |
| Services and cases | Slow transition from day to warm afternoon |
| Testimonials | The camera returns toward the lake as dusk begins |
| Contacts | Sunset, the sun meets the right ridge and lights the water |

## Runtime budget

- One subdivided depth card plus one masked sun pass.
- One packed control map for depth, sky and water.
- No reflection render, HDR environment, GLB model, shadow map or post-processing chain.
- Reduced motion and Save-Data use the captured first frame without loading Three.js.

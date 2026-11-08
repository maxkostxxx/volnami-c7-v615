# C7 visual sources

The active C7 landscape follows the image labelled “как должно быть приблизительно, точнее почти также” on page 1 of `ПРАВКА ПО САЙТУ.docx`. The same composition is preserved at higher resolution in `public/hero/c7-reference-landscape.jpg`: layered wave-shaped hills, sparse trees, a central reflective lake and foreground banks.

The clean authored masters are `public/hero/c7-corrections-reference-v4-source.png` and `public/hero/c7-corrections-reference-v4-mobile-source.png`. Both baked light sources, their halos and their water glints were removed so the runtime has exactly one coherent sun.

The active render assets are `correction-world-*-v4.webp` and `correction-control-*-v4.webp` in `backdrop/`. The packed control texture stores registered depth, sky and water masks. Three.js uses those masks for restrained camera parallax, terrain occlusion, one scroll-controlled sun and a reflection that never crosses the shoreline.

The matching first-frame posters are `public/hero/c7-corrections-reference-v4-poster-*.png`. Generated project plates contain no third-party logos, text or stock watermark. Previous versions remain in the repository only as rollback material.

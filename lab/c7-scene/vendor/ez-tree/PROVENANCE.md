# EZ-Tree subset for the C7 scene study

Upstream: https://github.com/dgreenheck/ez-tree
Pinned commit: dcf309bd86bd521083d9c70f01f2de45fdc7c457
Retrieved: 2026-10-24
Code and leaf textures: MIT, Daniel Greenheck (included LICENSE).
Bark textures: ambientCG Bark003, CC0; see included TEXTURE-LICENSE.md.

Local source edits: relative JS imports receive `.js` extensions for native browser modules. The preset index includes only the three fetched JSON presets embedded as JS, avoiding bundler-specific JSON imports. The tree geometry/shading algorithms are otherwise unchanged.

The C7 adapter (`../../trees.js`) authors its own parameters and uses the library's real recursive branch skeleton and texture-cutout leaf sprays. It scales the full generated geometry to the requested measured height. It does not render a backdrop or use flat tree impostors.

Local assets (`../../assets/tree`): `leaves-{oak,ash,aspen}.png`, and Bark003 Color / NormalGL / Roughness. Downloaded from the pinned repository through `media.githubusercontent.com` to resolve Git LFS content. The adapter currently uses oak foliage. No remote requests are made at runtime.

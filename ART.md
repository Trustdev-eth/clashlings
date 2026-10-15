# Token creature art

`public/game/token-creatures.png` is the new original 4×3 RGBA card atlas, generated with the built-in image-generation tool and one padding edit. It is 1448×1086 pixels with twelve 362×362 cells. The exact final output was copied into the project without raster resizing/editing. The previous `creatures.png` is retained as historical source art, but the live card and compatibility renderers use the new atlas.

The full prompt and asset validation are in `docs/TOKEN-ART-PROMPT.md`. The prompt specifies saturated premium stylized 3D game-card art, transparent backgrounds, a three-quarter view, common rim lighting, full silhouettes, no text and the exact roster/cell order below. The art represents game characters; it does not claim sponsorship or token custody.

| ID/cell | Asset reference | Shared 2D/3D identity |
| --- | --- | --- |
| 0 / row 1 col 1 | BTC | Dark bull, gold armor/coin chest, curved ivory horns |
| 1 / row 1 col 2 | SOL | Teal/violet neon fox, white muzzle, three tail fins |
| 2 / row 1 col 3 | ETH | Purple crystal tortoise, tall ether-diamond shell |
| 3 / row 1 col 4 | XRP | Blue/white penguin, circular water-ripple crown |
| 4 / row 2 col 1 | BONK | Tan Shiba gliders, cream muzzles, violet bat membranes |
| 5 / row 2 col 2 | NVDA equity | Emerald/black chip golem, circuit shoulders and heavy fists |
| 6 / row 2 col 3 | PEPE | Green frog sage, leaf cape and glowing lily staff |
| 7 / row 2 col 4 | DOGE | Golden smiling Shiba dragon, curled tail and cloud wings |
| 8 / row 3 col 1 | WIF | Muscular tan Shiba, silver armor and pink knit beanie |
| 9 / row 3 col 2 | POPCAT | Cream cat moth, large open mouth, turquoise patterned wings |
| 10 / row 3 col 3 | MEW | Mint/white glossy cat slime, pink ears/paws, gel bubbles |
| 11 / row 3 col 4 | BRETT | Blue punk hawk, crest, gold/cyan lightning feathers |

`public/game/three/models.js` creates real volumetric geometry with named landmarks and independent articulated joints. Static surfaces are baked/cached and geometry is shared across fighters; per-fighter hit materials and poses remain independent. These are stylized procedural models following the same design sheet, not photorealistic or imported sculpted/rigged GLB assets. Bounds, draw/triangle budgets, camera fit, recovery poses and disposal are regression checked. Live GPU/device appearance remains unverified.

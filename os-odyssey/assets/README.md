# OS Odyssey — Assets

All image assets live here. Referenced in CSS and HTML with `../../assets/` relative paths.

## Asset Map

| File | Size | Used In | Description |
|------|------|---------|-------------|
| `hero-bg-day.jpg` | 1536×1024 | Hero section (light mode), Auth page (light mode) | Pixel art daytime snowy mountain landscape with penguin walking bottom-left |
| `hero-bg-night.jpg` | 1536×1024 | Hero section (dark mode), Auth page (dark mode), Module card Ch6 | Pixel art nighttime scene with crescent moon, stars, mountains, penguin |
| `bg-mountains-day.jpg` | 1198×639 | CTA section (light mode), Module card Ch4 | Clean daytime pixel mountains, no penguin |
| `bg-forest-lantern.jpg` | 736×414 | Module card Ch1 | Pixel art snowy forest with warm glowing lantern |
| `bg-forest-lantern-2.jpg` | 736×414 | Module card Ch5 | Same lantern forest (second copy for variety) |
| `bg-mountains-purple.jpg` | varies | Module card Ch2 | Purple/magenta pixel mountain night scene |
| `bg-mountains-sunrise.jpg` | varies | Module card Ch3 | Soft pixel art sunrise mountain landscape |
| `penguin-flower.png` | 447×559 | Modules section header, Auth/Signup page | Pixel art penguin mascot holding a pink flower, transparent background |

## Theme Behavior

- **Light mode**: hero uses `hero-bg-day.jpg`, auth page uses `hero-bg-day.jpg`, CTA uses `bg-mountains-day.jpg`
- **Dark mode**: hero uses `hero-bg-night.jpg`, auth page uses `hero-bg-night.jpg`, CTA uses `hero-bg-night.jpg`
- CSS handles the swap via `[data-theme="dark"]` selector in `styles.css`

## Notes

- `image-rendering: pixelated` is applied to preserve the pixel-art look at any scale
- All hero/full-page images use `background-size: cover` with `background-position: center bottom` to keep the penguin visible
- Module card thumbnails use `height: 120px` with `object-fit: cover` via `background-size: cover`

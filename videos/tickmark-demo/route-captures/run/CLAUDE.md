# Tickmark - the month-end close that learns

Source: https://tickmark-kappa.vercel.app/close/run

To create a video from this capture, use the `product-launch-video` skill.

## What's in This Capture

| File | Contents |
|------|----------|
| `screenshots/contact-sheet.jpg` | **View this first.** All scroll screenshots in labeled grid — see the entire page at a glance |
| `screenshots/scroll-*.png` | Individual viewport screenshots if you need detail on a specific section. |
| `extracted/tokens.json` | Design tokens: 20 colors, 2 fonts, 1 headings, 1 CTAs |
| `extracted/design-styles.json` | Computed styles from live DOM: typography hierarchy, button/card/nav styles, spacing scale, border-radius, box shadows. Primary data source for DESIGN.md. |
| `extracted/asset-descriptions.md` | One-line description of every downloaded asset. Read this for asset selection — only open individual files for safe-zone checking. |
| `extracted/visible-text.txt` | Page text in DOM order, prefixed with HTML tag (`[h1]`, `[p]`, `[a]`). Use as context — rephrase freely. |
| `assets/contact-sheet.jpg` | All downloaded images in one labeled grid. |
| `assets/` | Individual downloaded images, SVGs, and font files. |

## Brand Summary

- **Colors**: #FFFFFF (bg-light), #0D253D (accent), #64748D (neutral), #F6F9FC (bg-light), #EEF3F9 (bg-light), #E3E8EE (bg-light), #533AFD (accent), #2A78D6 (accent), #1BAF7A (accent), #EB6834 (accent)
- **Fonts**: Inter (100-900 variable), JetBrains Mono (100-800 variable)

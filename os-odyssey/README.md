# 🐧 OS Odyssey

> An Operating System Simulator where you train like a coder and think like a kernel.

## Project Structure

```
os-odyssey/
├── frontend/
│   ├── html/
│   │   ├── index.html      ← Landing page (Hero + Modules)
│   │   └── signup.html     ← Sign-up / auth page
│   ├── css/
│   │   └── styles.css      ← All styles (light/dark mode, pixel art theme)
│   └── js/
│       └── main.js         ← Theme toggle, animations, form handling
├── backend/
│   └── README.md           ← API routes & server setup (planned)
└── database/
    └── README.md           ← Prisma schema & DB setup (planned)
```

## Getting Started (Frontend)

Since this is plain HTML/CSS/JS, just open in a browser:

```bash
open frontend/html/index.html
```

Or use a local dev server:

```bash
npx serve .
```

## Design System
- **Font**: Press Start 2P (pixel headers) + VT323 (display) + Nunito (body)
- **Colors**: Orange `#f5a623`, Snow `#ffffff`, Blue `#3b82f6`
- **Theme**: Light (daytime snowy mountains) / Dark (nighttime stars + moon)
- **Style**: Pixel art retro, hand-crafted CSS shapes

## Assets Needed
Place in `/assets/`:
- `penguin-walk.png` — penguin walking (hero bottom left)
- `penguin-flower.png` — penguin holding flower (modules header)

## Roadmap
- [x] Landing page HTML/CSS/JS
- [x] Sign-up page
- [ ] Backend (Node/Express/Prisma)
- [ ] Database (PostgreSQL)
- [ ] Module detail pages
- [ ] Progress tracking
- [ ] Welcome/onboarding page

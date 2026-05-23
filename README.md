# Lore Universe

Monorepo for the Lore Universe website — a personal creative-writing platform hosting serialized novels and a companion wiki.

**Live site:** https://loreuniverse.github.io/
**API:** https://loreuniverse-api.fly.dev/

## Layout

- `frontend/` — Eleventy static site. Renders novels, wiki, and other modules.
- `backend/` — Fastify TypeScript API. Handles auth, dynamic data, admin endpoints.
- `shared/` — TypeScript types shared between backend and (eventually) frontend.
- `scripts/` — Authoring tooling (Obsidian migration, future scripts).
- `docs/` — Architecture specs and implementation plans.

## Local development

Prerequisites: Node 24+, Docker.

```bash
# Static site
cd frontend
npm install
npm start                # Eleventy dev server on :8080

# Backend (separate terminal)
cd backend
npm install
npm run dev              # Fastify on :3000
```

## Architecture

See `docs/superpowers/specs/2026-05-22-foundational-backend-architecture-design.md` for the full architecture.

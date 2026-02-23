# notras

> A simple space to capture your thoughts as they come.

A personal, single-user note-taking app that runs locally with a SQLite database. No accounts, no cloud sync -- just your notes on your machine.

## Features

- create, edit, and delete plain-text notes
- pin notes to keep them at the top
- search across all notes
- filter by time period (today, yesterday, this week, this month, all time)
- sort by newest, oldest, or recently updated
- attach images and PDFs to notes (images auto-optimized to WebP)
- export notes as a zip and import from backup (merge or mirror)
- keyboard shortcuts for everything
- animated transitions
- dark/light mode (follows system preference)

## Technologies

### Tooling

- [pnpm](https://pnpm.io)
- [ESLint](https://eslint.org)
- [Oxfmt](https://oxc.dev)
- [Vitest](https://vitest.dev)
- [Lefthook](https://github.com/evilmartians/lefthook)
- [Knip](https://knip.dev)
- [Playwright](https://playwright.dev)
- [GitHub Actions](https://github.com/features/actions)

### Frontend

- [Next.js](https://nextjs.org) 16 (App Router, Turbopack, React Server Components)
- [React](https://react.dev) 19
- [Shadcn UI](https://ui.shadcn.dev)
- [Tailwind CSS](https://tailwindcss.com) 4
- [Motion](https://motion.dev)
- [Sonner](https://sonner.emilkowal.ski)
- [Lucide](https://lucide.dev)
- [nuqs](https://nuqs.47ng.com) (URL search state)
- [react-hotkeys-hook](https://react-hotkeys-hook.vercel.app)

### Backend

- [SQLite](https://www.sqlite.org) via [libSQL](https://turso.tech/libsql) (`@libsql/client`)
- [Drizzle ORM](https://orm.drizzle.team)
- [Zod](https://zod.dev) 4
- [sharp](https://sharp.pixelplumbing.com) (image optimization)
- [@t3-oss/env-nextjs](https://env.t3.gg)

---

## Getting Started

This project uses [pnpm](https://pnpm.io), so please [install](https://pnpm.io/installation) it first by running:

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

Then install dependencies:

```bash
pnpm install
```

---

### Database

The app uses a local SQLite database via libSQL. No external database setup is needed -- the database file is created automatically at `data/notras.db` on first run.

A single "device" user is auto-seeded on first run. All browsers on the same machine share the same notes.

---

### Environment Variables

Optionally, copy the example env file:

```bash
cp .env.example .env
```

The only environment variable is `DATABASE_PATH`, which defaults to `file:./data/notras.db` if not set:

```dotenv
# Database path (libSQL/SQLite URL)
# Defaults to file:./data/notras.db if not set
# DATABASE_PATH=file:./data/notras.db
```

---

### Running

Push the database schema and start the dev server:

```bash
pnpm db:push
pnpm dev
```

---

## Scripts

| Script            | Description                     |
| ----------------- | ------------------------------- |
| `pnpm dev`        | start dev server (Turbopack)    |
| `pnpm build`      | production build                |
| `pnpm start`      | start production server         |
| `pnpm clean`      | clean build artifacts           |
| `pnpm lint`       | lint (ESLint, cached)           |
| `pnpm lint:fix`   | lint and auto-fix               |
| `pnpm format`     | check formatting (oxfmt)        |
| `pnpm format:fix` | fix formatting                  |
| `pnpm typecheck`  | type check (tsc)                |
| `pnpm test`       | run tests (Vitest)              |
| `pnpm coverage`   | tests with coverage             |
| `pnpm knip`       | detect unused code/deps         |
| `pnpm e2e`        | run e2e tests (Playwright)      |
| `pnpm e2e:ui`     | run e2e tests with UI           |
| `pnpm db:push`    | push schema changes to database |
| `pnpm db:studio`  | open Drizzle Studio             |

## Keyboard Shortcuts

| Key         | Context     | Action       |
| ----------- | ----------- | ------------ |
| `h`         | global      | go home      |
| `n`         | global      | new note     |
| `a`         | global      | all notes    |
| `s`         | global      | settings     |
| `/`         | global      | focus search |
| `e`         | note detail | edit note    |
| `p`         | note detail | toggle pin   |
| `d`         | note detail | delete note  |
| `c`         | note detail | copy content |
| `Cmd+Enter` | form        | submit       |
| `Escape`    | form        | cancel       |

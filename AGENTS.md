# notras

A personal note-taking app -- "A simple space to capture your thoughts as they come."

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack, React Server Components)
- **Language:** TypeScript (strict mode)
- **Database:** Neon PostgreSQL via Drizzle ORM
- **Auth:** Better Auth (GitHub OAuth + magic link email via Resend)
- **UI:** Shadcn UI (radix-maia style, stone base) + Tailwind CSS 4
- **Animation:** Motion (layout animations for shared element transitions)
- **Formatting:** oxfmt (Prettier-compatible, Rust-based)
- **Linting:** ESLint 9 with `@jimmy.codes/eslint-config`
- **Testing:** Vitest + Testing Library + happy-dom
- **Package Manager:** pnpm

## Project Structure

```txt
src/
  actions/       # Server actions (all data mutations go here)
  app/           # Next.js App Router pages and layouts
  components/    # React components
    ui/          # Shadcn UI components (auto-generated, don't manually edit)
  lib/           # Client utilities, auth, search params
  server/
    db/          # Drizzle client and schemas (PostgreSQL)
    email.ts     # Resend email service
  env.ts         # Type-safe env vars via @t3-oss/env-nextjs + Zod
  proxy.ts       # Auth middleware
```

## Key Patterns

- **Server actions** live in `src/actions/` with `"use server"` directive. They use `authorizedServerAction()` from `@/lib/authorized` to get the authenticated user ID before performing DB operations.
- **Validation** uses Zod schemas inside server actions (parse FormData before DB operations).
- **IDs** are generated with `typeid-js`.
- **Cache invalidation** uses `updateTag("notes")` from `next/cache` after mutations.
- **Path alias** `@/*` maps to `./src/*`.
- **Environment variables** are validated in `src/env.ts` using `@t3-oss/env-nextjs` with Zod. Import from `@/env` -- never use `process.env` directly.
- **Database schemas** are in `src/server/db/schemas/`. Use Drizzle ORM query builder, not raw SQL.
- **Components** use Shadcn UI primitives from `@/components/ui/`. Add new Shadcn components via the CLI (`pnpm dlx shadcn@latest add <component>`).

## Commands

```txt
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm lint         # Lint (ESLint)
pnpm lint:fix     # Lint and auto-fix
pnpm format:fix   # Format (oxfmt)
pnpm typecheck    # Type check (tsc)
pnpm test         # Run tests (Vitest)
pnpm coverage     # Tests with coverage
pnpm knip         # Detect unused code/deps
pnpm db:push      # Push schema changes to database
pnpm db:studio    # Open Drizzle Studio
```

## Conventions

- Use `satisfies` for type narrowing when possible (e.g., config objects).
- Test files use the `.spec.ts` suffix and live next to the code they test.
- Sort object keys and import statements alphabetically.
- Use `tiny-invariant` for runtime assertions.
- Prefer named exports over default exports (except for Next.js pages/layouts).
- Keep server actions thin -- one action per file in `src/actions/`.

## Do NOT

- Edit files in `src/components/ui/` manually -- these are Shadcn-generated.
- Use Prettier -- this project uses oxfmt.
- Use `process.env` directly -- import `env` from `@/env`.
- Add unnecessary `"use client"` directives -- prefer Server Components.
- Use raw SQL -- use Drizzle ORM's query builder.
- Leave comments in the codebase that are not JSDoc or TODO/FIXME notes.
- Use redundant return types for internal functions that can be inferred
- Be lazy when dealing with static analysis warnings/errors -- address them promptly.

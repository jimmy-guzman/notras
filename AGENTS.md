# notras

A personal note-taking app -- "A simple space to capture your thoughts as they come."

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack, React Server Components)
- **Language:** TypeScript (strict mode)
- **Database:** SQLite via Turso/libSQL (`@libsql/client`) + Drizzle ORM
- **UI:** Shadcn UI (radix-maia style, stone base) + Tailwind CSS 4
- **Animation:** Motion (layout animations for shared element transitions)
- **Formatting:** oxfmt (Prettier-compatible, Rust-based)
- **Linting:** ESLint 9 with `@jimmy.codes/eslint-config`
- **Testing:** Vitest + Testing Library + happy-dom
- **Package Manager:** pnpm

## Project Structure

```txt
src/
  actions/          # Server actions (all data mutations go here)
  app/              # Next.js App Router pages and layouts
    settings/       # Settings page (profile editing)
  components/       # React components
    settings/       # Settings-related components (profile form, etc.)
    ui/             # Shadcn UI components (auto-generated, don't manually edit)
  lib/              # Client utilities, search params
    utils/          # Pure utility functions (formatting, filters, etc.)
  server/
    db/             # Drizzle client and schemas (SQLite)
    repositories/   # Data access layer (interfaces + DB implementations)
    schemas/        # Zod validation schemas for server-side input
    services/       # Business logic and external I/O (each service is self-contained)
  testing/          # Shared test utilities
  env.ts            # Type-safe env vars via @t3-oss/env-nextjs + Zod
data/
  notras.db         # Local SQLite database (git-ignored)
```

## Key Patterns

- **Server actions** live in `src/actions/` with `"use server"` directive. They use `serverAction()` from `@/lib/authorized` to get the device user ID before performing DB operations.
- **API routes** should call services directly, not server actions. Server actions (`"use server"`) are for client-side form mutations only. API routes use `serverAction()` from `@/lib/authorized` for auth, then call services.
- **Single-user model:** No authentication. A single "device" user (ID: `"device"`) is auto-seeded on first run via `getDeviceUserId()` in `src/server/services/user-service.ts`. All browsers on the same machine share the same notes.
- **Services** live in `src/server/services/`. Each service file is self-contained: it owns its interface, implementation class, and a lazy singleton getter (e.g., `getNoteService()`). No central container -- consumers import directly from the service they need.
- **Repositories** live in `src/server/repositories/`. They define an interface and a DB implementation for data persistence. Services depend on repository interfaces, not concrete implementations.
- **Validation** uses Zod schemas from `src/server/schemas/` inside server actions (parse FormData before calling services).
- **Zod v4:** The project uses Zod 4. Use `z.email()` instead of `z.string().email()`. Use `z.treeifyError(error)` instead of `error.flatten().fieldErrors` -- the return shape is `{ errors: string[], properties: Record<key, { errors: string[] }> }`.
- **IDs** are generated with `typeid-js`. Format: `prefix_<26-char base32>` (e.g., `note_01h455vb4pex5vsknk084sn02q`). Validate with regex: `/^prefix_[\da-hjkmnp-tv-z]{26}$/`.
- **Cache invalidation** uses `updateTag("notes")` from `next/cache` after mutations.
- **Path alias** `@/*` maps to `./src/*`.
- **Environment variables** are validated in `src/env.ts` using `@t3-oss/env-nextjs` with Zod. Import from `@/env` -- never use `process.env` directly. The only env var is `DATABASE_PATH` (defaults to `file:./data/notras.db`).
- **Database schemas** are in `src/server/db/schemas/`. Use Drizzle ORM query builder, not raw SQL. Dialect is SQLite (`sqliteTable`). New schema modules must be spread into the `schema` object in `src/server/db/index.ts`.
- **Components** use Shadcn UI primitives from `@/components/ui/`. Add new Shadcn components via the CLI (`pnpm dlx shadcn@latest add <component>`).
- **Navigation links** in the top nav use `Button` + `Link` + `Tooltip` + `Kbd` with single-letter hotkeys (e.g., `h` for home, `n` for new note, `s` for settings). No dropdowns -- keep it flat and minimal.
- **Global hotkeys** are registered in `HotkeysProvider` (`src/components/hotkeys-provider.tsx`). When adding a new nav route, also register its hotkey there.
- **Form hotkeys:** Forms that edit content use `useHotkeys("mod+enter")` to submit and `useHotkeys("escape")` to cancel, with `<Kbd>⌘</Kbd><Kbd>⏎</Kbd>` badges on the submit button. For note forms, use `FormHotkeys` wrapper; for non-note forms (like settings), wire hotkeys directly with `useHotkeys` and `enableOnFormTags: ["INPUT"]` or `["TEXTAREA"]`.
- **`useActionState` pattern:** For forms that stay on the same page after submit (e.g., settings profile), use `useActionState` with a state shape like `{ success: boolean, message?: string, errors?: Record<field, string[]> }`. For forms that redirect after submit (e.g., create/edit note), use plain `action` with `redirect()`.
- **Form aesthetic:** Forms use bare inputs in a `flex flex-col gap-6` layout (no Card wrappers). Labels and button text are lowercase. Action buttons are right-aligned at the bottom: cancel (outline) + submit (primary with Kbd hints). Back button with `ArrowLeftIcon` at the top of the page.

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
- Test titles (`it`/`test`) must start with "should" (enforced by `vitest/valid-title`).
- Use `toStrictEqual()` instead of `toEqual()` (enforced by `vitest/prefer-strict-equal`).
- Sort object keys and import statements alphabetically.
- Use top-level `import type` declarations, not inline `import { type Foo }` (enforced by `import-x/consistent-type-specifier-style`).
- Arrow functions: use implicit return for single-expression bodies, explicit `return` for multi-line (enforced by `arrow-style/arrow-return-style`). Note: even single expressions that span multiple lines (e.g., a function call with multi-line args) require explicit `return`.
- Use `tiny-invariant` for runtime assertions.
- Prefer named exports over default exports (except for Next.js pages/layouts).
- Keep server actions thin -- one action per file in `src/actions/`.
- In tests, avoid direct DOM node access (`.closest()`, `.firstChild`, etc.) -- use Testing Library queries instead (enforced by `testing-library/no-node-access`).
- Use `toHaveTextContent` instead of asserting on `.textContent` (enforced by `jest-dom/prefer-to-have-text-content`).
- Use template literals instead of string concatenation (enforced by `prefer-template`).
- Side-effect imports (e.g., `import "./types"`) must come before value imports within the same group (enforced by `perfectionist/sort-imports`).
- Use `replaceAll()` instead of `replace()` with global regex (enforced by `unicorn/prefer-string-replace-all`).
- Use `**` operator instead of `Math.pow()` (enforced by `prefer-exponentiation-operator`).
- Do not use `??` or `||` fallbacks when the left-hand side type is already non-nullable (enforced by `@typescript-eslint/no-unnecessary-condition`).
- **Lowercase aesthetic:** All user-facing text in the UI is lowercase -- labels, button text, headings, placeholder text, toast messages, tooltips, etc. This is a deliberate design choice across the entire app, not just forms.

## Testing Notes

The project uses **happy-dom** as the test environment. The custom `render` from `@/testing/utils` wraps components in `NuqsTestingAdapter`, `TooltipProvider`, and `Toaster`.

### Known happy-dom limitations

- **Clipboard:** happy-dom's `navigator.clipboard.writeText` always resolves successfully. `Object.defineProperty` and `vi.stubGlobal` cannot make it reject, so clipboard error/toast tests are not feasible.
- **Radix Select:** `target.hasPointerCapture` is not implemented, so Radix `<Select>` dropdowns can't be opened via `userEvent.click()`. Only the default rendered state can be tested.
- **Timezone-safe dates:** Use `new Date(2025, 5, 15)` (local time constructor) instead of `new Date("2025-06-15")` (parsed as UTC midnight, shifts in local timezone).

### Mocking patterns

- **`motion/react`:** Mock `motion.li` / `motion.div` as plain HTML elements for components using Motion layout animations.
- **`react-hotkeys-hook`:** Mock with `vi.mock("react-hotkeys-hook", () => ({ useHotkeys: vi.fn() }))` when testing components that use `useHotkeys`, since it captures keyboard events.
- **Server actions:** Mock the action module (e.g., `vi.mock("@/actions/pin-note", () => ({ pinNote: vi.fn() }))`) to avoid `"use server"` context errors.

### Querying Shadcn components

- `<Separator>` renders with `role="none"` (decorative). Query by `[data-slot='separator']` instead of `role="separator"`.

## Do NOT

- Edit files in `src/components/ui/` manually -- these are Shadcn-generated.
- Use Prettier -- this project uses oxfmt.
- Use `process.env` directly -- import `env` from `@/env`.
- Add unnecessary `"use client"` directives -- prefer Server Components.
- Use raw SQL -- use Drizzle ORM's query builder.
- Leave comments in the codebase that are not JSDoc or TODO/FIXME notes.
- Use redundant return types for internal functions that can be inferred
- Be lazy when dealing with static analysis warnings/errors -- address them promptly.
- Leave unused exports, dependencies, or files -- run `pnpm knip` to detect and remove them.
- Leave tests in a failing state -- after making changes, run `pnpm test` and fix any broken tests before finishing.
- Leave the build broken -- after making changes, run `pnpm build` and fix any errors before finishing.

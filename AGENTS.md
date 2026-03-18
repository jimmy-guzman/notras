# notras

A personal note-taking app -- "Just write, otra vez."

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack, React Server Components)
- **Language:** TypeScript (strict mode)
- **Database:** SQLite via Turso/libSQL (`@libsql/client`) + Drizzle ORM
- **Effect:** Effect-TS 3.x — typed errors, Layer/DI, Effect Schema, structured logging, fiber concurrency
- **Actions:** `next-safe-action` for type-safe server actions; `next-safe-action/hooks` for client-side `useAction` and `useOptimisticAction`
- **UI:** Shadcn UI (radix-maia style, stone base) + Tailwind CSS 4
- **Animation:** Motion (layout animations for shared element transitions)
- **Formatting:** oxfmt (Prettier-compatible, Rust-based)
- **Linting:** ESLint 9 with `@jimmy.codes/eslint-config`
- **Testing:** Vitest + Testing Library + happy-dom (unit/component), Playwright (e2e)
- **Package Manager:** pnpm

## Project Structure

```txt
src/
  actions/          # Server actions (data reads with "use cache", mutations)
  app/              # Next.js App Router pages and layouts
    (home)/         # Route group for home page (scoped loading boundary)
    api/
      assets/[id]/  # GET /api/assets/:id — serve stored asset files
      export/       # GET /api/export — zip export of all data
      icons/        # PWA icon routes (Next.js ImageResponse)
        192/
        512/
      reminders/
        stream/     # GET /api/reminders/stream — SSE reminder events
    notes/
      (list)/       # Route group for notes list (scoped loading boundary)
      [id]/
        edit/       # Edit note page
      new/          # New note page
    settings/       # Settings page (profile, export, import)
  components/       # React components
    folders/          # Folder management (panel, create, rename, delete)
    notes/          # Note-related components (cards, filters, actions, etc.)
      assets/       # Asset components (uploader, preview, list)
    settings/       # Settings-related components (profile form, export, import)
    ui/             # Shadcn UI components (auto-generated, don't manually edit)
  lib/              # Client utilities, search params, safe-action client
    ui/             # Shadcn utility (cn)
    utils/          # Pure utility functions (formatting, filters, etc.)
  server/
    db/             # Drizzle client, schemas (SQLite), and Database Context.Tag
    errors.ts       # Typed errors: DatabaseError, NotFoundError (Data.TaggedError)
    layer.ts        # AppLayer (unexported) + AppRuntime (ManagedRuntime, exported)
    repositories/   # Data access layer (Effect Context.Tag interfaces + DB implementations)
    schemas/        # Effect Schema validation schemas for server-side input
    services/       # Business logic and external I/O (Effect Context.Tag, one Layer per service)
  testing/          # Shared test utilities
  env.ts            # Type-safe env vars via @t3-oss/env-nextjs + Zod
e2e/
  smoke.spec.ts     # Playwright smoke tests (home page, navigation)
  tsconfig.json     # Separate tsconfig for Playwright (no Vitest globals)
data/
  notras.db         # Local SQLite database (git-ignored)
```

## Architecture

- **Single-user model:** No authentication. A single "device" user (ID: `"device"`) is auto-seeded on first run via `getDeviceUserId()` in `src/server/services/user-service.ts`. All browsers on the same machine share the same notes.

## Key Patterns

- **Server actions** live in `src/actions/`. Two patterns coexist:
  - **`next-safe-action` pattern** (mutations): Import `authActionClient` from `@/lib/safe-action`. Define as `authActionClient.schema(schema).action(async ({ parsedInput, ctx }) => { ... })` and export the result. The `authActionClient` middleware resolves `userId` via `AppRuntime` and injects it into `ctx`. Validation is automatic via the schema. On the client, use `useAction` from `next-safe-action/hooks` for state (`action.isPending`, `action.isSuccess`, `action.result`). Check `action.result.serverError` for error feedback and show toasts in the `onError` callback of `useAction`. Only show a success toast when the outcome isn't self-evident from the UI (e.g. a setting saved without a visible state change) — if the UI already reflects the change, skip it. Throw a plain `Error` for expected failures; the message is surfaced as `serverError` on the client.
  - **Plain `"use server"` FormData pattern** (FormData mutations that redirect): For forms submitted via native `<form action={...}>` (i.e., `FormHotkeys`) that need a server-side `redirect()` after success. Export a plain `async function` that accepts `FormData`, manually parse fields with `formData.get()`, decode and validate with `Schema.decodePromise`, resolve `userId` via `AppRuntime.runPromise(UserService.pipe(Effect.flatMap(svc => svc.getDeviceUserId())))`, then call service methods and `redirect()`. Use `typeof val === "string" ? val : ""` (not `String(...)`) to extract string fields from FormData. The function can be passed directly to `<form action={...}>` and to `FormHotkeys`'s `action` prop (both accept `(formData: FormData) => Promise<void>`).
  - **Read actions** (no `"use server"`, called directly from RSCs): Files like `get-notes.ts`, `get-note.ts`, `get-links.ts` export plain `async function`s with no directive. They call `AppRuntime.runPromise` to resolve the `userId` and fetch data, and use `"use cache"` at the top of cacheable function bodies with `cacheTag(...)` as the first statement. For queries that depend on relative time filters (e.g. `time: "today" | "yesterday" | ...`), caching is bypassed entirely — a separate uncached helper is called instead, since cached results would be stale immediately. Read actions are never called from client components.
  - Keep server actions thin — one action per file. Read actions that share a cache scope (e.g., `getNotes` + `getNotesCount`) may coexist in one file.
- **API routes** for binary/streaming responses are plain Next.js Route Handlers under `src/app/api/`. There is no Hono layer. **New binary or streaming endpoints go directly in `src/app/api/<domain>/route.ts`** as standard `export async function GET(request: Request)` handlers. Do not use this for data mutations or reads that could be server actions.
- **Effect runtime boundary:** `AppRuntime` (a `ManagedRuntime`) lives in `src/server/layer.ts` and is the single point where Effects are executed. Never call `Effect.runPromise` or `Effect.runFork` directly -- always go through `AppRuntime.runPromise` / `AppRuntime.runFork`. This ensures fibers inherit the managed runtime's logger, context, and supervision. The `AppLayer` (unexported) wires all service and repository Layers together with `DatabaseLive` at the root.
- **Services** live in `src/server/services/`. Each file defines an `interface IFooService`, a `class FooService extends Context.Tag("FooService")<FooService, IFooService>()`, a `makeFooService` factory via `Effect.gen`, and an exported `FooServiceLive` Layer. Services depend on repository Tags, not concrete implementations.
- **Repositories** live in `src/server/repositories/`. Same pattern: `interface IFooRepository`, `class FooRepository extends Context.Tag(...)`, `FooRepositoryLive` Layer. Repositories depend on the `Database` Context.Tag (the Drizzle client).
- **Typed errors** live in `src/server/errors.ts`: `DatabaseError` and `NotFoundError` extend `Data.TaggedError`. Services convert `DatabaseError` to defects via `.pipe(Effect.orDie)` — this is **intentional**: all DB errors are fatal and handled uniformly at the runtime boundary, so callers don't need to handle them differentially. Do not remove `.orDie` calls without also adding `Effect.catchTag` recovery at every call site — otherwise typed errors will propagate unhandled and cause runtime failures. The one exception is `NotFoundError` in `UserService.getProfile`, which is typed in the return signature but currently not caught by callers (a known gap, not an oversight to fix without a plan).
- **Effect flatMap naming:** Use `ServiceTag.pipe(Effect.flatMap(svc => svc.method(...)))` — NOT `Effect.flatMap(ServiceTag, fn)`. The latter triggers the `unicorn/no-array-method-this-argument` lint rule.
- **Validation** uses Effect Schema from `src/server/schemas/`. For `next-safe-action` mutations, pass the schema directly to `authActionClient.schema(schema)`.
- **`readonly` arrays from Schema:** Effect Schema `decode` results are `readonly`. Spread before passing to service methods that accept mutable arrays: `[...tags]`.
- **IDs** are generated with `typeid-js`. Format: `prefix_<26-char base32>` (e.g., `note_01h455vb4pex5vsknk084sn02q`). Validate with regex: `/^prefix_[\da-hjkmnp-tv-z]{26}$/`.
- **Cache invalidation** uses `updateTag("notes")` from `next/cache` after mutations.
- **`"use cache"` directive:** Read actions (e.g., `get-note.ts`, `get-notes.ts`) use the `"use cache"` directive with `cacheTag("notes")` for automatic caching. This is enabled by `experimental: { useCache: true }` in `next.config.ts`. Do **not** use `"use cache"` on time-dependent queries (e.g., "find reminders where `remindAt <= now()`") -- the cached result goes stale immediately since `now()` changes every call. For read actions with optional time filters (like `getNotes`), the exported function routes to a cached helper when `time === "all"` and calls an uncached helper directly for relative time values (`"today"`, `"yesterday"`, `"week"`, `"month"`, `"year"`). The `"use cache"` directive lives only on the cached helper, not on the exported entry point.
- **Navigation links** in the top nav use `Button` + `Link` + `Tooltip` + `Kbd` with single-letter hotkeys (e.g., `h` for home, `n` for new note, `s` for settings). No dropdowns -- keep it flat and minimal.
- **Global hotkeys** are registered in `HotkeysProvider` (`src/components/hotkeys-provider.tsx`). When adding a new nav route, also register its hotkey there.
- **`NoteDropPanel`** (`src/components/notes/note-drop-panel.tsx`) is a `"use client"` component rendered via `createPortal` → `document.body` as a fixed floating pill at the bottom center of the screen. It is always visible on `/notes` (even with 0 folders) and hidden on all other pages unless a drag is in progress. It receives `folders` as a server-side prop from `layout.tsx` (avoids async load delay), reads `activeFolder` internally via `useQueryStates`, and serves three purposes: (1) a filter surface (click a folder chip to filter by folder), (2) a drag-and-drop target for moving notes between folders (drop onto a `DropChip`), (3) an "unfiled" drop target (drop onto `UnfiledChip` → `moveNoteToFolder` with `folderId: null`), and (4) a trash drop target (drop onto `TrashChip` → confirmation `AlertDialog` → `deleteNote`). Use a `mounted` state guard (`useEffect` → `setMounted(true)`) before calling `createPortal` to prevent SSR errors. Wrap `<NoteDropPanel>` in `<Suspense>` in `layout.tsx` because it uses `useSearchParams` internally via `nuqs`.
- **Tagging** — tags are stored in a separate `tags` table with a many-to-many `note_tags` join table. `getTagsForNotes(noteIds)` bulk-fetches tags for a list of note IDs and returns a `Record<noteId, SelectTag[]>` map. Tags are rendered as `Badge` links on note cards and list items via `NoteTags`; clicking a tag sets the `tag` search param to filter the notes list. The `TagInput` component in the edit form handles inline tag creation and deletion. Active tag and folder filter chips are rendered by `ActiveFiltersChip` (replaces the old `TagFilterChip`).

### Forms

- **Form hotkeys:** Forms that edit content use `useHotkeys("mod+enter")` to submit and `useHotkeys("escape")` to cancel, with `<Kbd>⌘</Kbd><Kbd>⏎</Kbd>` badges on the submit button. For note forms, use `FormHotkeys` wrapper; for non-note forms (like settings), wire hotkeys directly with `useHotkeys` and `enableOnFormTags: ["INPUT"]` or `["TEXTAREA"]`. The `mod+enter` hotkey handler must guard against duplicate submissions: check `action.isPending` and return early if true, since `disabled={action.isPending}` on the submit button only blocks clicks and does not protect the hotkey path.
- **`useAction` pattern:** For forms that use `next-safe-action` mutations, use `useAction` from `next-safe-action/hooks`. Submit by calling `action.execute(parsedInput)` directly (no `react-hook-form` needed for simple forms). For loading state, check `action.isPending`. Show error toasts in the `onError` callback and success toasts in `onSuccess` only when the outcome isn't obvious from the UI. For reactive field values in complex forms, prefer `useWatch` over `form.watch()` (React Compiler compatibility). Use `Controller` for non-native inputs (file inputs needing `File` extraction, Radix Select) and `register()` for simple native text/email inputs.
- **Field component:** Use `<Field>`, `<FieldLabel>`, `<FieldDescription>`, `<FieldError>` from `@/components/ui/field` for form field structure instead of raw `<div>` + `<Label>` + manual error `<p>` tags. Set `data-invalid={!!fieldState.error || undefined}` on `<Field>` to turn labels red on validation error.
- **Button disabled state:** Keep submit buttons always enabled for a11y -- only disable during `action.isPending` to prevent double-submits, never based on validation state like `formState.isValid`.
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
pnpm e2e          # Run e2e tests (Playwright)
pnpm e2e:ui       # Run e2e tests with UI
pnpm db:push      # Push schema changes to database
pnpm db:studio    # Open Drizzle Studio
```

## Verification

After **every** set of changes, run all of these checks before considering the task done. Do NOT skip any step -- the build in particular is easy to forget and catches errors (like missing Suspense boundaries) that other checks miss.

```txt
pnpm knip         # 0. Check for unused code/deps (fix before proceeding)
pnpm typecheck    # 1. Type check
pnpm lint         # 2. Lint (fix errors before proceeding)
pnpm test         # 3. Unit tests
pnpm build        # 4. Production build (MUST pass -- catches SSR/prerender errors)
```

If any step fails, fix the issue and re-run from that step. Do not move on until all four pass.

## Conventions

- **Path alias** `@/*` maps to `./src/*`.
- **Environment variables** are validated in `src/env.ts` using `@t3-oss/env-nextjs` with Zod. Import from `@/env` -- never use `process.env` directly. The only env var is `DATABASE_PATH` (defaults to `file:./data/notras.db`). `NODE_ENV` is also validated as a shared env var.
- **Database schemas** are in `src/server/db/schemas/`. Use Drizzle ORM query builder, not raw SQL. Dialect is SQLite (`sqliteTable`). New schema modules must be spread into the `schema` object in `src/server/db/index.ts`.
- **Components** use Shadcn UI primitives from `@/components/ui/`. Add new Shadcn components via the CLI (`pnpm dlx shadcn@latest add <component>`). Always prefer a Shadcn component over hand-rolling custom UI -- check the registry first (`shadcn_search_items_in_registries`) before building something from scratch.
- **Conditional classes:** Use `cn()` from `@/lib/ui/utils` for all conditional or merged Tailwind class strings -- never template literals. `cn` wraps `clsx` + `tailwind-merge`, so it handles conflict resolution correctly (e.g., `cn("px-3", isActive && "bg-primary/10")`).
- **Icons** come from `lucide-react` exclusively. Always import using the `Icon` suffix (e.g., `PlusIcon` not `Plus`, `SettingsIcon` not `Settings`).
- **Effect Schema (server layer):** Server-side validation schemas in `src/server/schemas/` use `Schema` from the `effect` package -- not Zod. Use `Schema.Struct`, `Schema.String`, `Schema.minLength`, `Schema.pattern`, etc.
- **Zod (env only):** Zod is used in one place only: `src/env.ts` (via `@t3-oss/env-nextjs`). Do not use Zod for server action or service-layer validation — use Effect Schema instead.
- Use `satisfies` for type narrowing when possible (e.g., config objects).
- Test files use the `.spec.ts` suffix and live next to the code they test.
- Sort object keys and import statements alphabetically.
- Prefer named exports over default exports (except for Next.js pages/layouts).
- **Bottom-up file structure:** Files should read bottom-up -- private/helper components and functions at the top, the main exported component at the bottom. This way the file's public API is immediately visible when you scroll to the end.
- **Lowercase aesthetic:** All user-facing text in the UI is lowercase -- labels, button text, headings, placeholder text, toast messages, tooltips, etc. This is a deliberate design choice across the entire app, not just forms.
- **Date formatting:** All date display in components goes through `formatDate` (date only) and `formatDateTime` (date + time) from `@/lib/utils/format.ts`. Both return lowercase output to match the app's aesthetic. Do not use raw `format()` from `date-fns` directly in components.

### Lint-enforced

These rules are caught by the linter, but following them preemptively avoids round-trips:

- Test titles (`it`/`test`) must start with "should" (enforced by `vitest/valid-title`).
- Use `toStrictEqual()` instead of `toEqual()` (enforced by `vitest/prefer-strict-equal`).
- Use top-level `import type` declarations, not inline `import { type Foo }` (enforced by `import-x/consistent-type-specifier-style`).
- Arrow functions: use implicit return for single-expression bodies, explicit `return` for multi-line (enforced by `arrow-style/arrow-return-style`). Note: even single expressions that span multiple lines (e.g., a function call with multi-line args) require explicit `return`.
- In tests, avoid direct DOM node access (`.closest()`, `.firstChild`, etc.) -- use Testing Library queries instead (enforced by `testing-library/no-node-access`).
- Use `toHaveTextContent` instead of asserting on `.textContent` (enforced by `jest-dom/prefer-to-have-text-content`).
- Use template literals instead of string concatenation (enforced by `prefer-template`).
- Side-effect imports (e.g., `import "./types"`) must come before value imports within the same group (enforced by `perfectionist/sort-imports`).
- Use `replaceAll()` instead of `replace()` with global regex (enforced by `unicorn/prefer-string-replace-all`).
- Use `**` operator instead of `Math.pow()` (enforced by `prefer-exponentiation-operator`).
- Do not use `??` or `||` fallbacks when the left-hand side type is already non-nullable (enforced by `@typescript-eslint/no-unnecessary-condition`).

## Testing Notes

The project uses **happy-dom** as the test environment. The custom `render` from `@/testing/utils` wraps components in `NuqsTestingAdapter`, `TooltipProvider`, and `Toaster`.

### E2E tests (Playwright)

- E2e tests live in `e2e/` at the project root and use a separate `e2e/tsconfig.json` (no Vitest globals).
- `playwright.config.ts` auto-pushes the DB schema (`db:push`) before starting the server, using an isolated test database at `data/notras-test.db`.
- Locally, tests run against the dev server (`pnpm dev`). On CI, tests run against a production build (`pnpm build` + `pnpm start`).
- Only Chromium is configured (Desktop Chrome). Add more projects to `playwright.config.ts` if cross-browser testing is needed.
- Test titles must start with "should" (same convention as Vitest).
- Vitest is configured to exclude `e2e/` so the two test runners don't conflict.

### Known happy-dom limitations

- **Clipboard:** happy-dom's `navigator.clipboard.writeText` always resolves successfully. `Object.defineProperty` and `vi.stubGlobal` cannot make it reject, so clipboard error/toast tests are not feasible.
- **Radix Select:** `target.hasPointerCapture` is not implemented, so Radix `<Select>` dropdowns can't be opened via `userEvent.click()`. Only the default rendered state can be tested.
- **Timezone-safe dates:** Use `new Date(2025, 5, 15)` (local time constructor) instead of `new Date("2025-06-15")` (parsed as UTC midnight, shifts in local timezone).

### Mocking patterns

- **Prefer low-level stubs over module mocks:** Follow the MSW mentality -- mock at the lowest boundary possible. For environment variables, use `vi.stubEnv()` + `vi.resetModules()` + dynamic `import()` instead of `vi.mock("@/env")`. This exercises the real code path (`process.env` → `createEnv` → module under test) and catches integration issues.
- **`vi.stubEnv` pattern for env-dependent code:** Since `@t3-oss/env-nextjs` validates at module load time, tests that vary env vars must reset and re-import:

  ```ts
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function setupMyModule() {
    const { myFunction } = await import("./my-module");
    return myFunction;
  }

  it("should do something when ENV_VAR is set", async () => {
    vi.stubEnv("ENV_VAR", "value");
    const myFunction = await setupMyModule();
    // ...
  });
  ```

  Name the helper `setup*` (e.g., `setupSiteFooter`, `setupGetBuildInfo`) -- not `load*`.

- **`motion/react`:** Mock `motion.li` / `motion.div` as plain HTML elements for components using Motion layout animations.
- **`react-hotkeys-hook`:** Mock with `vi.mock("react-hotkeys-hook", () => ({ useHotkeys: vi.fn() }))` when testing components that use `useHotkeys`, since it captures keyboard events.
- **Server actions:** Mock the action module (e.g., `vi.mock("@/actions/pin-note", () => ({ pinNote: vi.fn() }))`) to avoid `"use server"` context errors.

### Querying Shadcn components

- `<Separator>` renders with `role="none"` (decorative). Query by `[data-slot='separator']` instead of `role="separator"`.

## Do NOT

- Edit files in `src/components/ui/` manually -- these are Shadcn-generated. After installing new Shadcn components, run `pnpm lint:fix` for auto-fixable issues. For remaining errors that aren't auto-fixable (e.g., `eqeqeq`, `no-array-index-key`, `no-leaked-conditional-rendering`), add rule overrides to the `"**/components/ui/**/*.tsx"` config in `eslint.config.ts` instead of editing the component source.
- Use Prettier -- this project uses oxfmt.
- Add unnecessary `"use client"` directives -- prefer Server Components.
- Leave comments in the codebase that are not JSDoc or TODO/FIXME notes.
- Use redundant return types for internal functions that can be inferred. This includes unexported functions, local `const` arrow functions, and inline callbacks where the return type is obvious from the expression. Exception: interface method signatures and exported functions where the return type is part of the public contract.
- Be lazy when dealing with static analysis warnings/errors -- address them promptly.
- Reach for type shortcuts (`as`, `!`, `any`) without first exhausting proper solutions -- if a type error appears during a refactor, understand why before casting. Casts are occasionally correct but should never be the first response to a compiler error.
- Silence lint errors or warnings by adding rule overrides to `eslint.config.ts` (e.g. `"no-console": "off"`) — the only valid exception is Shadcn-generated files under `**/components/ui/**`. Fix the root cause instead: if a rule fires, the code needs to change, not the config.
- Leave unused exports, dependencies, or files -- run `pnpm knip` to detect and remove them.
- Leave tests in a failing state -- after making changes, run `pnpm test` and fix any broken tests before finishing.
- Leave lint errors -- after making changes, run `pnpm lint` and fix any errors before finishing.
- Leave the build broken -- after making changes, run `pnpm build` and fix any errors before finishing.
- Forget to update docs -- after introducing a new pattern, feature, convention, or structural change, ask the user if `AGENTS.md` and/or `README.md` should be updated, then apply the changes.

## Branching & Commits

- **Branch naming:** `{type}-{short-description}` in kebab-case. The type prefix matches commit types: `feat-`, `fix-`, `refactor-`, `chore-`, `docs-`, `ci-`. Examples: `feat-add-folder-drag-drop`, `fix-no-more-confusing-cancel`.
- **Commits:** Use `pnpm gitzy` to create commits. It enforces Conventional Commits format with emojis and lowercase descriptions. Two approaches:
  - **Interactive mode:** Run `pnpm gitzy` and answer prompts. Use `pnpm gitzy -p -a` to stage all changes first.
  - **CLI flags (for automation/non-TTY):** Use flags to set values inline. Example: `pnpm gitzy -t feat -m "add pwa support" -d "detailed description" -p -a`. Available flags: `-t/--type`, `-m/--subject`, `-s/--scope`, `-d/--body`, `-b/--breaking`, `-i/--issues`, `-p/--passthrough`, `-D/--dry-run`, `--no-emoji`. See full flag list in gitzy docs.
  - Keep the subject line under 50 characters and wrap the body at 72 characters.
- **Pull requests:** Branch off `main`, push, and open a PR with `gh pr create`. PR titles follow the same conventional commit format as commits (e.g., `feat: ✨ add markdown preview`). Merge commits are disabled -- use squash merge.
- **Working on `main`:** If changes are being made on `main`, create a new branch before committing. Do not commit directly to `main`.

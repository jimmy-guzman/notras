# AGENTS.md

Apply these when writing or changing code, and when writing prose in this repo. They override your defaults where they conflict.

## Project docs

Read project docs selectively. `ARCHITECTURE.md` describes ownership, boundaries, and integrity constraints. `DESIGN.md` guides interface choices. `README.md` owns installation, the feature overview, and shortcuts. `CONTRIBUTING.md` owns build, verification, and maintenance instructions.

Update a document when its retained guidance changes. Routine behavior changes do not require a prose inventory or a documentation approval checkpoint. Implementation and tests provide evidence of current behavior; investigate disagreements with documentation before changing either.

Actionable future work belongs in GitHub issues. Check for an existing issue first. Record change-specific rationale in commits and PRs. Keep code comments self-contained, with no decision-log citations.

## Naming and layout

- **Files read bottom-up: helpers at the top, main exported symbol at the bottom.** Scrolling to the end shows the file's public API. Implementation details sit above it in the order you would compose them.

- **Follow the ecosystem's filename casing convention, and apply it to directories too.** kebab-case in TypeScript, snake_case in Rust. Framework-reserved filenames are exempt.

- **Test files are named `*.spec.ts` and live next to the code they test.** Rust tests live in `#[cfg(test)]` modules in the same file.

- **Name functions for what they do.** A caller should predict a function's return and throw behavior from its name. Do not hide filtering, auth, routing, or special-casing inside a function named for fetching or computing. Split a function that decides whether work should happen from the one that does it, and name the deciding part.

- **A comment carries a why, never a what.** Doc comments, meaning JSDoc and rustdoc, carry the contract. `TODO` and `FIXME` carry a known gap. A line comment earns its place when it holds reasoning the code cannot: a platform quirk, a race, a measured value, or the rejected alternative sitting one line away. Delete the ones that restate what the line below already says, since those are the ones that drift into lies.

- **`src/typeset.css` is vendored and edited by nobody.** It is upstream's file byte for byte, which is what lets `scripts/update-typeset.sh` re-fetch it and diff cleanly, so it is exempt from the comment rule above and excluded in `oxlint.config.ts` and `oxfmt.config.ts`. Change the note surface through the `.typeset-note` preset in `src/styles.css`, never in the vendored file.

- **Prefer named exports.** Reach a file in another folder under `src/` through the `@/*` alias, never a `../` path. A file in the same folder imports with `./`.

- **Ultracite, on oxlint and oxfmt, is the only JS/TS formatter and linter**, and it is dev tooling only. Rust uses rustfmt and Clippy. A rule is turned off or narrowed only in `oxlint.config.ts`, with the reason on the line above it. Everywhere else a false positive is suppressed at the call site with `oxlint-disable-next-line` and a reason after `--`. Inline event handlers are allowed. Let the React Compiler own memoization (`ARCHITECTURE.md`). Add `useCallback`, `useMemo`, or `memo` only when profiling identifies a performance problem and before-and-after measurements verify the benefit. Never suppress a `react/*` diagnostic owned by the compiler, since suppressions hide compilation bailouts. `src/components/ui/**` is owned code under the same rules, and `@shadcn/lint` keeps a component's appearance inside its file and leaves a call site only placement.

- **Sort object keys and imports alphabetically.** oxfmt sorts imports and the `sort-keys` fix sorts keys, both on save through the editors' oxc actions and again at `pnpm check` and in the commit hook.

- **Icons come from `lucide-react`, always the `Icon`-suffixed export.** Use `cn()` from the `cn` package for conditional Tailwind classes.

## Shaping a unit

- **Build the smallest thing that answers the request.** Skip config objects, options bags, plugin hooks, and abstraction layers for needs nobody stated. Reach for a function before a class, and a class before a framework, and a dependency last of all. `pnpm knip` has to stay clean.

- **One reason to change per unit.** Needing "and" to describe it means splitting it. Group code that changes together and separate code that changes for different reasons.

- **Derive values, do not assemble them.** A binding should be the result of an expression at the point of declaration. Branching, trying, or looping to populate a binding is a function waiting to be extracted, and pulling it out leaves code that produces a value where code used to mutate one into place.

- **Separate commands from queries.** Do not return a value from a function whose job is a side effect, and do not mutate state in a function whose job is to answer a question.

- **Do not optimize before it is measured.** Write the clear version. Add caching, memoization, or a clever data structure once a profiler names the cost, and not before.

## Boundaries between units

- **Depend on abstractions you pass in, not concretions you reach for.** Keep platform access at the boundaries described in `ARCHITECTURE.md`. Native handlers call `Library` operations; frontend data functions use the generated command client. Test native behavior with real files and SQLite, and frontend behavior at the IPC boundary.

- **Hide what varies behind a stable surface.** Keep implementation details, data shapes, and library choices private to their module. Expose the narrowest interface callers need.

- **Keep changes local.** Do not chain through objects like `a.b.c.d`, and do not wire modules together for convenience.

- **Prefer composition over inheritance.** Compose small functions or pass dependencies in. Inheritance suits a true is-a relationship, which comes up rarely.

## Editing existing code

- **Replace, do not accumulate.** When changing behavior, remove the old path. Do not add a branch or a flag beside the code you are superseding. Question any change that only grows the file, and aim for code the next person can delete.

- **Duplicate before you abstract, and even then, ask.** Do not extract shared code on the second occurrence. Wait for the third, and only when the copies change together for the same reason. Even then, surface the duplication and propose the extraction rather than doing it unprompted: whether two similar pieces are one concept takes context the person reading the diff has and you may not. A wrong abstraction couples two futures, and once one has to change and the other does not it grows conditionals or splits back apart, costing more than the copies would have.

- **Inline by default, and extract only when the helper earns a name.** Leave single-use helpers at the call site. Pull one out when it is reused, when it hides a complex boundary, or when its name improves the caller. Once a function grows several branches, let it read as the happy path and move the supporting detail into small named helpers below it.

## Types and errors

- **Do not reach for `as`, `!`, or escape-hatch types before exhausting proper solutions. Understand the type error before silencing it.** A cast leaves the mismatch to surface further from its cause.

- **Where TypeScript infers return types, do not annotate internal functions.** That covers unexported functions, local closures, and inline callbacks. Exported functions and interface method signatures are the exception, since their return type is part of the public contract.

- **Fail loud, never default silently.** Do not paper over missing or invalid data with fallback values, coalescing defaults, or swallowed exceptions. Parse and reject bad input where it enters, so the failure names its cause on the first line of the stack trace. Validate at the owning boundary described in `ARCHITECTURE.md`; persisted mutation inputs are validated in Rust.

- **A typed failure's message is the reason the user sees.** `ARCHITECTURE.md` covers how `nativeCommand()` preserves it for a toast, where the call site supplies what failed. Write those messages to the copy rules in `DESIGN.md`: a sentence, no error number, and never the action.

- **Await promises inside `async` functions and catch failures with `try/catch`, never with `.catch`.** One construct catches a synchronous throw and a rejection alike, and a callback that cannot be `async` calls one that is. A `.then` stays only where it sequences work, as the autosave write queue does. Report a caught failure with `toast.add({ description: reasonOf(error), title: what, type: "error" })`, naming the action in the app's words and carrying the error's message as the reason. A synchronous host hook that cannot be `async`, ProseMirror's click handler for one, keeps `.catch` with the same toast inside.

- **Resolve warnings and errors your changes introduce before finishing. Fix the root cause.** Silencing a warning converts a problem you can solve now into one that surfaces later without the warning attached.

## Testing

- **Use the existing test tools instead of rebuilding their infrastructure.** Use `render` for React components and `renderHook` for hooks without UI. Query controls by role or label and use `user-event` for interactions. Keep explicit events for tests that need an exact timer boundary, a native event payload, or an editor transaction. Shared setup owns React cleanup and DOM matchers; do not add per-file roots, polling loops, or act-environment flags.

- **Test behavior, not implementation.** Assert what a caller or user observes. Both terms scale with the unit under test: for a component it is the person clicking, for a function it is the code calling it.

- **Every test title starts with `should`.** The title has to finish the sentence "it should ...", which forces it to name an observable outcome. A title that cannot finish it is describing the implementation.

- **Prefer clarity over DRY in tests.** Inline the setup, repeat the literals, and skip a shared fixture that would hide the case under test. A test has to be readable on its own.

- **Test real behavior, not hypothetical behavior.** Cover the cases the contract promises. Do not manufacture edge cases the code makes no claim about.

- **Avoid mocks.** Use the seams the code already has, described under "Test seam" in `ARCHITECTURE.md`. Where faking is unavoidable, fake at the furthest boundary, meaning the filesystem or the index, and not at the module sitting next to the code under test.

- **A test and the behavior it asserts do not change in the same commit.** A failing test means the invariant is wrong or the change is, and deciding which comes before editing either.

## Fixing bugs

- **Diagnose the root cause before fixing, on every fix.** The analysis is mandatory; refactoring on it is not. Before fixing, ask why the architecture allowed the bug to exist and whether the same structure keeps producing others like it.

- **Prefer structural fixes over symptom patches.** A fix that removes the structural condition beats a guard, a special case, or a workaround that leaves the enabling structure standing. Reach for the symptom-layer patch once the root-cause fix is infeasible or belongs in a separate change, and never because it is larger or harder. When you do patch at the symptom layer, say so and name the root cause you are deferring.

## Deciding what to do

- **Judge work by correctness and feasibility, and frame choices the same way.** Ask whether a piece of work is correct, whether the current state is wrong or inconsistent, and whether it serves the goal. Cost, effort, and "is it worth it" decide nothing, and ROI is not one of the frames to present. Do not label a known-wrong thing low-value, marginal, an edge case, or not worth it to justify leaving it unfixed.

- **The only reason to stop is provable impossibility.** Hard, heavy, expensive, and a lot of work are not reasons to stop. Proven impossible or blocked is. Unsure which one you are looking at means finding out by trying it, measuring it, or proving it, before deciding.

## Verification

`CONTRIBUTING.md` lists the scripts. This is the gate: a subset, in the order that fails cheapest first. After every set of changes, run all of it before considering the task done:

```txt
pnpm knip             # 0. unused code/deps (fix before proceeding)
pnpm bindings:check   # native contract drift, before checking its callers
pnpm check            # 1. types, lint and format
pnpm coverage         # 2. unit tests (pnpm test watches, so it will not exit)
pnpm build:web        # 3. web bundle build
```

When Rust sources or gate configuration change, also run these commands from the repository root in this order:

```txt
cargo machete
cargo fmt --all -- --check
cargo clippy --workspace --locked --all-targets -- -D warnings
cargo test --workspace --locked
```

CI checks native binding drift on Linux before starting the TypeScript job. Clippy and tests run on macOS, Linux, and Windows; dependency and formatting checks run on Linux. Linux also publishes Rust coverage reports. Use uncovered code to investigate missing behavioral tests, without targeting a percentage. `CONTRIBUTING.md` lists tool installation and coverage commands.

Regenerate `src/server/adapters/bindings.ts` with `pnpm bindings`; do not edit its generated command signatures or runtime by hand. Change the native registry or export configuration in Rust. `ARCHITECTURE.md` describes the contract and test boundary.

For anything touching the Rust side or window behavior, also launch `pnpm dev` and check the affected behavior against the task's acceptance criteria. `pnpm smoke` covers one edit, save and relaunch path on macOS, and nothing automated covers the rest. Say which behaviors you checked and which you took from the code alone.

## When to stop and ask

- **Between phases:** after completing a discrete chunk of work, stop. Post a short summary, then ask before starting the next. The summary is a checkpoint where someone can correct course, before the next chunk compounds on the last.

- **On scope:** list the files a task will touch before touching them. Anything outside the list stops and asks. The list is what the reviewer approved when they approved the task.

- **On uncertainty:** where existing rules and the docs above do not cover a decision, stop and ask instead of inventing. An invented convention reads as authoritative while being arbitrary, which makes it harder to spot than a missing one.

- **On a debug loop:** after 3 consecutive fix attempts on the same error, stop. Report the error, what was tried, and the likely cause. Do not attempt a fourth fix without input. Repeated failures point at the mental model more often than at the fix, and each further attempt buries the evidence deeper.

## Evidence and verdicts

- **Attach evidence to every summary, and name the weakest part of it.** List the commands run and their results, the tests that now cover the change, and the observable behavior nothing checked. Then point at a file and a line and say what to run or read to test it, since a hedge covering the whole change gives a reviewer nowhere to start and you are the only one holding that information. A summary of what changed repeats the diff at lower resolution.

- **Report the decisions the spec did not make.** A task leaves things open: error shapes, ordering, what a partial state means. The implementation settles them. List what it settled, so the verdict covers those choices.

- **Split a task you cannot produce complete evidence for.** A task whose weakest part lands in several places at once, or whose decision list runs past what a reviewer can hold, has bundled work that then takes one verdict. Diff size measures how much code arrived and says nothing about how many choices sit inside it.

- **A finding you are not fixing gets written down.** An out-of-scope defect gets a GitHub issue, and an out-of-scope question goes to the person reviewing. Neither one widens the current change, and neither one reaches the end of the phase unwritten.

## Writing prose

These rules cover every markdown file here, plus commit messages and PR bodies.

### Formatting

- **No em dashes or en dashes.** Use a comma, a period, or a colon. Real punctuation says how the clauses relate. The ASCII `--` substitute goes too.

- **One line per paragraph, and no hard wrap.** A renderer reflows the text, so a newline inside a paragraph changes nothing on screen and costs a diff: changing one word rewraps every line under it. Let the editor soft-wrap. A heading, a table row, a list item, and a code block each keep their own line.

- **No horizontal rules above a heading.** The heading already divides the section. As a thematic break with no heading on either side, a rule is fine.

- **Straight quotes only, never curly.** Editors and tools disagree about curly quotes and some of them mangle the encoding. Code blocks are verbatim and exempt.

- **Sentence case subheadings.** Write `## Like this`, not `## Like This`. Proper nouns and acronyms keep their own casing.

- **No emoji in prose.** The gitmoji in a commit message is a required field of that format and stays.

- **Bold separates two kinds of content and never emphasizes one kind.** Use it for a field name against its value, or a rule against its rationale. Bolding the opening sentence of a paragraph fakes a heading. Promote it to a real heading or leave it as a sentence.

### Words

- **User-facing text in the app is cased by role.** Controls and titles lowercase, prose sentence case, xs section labels uppercase by CSS. `DESIGN.md` carries the rule.

- **Cut adverbs that only add emphasis.** Genuinely, actually, really, simply, truly, fundamentally, inherently, crucially, importantly, just. They assert a force the sentence has not earned. An adverb that changes the meaning, like "only" or "directly", stays.

- **Cut throat-clearing, emphasis crutches, and meta-commentary.** "Here's the thing", "It turns out", "The truth is", "Let me be clear", "Full stop", "Let that sink in", "This matters because", "Make no mistake", "It's worth noting", "At its core", "At the end of the day", "When it comes to", "Let's dive in", "In this section we'll".

- **Cut business jargon.** Navigate, unpack, lean into, landscape, game-changer, double down, deep dive, circle back, moving forward.

- **Cut filler.** "In order to" is "to". "Due to the fact that" is "because".

- **Use verbs, not nominalizations.** "Creates interfaces" beats "the creation of interfaces". A nominalization hides the actor and lengthens the sentence around it.

- **Repeat the clearest term instead of cycling synonyms.** A reader tracking two words for one thing has to keep checking whether they mean the same thing.

### Sentences

- **Active voice, with the actor named where one exists.** Passive voice drops the actor. Do not manufacture a human actor for a system behavior: "the index is rebuilt on launch" is correct and has nobody to name.

- **Short sentences.** Cut comma chains, participial constructions, and parenthetical asides. Read it aloud. Stumbling means it is still too long.

- **No sentence opens on an inverted Wh- clause.** "What triggers the reload is a newer mtime" holds the subject back to build suspense. Write "a newer mtime triggers the reload". A conditional opening is different and stays.

- **No binary contrast where one side is a foil.** This bans "not X, it's Y", "the question isn't X, it's Y", "stops being X and becomes Y", and "X. That's it." A contrast earns its place when both sides name something a person would pick. It fails when one side exists to make the other sound better.

- **No rhetorical setups, and no abstraction acting like a person.** This bans "what if", "think about it", "the data tells us". Name whoever or whatever does the thing.

### Paragraphs

- **One thought per paragraph, main idea first.** A reader decides from the opening sentence whether to keep going.

- **No paragraph ends on a punchy one-liner.** A closing fragment that sounds quotable is doing rhythm instead of work.

- **Vary rhythm.** Avoid three consecutive sentences of the same length.

- **Two items beat three.** Do not pad a list to a triplet. Readers hear the rule of three as cadence, so a padded third item announces that the writing is shaped for effect.

### Claims

- **State a claim with its evidence.** "Fast and lightweight" is not a claim. A file size, a benchmark, or a cited `D` entry is.

- **No unfounded evaluation.** This bans "the best framework", "everyone knows", "obviously".

- **No vague declaratives.** This bans "the reasons are structural", "the implications are significant". Name the reason or the implication.

- **No lazy extreme doing vague work.** Every, always, never, everyone, nobody. An invariant in `ARCHITECTURE.md` is exempt, where "never" is the normative operator of a testable statement.

- **Never invent a fact, a name, a date, or a citation to satisfy any rule above.** Specificity comes from the source or from the author. Adding a plausible detail during a rewrite puts a falsehood into a document people rely on.

### Voice

- **Third person for the system, imperative for instructions.** `AGENTS.md` gives instructions and addresses the reader. `ARCHITECTURE.md` and `DESIGN.md` describe a system and do not.

## Git and PRs

- **Branch naming: `{type}-{short-description}` in kebab-case.** Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `ci`.

- **Commit with `pnpm gitzy commit`** (Conventional Commits plus emoji, lowercase subjects under 50 characters, body wrapped at 72). Inline flags: `pnpm gitzy commit --type feat --scope ui -m "subject" --body "..."`, and `-D` for a dry run. Write the message with gitzy rather than typing the header by hand: the emoji is a required field of the format and the one for a type is not guessable.

- **Never commit directly to `main`.** Branch off `main`, open a PR with `gh pr create`, and squash merge. Squashing keeps one logical change per commit in history, and titles in the commit format double as release notes.

- **A PR description is prose under bold run-in labels, with no headings:**

  ```markdown
  Closes #123

  **Why.** <The problem: what was wrong, how it showed up, why now.>

  **Approach.** <The decisions the diff does not show.>

  **Review.** <What the reviewer should do with this.>
  ```

  The issue reference stands alone on the first line when there is one. Why is required and comes first, since it frames how a reviewer reads the change, and it says what was wrong rather than what changed. Approach holds only what the diff cannot show: the alternative rejected, a departure from the usual pattern, what is out of scope, the one behavior change inside a refactor. Review names the feedback wanted, where to start, and a behavior that was never exercised that a reviewer would assume was covered. A label exists only when its sentence does, so a dependency bump is often a Why alone, and nothing follows Review. A real before and after, a number or a screenshot, sits after the sentence it supports. Keep each paragraph to three sentences or fewer, and the whole body under about 180 words. The no-wrap rule matters more here than anywhere else: GitHub renders every single newline in a PR body as a line break, so a wrapped body arrives as a ragged column.

- **Releases are cut by release-please, and `package.json` holds the only version.** A conventional commit on `main` opens or updates a release PR; merging it tags `vX.Y.Z`, writes `CHANGELOG.md`, and drives the build, checksum and Homebrew cask jobs in `.github/workflows/release.yml`. Never hand-edit a version: `src-tauri/tauri.conf.json` derives it and `src-tauri/Cargo.toml`'s is pinned at `0.0.0`. The freeze covers that line and nothing else: a dependency added to the same file lands with the regenerated workspace `Cargo.lock`, which is what `cargo test --workspace --locked` checks. A stranded or partial release is republished with `gh workflow run release.yml -f tag=vX.Y.Z`, because the push path cannot redo it.

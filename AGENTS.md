# AGENTS.md

Apply these when writing or changing code, and when writing prose in this repo. They override your defaults where they conflict.

## Project docs

The context for this repo lives in the six documents below. Read the ones your change touches before changing anything.

| Doc               | What it holds                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ARCHITECTURE.md` | How the system is built: stack, files as the source of truth, the index schema, structure, layer boundaries, key patterns, invariants.                       |
| `DESIGN.md`       | The interface conventions the app is built to: principles, typography, color, the icon, space, motion, interaction, the editor surface, copy, accessibility. |
| `DECISIONS.md`    | A log of decisions made, each with its rationale and what it rejected. A record, not a rulebook.                                                             |
| `SPEC.md`         | What the app does, as claims a reader can check against a running build.                                                                                     |
| `DEFERRED.md`     | Work ruled out rather than done, each entry carrying the reason it was ruled out.                                                                            |
| `README.md`       | The front door. What notras is, how to run it, and the scripts and shortcuts tables it owns.                                                                 |

`AGENTS.md` holds rules and this map. Project fact belongs in one of the files above, so a stack detail, a pattern, or a color token added here is in the wrong place.

- **Behavior you change is a claim in `SPEC.md`.** Update the claim in the same commit that changes the behavior, since a spec that disagrees with the build misleads every reader who trusts it. A behavior with no claim yet gets one.

- **Work you rule out of the current change goes in `DEFERRED.md`,** carrying the reason. The bar is at the top of that file, and cost is not on it. What landed belongs in the commit, not in a second log.

- **A choice with a rejected alternative belongs in `DECISIONS.md`.** Ruling out an option for a reason worth recording makes the choice a decision. Add a numbered entry with the rationale and what was rejected.

- **Breaking an invariant in `ARCHITECTURE.md` is a design change.** Each one holds a property the architecture depends on, so changing one is never a refactor and gets a `DECISIONS.md` entry of its own.

- **Numbering is monotonic and IDs are never reused, even after the entry is removed.** A citation in a commit or a comment outlives the line it points at. Reusing an ID repoints every reference to it without any of them changing.

- **Cite IDs, never restate.** Write `D7` in code, commit messages, PR bodies, and the other docs. A copied constraint drifts away from its original as the original changes, while a citation keeps pointing at whatever the entry says now.

## Learning more about Effect

This repository uses the Effect TypeScript library.

Before writing any Effect code, read `node_modules/effect/AGENTS.md` in full and follow the links in the file when required.

If you need to learn more about particular Effect APIs and concepts that the guide does not cover, search through the source code in `node_modules/effect/src`.

## Naming and layout

- **Files read bottom-up: helpers at the top, main exported symbol at the bottom.** Scrolling to the end shows the file's public API. Implementation details sit above it in the order you would compose them. Route files are the exception: `export const Route` sits at the top, with components as function declarations below, which hoisting makes lint-clean.

- **Follow the ecosystem's filename casing convention, and apply it to directories too.** kebab-case in TypeScript, snake_case in Rust. Import mechanics and tooling depend on the convention, so it belongs to the language. Framework-reserved filenames are exempt.

- **Test files are named `*.spec.ts` and live next to the code they test.** Colocation puts a test where someone reading the code will find it, and one suffix keeps the runner's glob config short. Rust tests live in `#[cfg(test)]` modules in the same file.

- **Name functions for what they do.** A caller should predict a function's return and throw behavior from its name. Do not hide filtering, auth, routing, or special-casing inside a function named for fetching or computing. Split a function that decides whether work should happen from the one that does it, and name the deciding part.

- **A comment carries a why, never a what.** Doc comments, meaning JSDoc and rustdoc, carry the contract. `TODO` and `FIXME` carry a known gap. A line comment earns its place when it holds reasoning the code cannot: a platform quirk, a race, a measured value, or the rejected alternative sitting one line away. Delete the ones that restate what the line below already says, since those are the ones that drift into lies. Naming and structure carry everything else.

- **`src/typeset.css` is vendored and edited by nobody.** It is upstream's file byte for byte, which is what lets `scripts/update-typeset.sh` re-fetch it and diff cleanly, so it is exempt from the comment rule above and excluded in `biome.jsonc`'s `files.includes` (`D40`). Change the note surface through the `.typeset-note` preset in `src/styles.css`, never in the vendored file.

- **Prefer named exports.** Use the `@/*` alias for anything under `src/`.

- **Ultracite, a Biome preset, is the only formatter and linter** (`D15`, `D41`), and it is dev tooling only. No Prettier and no ESLint. Do not silence a lint error with a config override: suppress a false positive at the call site with `biome-ignore` and a reason. One override exists and is documented, the Shadcn `src/components/ui/**` block in `biome.jsonc`, which turns off the rules with no autofix because `scripts/update-shadcn.sh` regenerates those files (`D19`, `D37`).

- **Sort object keys and imports alphabetically.** Biome's `organizeImports` assist runs on save; `useSortedKeys` runs at `pnpm check` and in the commit hook, since neither editor config wires it. One exception the preset already encodes: route option objects, which `ultracite/biome/tanstack` leaves unsorted because their types infer in declaration order.

- **Icons come from `lucide-react`, always the `Icon`-suffixed export.** Use `cn()` from `@/lib/ui/utils` for conditional Tailwind classes.

## Shaping a unit

- **Build the smallest thing that answers the request.** Solve what was asked. Skip config objects, options bags, plugin hooks, and abstraction layers for needs nobody stated. Delete flexibility you are adding "for later". Reach for a function before a class, and a class before a framework, and a dependency last of all. `pnpm knip` has to stay clean.

- **One reason to change per unit.** A function or module should do one job. Needing "and" to describe it means splitting it. Group code that changes together and separate code that changes for different reasons.

- **Derive values, do not assemble them.** A binding should be the result of an expression at the point of declaration. Branching, trying, or looping to populate a binding is a function waiting to be extracted, and pulling it out leaves code that produces a value where code used to mutate one into place.

- **Separate commands from queries.** A function should either do something or answer something. Do not return a value from a function whose job is a side effect, and do not mutate state in a function whose job is to answer a question.

- **Do not optimize before it is measured.** Write the clear version. Add caching, memoization, or a clever data structure once a profiler names the cost, and not before.

## Boundaries between units

- **Depend on abstractions you pass in, not concretions you reach for.** This repo already names its ports: `FileStore` in `src/core`, `Database` in `src/server/db`. A service that reaches for a Tauri command directly cannot be tested. Nothing enforces this since `D43`, so `ARCHITECTURE.md` records the boundaries and a reviewer holds them.

- **Hide what varies behind a stable surface.** Keep implementation details, data shapes, and library choices private to their module. Expose the narrowest interface callers need.

- **Keep changes local.** Do not chain through objects like `a.b.c.d`, and do not wire modules together for convenience. A change in one place should not force edits in five.

- **Prefer composition over inheritance.** Compose small functions or pass dependencies in. Inheritance suits a true is-a relationship, which comes up rarely.

## Editing existing code

- **Replace, do not accumulate.** When changing behavior, remove the old path. Do not add a branch or a flag beside the code you are superseding. Question any change that only grows the file, and aim for code the next person can delete.

- **Duplicate before you abstract, and even then, ask.** Do not extract shared code on the second occurrence. Wait for the third, and only when the copies change together for the same reason. Even then, surface the duplication and propose the extraction rather than doing it unprompted: whether two similar pieces are one concept takes context the person reading the diff has and you may not. A wrong abstraction couples two futures, and once one has to change and the other does not it grows conditionals or splits back apart, costing more than the copies would have.

- **Inline by default, and extract only when the helper earns a name.** Leave single-use helpers at the call site. Pull one out when it is reused, when it hides a complex boundary, or when its name improves the caller. Once a function grows several branches, let it read as the happy path and move the supporting detail into small named helpers below it.

## Types and errors

- **Do not reach for `as`, `!`, or escape-hatch types before exhausting proper solutions. Understand the type error before silencing it.** A type error is signal. A cast silences the signal and leaves the mismatch, which then surfaces somewhere further from its cause.

- **Where TypeScript infers return types, do not annotate internal functions.** That covers unexported functions, local closures, and inline callbacks. Exported functions and interface method signatures are the exception, since their return type is part of the public contract.

- **Fail loud, never default silently.** Do not paper over missing or invalid data with fallback values, coalescing defaults, or swallowed exceptions. Parse and reject bad input where it enters, so the failure names its cause on the first line of the stack trace. Validation is Effect Schema in `src/server/schemas/`, not zod.

- **A typed failure's message is user-facing text.** `ARCHITECTURE.md` covers how `run()` gets it to a toast. Write those messages to the copy rules in `DESIGN.md`.

- **Resolve warnings and errors your changes introduce before finishing. Fix the root cause.** A warning fires because something is off. Silencing it converts a problem you can solve now into one that surfaces later without the warning attached.

## Testing

- **Test behavior, not implementation.** Assert what a caller or user observes. Both terms scale with the unit under test: for a component it is the person clicking, for a function it is the code calling it. A test that asserts internals breaks on every refactor while proving nothing about whether the code works.

- **Every test title starts with `should`.** The title has to finish the sentence "it should ...", which forces it to name an observable outcome. A title that cannot finish it is describing the implementation.

- **Prefer clarity over DRY in tests.** Inline the setup, repeat the literals, and skip a shared fixture that would hide the case under test. A test has to be readable on its own, and the pull toward DRY that improves production code tends to damage that.

- **Test real behavior, not hypothetical behavior.** Cover the cases the contract promises. Do not manufacture edge cases the code makes no claim about, since coverage bought that way measures nothing.

- **Avoid mocks.** Use the seams the code already has, described under "Test seam" in `ARCHITECTURE.md`. Where faking is unavoidable, fake at the furthest boundary, meaning the filesystem or the index, and not at the module sitting next to the code under test.

- **A test and the behavior it asserts do not change in the same commit.** A failing test means the invariant is wrong or the change is, and deciding which comes before editing either.

## Fixing bugs

- **Diagnose the root cause before fixing, on every fix.** The analysis is mandatory; refactoring on it is not. Assume a correct architecture has no bugs. Every bug is then evidence that the architecture permits it, beyond the one code path where it showed up. Before fixing, ask why the architecture allowed the bug to exist and whether the same structure keeps producing others like it.

- **Prefer structural fixes over symptom patches.** A fix that removes the structural condition beats a guard, a special case, or a workaround that leaves the enabling structure standing. Reach for the symptom-layer patch once the root-cause fix is infeasible or belongs in a separate change, and never because it is larger or harder. When you do patch at the symptom layer, say so and name the root cause you are deferring.

## Deciding what to do

- **Judge work by correctness and feasibility, and frame choices the same way.** Ask whether a piece of work is correct, whether the current state is wrong or inconsistent, and whether it serves the goal. Cost, effort, and "is it worth it" decide nothing, and ROI is not one of the frames to present. Do not label a known-wrong thing low-value, marginal, an edge case, or not worth it to justify leaving it unfixed.

- **The only reason to stop is provable impossibility.** Hard, heavy, expensive, and a lot of work are not reasons to stop. Proven impossible or blocked is. Unsure which one you are looking at means finding out by trying it, measuring it, or proving it, before deciding.

## Verification

`README.md` lists the scripts. This is the gate: a subset, in the order that fails cheapest first. After every set of changes, run all of it before considering the task done:

```txt
pnpm knip             # 0. unused code/deps (fix before proceeding)
pnpm typecheck        # 1. types
pnpm check            # 2. lint + format
pnpm coverage         # 3. unit tests (pnpm test watches, so it will not exit)
pnpm build:web        # 4. web bundle build
cargo test --locked   # 5. (when src-tauri changed) in src-tauri/, `D49`
```

CI runs these commands in this order, and runs `cargo test` on macOS and Linux, so a Rust change that passes on the platform you are on can still be the one that fails on the other.

For anything touching the Rust side or window behavior, also launch `pnpm dev` and check the change against `SPEC.md`'s claims for that area. Nothing automated covers it, which `D21` records. Say which claims you checked and which you took from the code alone.

## When to stop and ask

- **Between phases:** after completing a discrete chunk of work, stop. Post a short summary, then ask before starting the next. The summary is a checkpoint where someone can correct course, before the next chunk compounds on the last.

- **On scope:** list the files a task will touch before touching them. Anything outside the list stops and asks. The list is what the reviewer approved when they approved the task.

- **On uncertainty:** where existing rules and the docs above do not cover a decision, stop and ask instead of inventing. An invented convention reads as authoritative while being arbitrary, which makes it harder to spot than a missing one.

- **On a debug loop:** after 3 consecutive fix attempts on the same error, stop. Report the error, what was tried, and the likely cause. Do not attempt a fourth fix without input. Repeated failures point at the mental model more often than at the fix, and each further attempt buries the evidence deeper.

## Evidence and verdicts

- **Attach evidence to every summary, and name the weakest part of it.** List the commands run and their results, the tests that now cover the change, and the observable behavior nothing checked. Then point at a file and a line and say what to run or read to test it, since a hedge covering the whole change gives a reviewer nowhere to start and you are the only one holding that information. A summary of what changed repeats the diff at lower resolution.

- **Report the decisions the spec did not make.** A task leaves things open: error shapes, ordering, what a partial state means. The implementation settles them. List what it settled, so the verdict covers those choices.

- **Split a task you cannot produce complete evidence for.** A task whose weakest part lands in several places at once, or whose decision list runs past what a reviewer can hold, has bundled work that then takes one verdict. Diff size measures how much code arrived and says nothing about how many choices sit inside it.

- **A finding you are not fixing gets written down.** An out-of-scope defect gets an issue, and an out-of-scope question goes to the person reviewing. Neither one widens the current change, and neither one reaches the end of the phase unwritten. `DEFERRED.md` takes work ruled out, never a bug.

## Writing prose

These merge three sources: [stop-slop](https://github.com/hardikpandya/stop-slop), [humanizer](https://github.com/blader/humanizer), and [azat-io on technical texts](https://github.com/azat-io/azat-io/blob/main/content/blog/how-to-write-technical-texts/en.mdx). They cover every markdown file here, plus commit messages and PR bodies.

### Formatting

- **No em dashes or en dashes.** Use a comma, a period, or a colon. Both set a cadence that reads as machine-written. Neither states how the clauses relate, and picking real punctuation states it. The ASCII `--` substitute goes too.

- **One line per paragraph, and no hard wrap.** A renderer reflows the text, so a newline inside a paragraph changes nothing on screen and costs a diff: changing one word rewraps every line under it. Let the editor soft-wrap. A heading, a table row, a list item, and a code block each keep their own line.

- **No horizontal rules above a heading.** The heading already divides the section. As a thematic break with no heading on either side, a rule is fine.

- **Straight quotes only, never curly.** Editors and tools disagree about curly quotes and some of them mangle the encoding. Code blocks are verbatim and exempt.

- **Sentence case subheadings.** Write `## Like this`, not `## Like This`. Proper nouns and acronyms keep their own casing.

- **No emoji in prose.** The gitmoji in a commit message is a required field of that format and stays.

- **Bold separates two kinds of content and never emphasizes one kind.** Use it for a field name against its value, or a rule against its rationale. Bolding the opening sentence of a paragraph fakes a heading. Promote it to a real heading or leave it as a sentence.

### Words

- **User-facing text in the app is lowercase.** Labels, buttons, toasts, tooltips, placeholders, error messages. `DESIGN.md` carries the rule and `D18` carries the reasoning. Documentation prose is normal sentence case.

- **Cut adverbs that only add emphasis.** Genuinely, actually, really, simply, truly, fundamentally, inherently, crucially, importantly, just. They assert a force the sentence has not earned. An adverb that changes the meaning, like "only" or "directly", stays.

- **Cut throat-clearing, emphasis crutches, and meta-commentary.** "Here's the thing", "It turns out", "The truth is", "Let me be clear", "Full stop", "Let that sink in", "This matters because", "Make no mistake", "It's worth noting", "At its core", "At the end of the day", "When it comes to", "Let's dive in", "In this section we'll". Each one delays the sentence carrying the information.

- **Cut business jargon.** Navigate, unpack, lean into, landscape, game-changer, double down, deep dive, circle back, moving forward. Plain words exist for all of them and mean something narrower.

- **Cut filler.** "In order to" is "to". "Due to the fact that" is "because".

- **Use verbs, not nominalizations.** "Creates interfaces" beats "the creation of interfaces". A nominalization hides the actor and lengthens the sentence around it.

- **Repeat the clearest term instead of cycling synonyms.** A reader tracking two words for one thing has to keep checking whether they mean the same thing.

### Sentences

- **Active voice, with the actor named where one exists.** Passive voice drops the actor. Do not manufacture a human actor for a system behavior: "the index is rebuilt on launch" is correct and has nobody to name.

- **Short sentences.** Cut comma chains, participial constructions, and parenthetical asides. Read it aloud. Stumbling means it is still too long.

- **No sentence opens on an inverted Wh- clause.** "What triggers the reload is a newer mtime" holds the subject back to build suspense. Write "a newer mtime triggers the reload". A conditional opening is different and stays.

- **No binary contrast where one side is a foil.** This bans "not X, it's Y", "the question isn't X, it's Y", "stops being X and becomes Y", and "X. That's it." A contrast earns its place when both sides name something a person would pick, as in a rejection clause in `DECISIONS.md`. It fails when one side exists to make the other sound better.

- **No rhetorical setups, and no abstraction acting like a person.** This bans "what if", "think about it", "the data tells us". Name whoever or whatever does the thing.

### Paragraphs

- **One thought per paragraph, main idea first.** A reader decides from the opening sentence whether to keep going.

- **No paragraph ends on a punchy one-liner.** A closing fragment that sounds quotable is doing rhythm instead of work. If it reads like a pull-quote, rewrite it.

- **Vary rhythm.** Avoid three consecutive sentences of the same length.

- **Two items beat three.** Do not pad a list to a triplet. Readers hear the rule of three as cadence, so a padded third item announces that the writing is shaped for effect.

### Claims

- **State a claim with its evidence.** "Fast and lightweight" is not a claim. A file size, a benchmark, or a cited `D` entry is.

- **No unfounded evaluation.** This bans "the best framework", "everyone knows", "obviously". `DECISIONS.md` compares by design, and evaluation there is allowed when the entry names the ground for it.

- **No vague declaratives.** This bans "the reasons are structural", "the implications are significant". Name the reason or the implication.

- **No lazy extreme doing vague work.** Every, always, never, everyone, nobody. An invariant in `ARCHITECTURE.md` is exempt, where "never" is the normative operator of a testable statement.

- **Never invent a fact, a name, a date, or a citation to satisfy any rule above.** Specificity comes from the source or from the author. Adding a plausible detail during a rewrite puts a falsehood into a document people rely on.

### Voice

- **Third person for the system, imperative for instructions.** `AGENTS.md` gives instructions and addresses the reader. `ARCHITECTURE.md`, `DESIGN.md`, and `DECISIONS.md` describe a system and do not.

## Git and PRs

- **Branch naming: `{type}-{short-description}` in kebab-case.** Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `ci`. A predictable branch name keeps history scannable and lets tooling read intent off the name.

- **Commit with `pnpm gitzy commit`** (Conventional Commits plus emoji, lowercase subjects under 50 characters, body wrapped at 72). Inline flags: `pnpm gitzy commit --type feat --scope ui -m "subject" --body "..."`, and `-D` for a dry run. Write the message with gitzy rather than typing the header by hand: the emoji is a required field of the format and the one for a type is not guessable.

- **Never commit directly to `main`.** Branch off `main`, open a PR with `gh pr create`, and squash merge. Squashing keeps one logical change per commit in history, and titles in the commit format double as release notes.

- **PR description uses two sections and nothing else:**

  ```markdown
  ## What

  <what changed, in plain terms>

  ## Why

  <the problem or need it addresses>
  ```

  Two sections force the description to answer the two questions a reviewer opens with, and a third section pads. The no-wrap rule matters more here than anywhere else: GitHub renders every single newline in a PR body as a line break, so a wrapped body arrives as a ragged column.

- **`## Why` also says what happens when the change is wrong and how someone finds out.** The section carries the problem the change addresses. Two more sentences make it answerable: the risk someone accepted, and the signal that fires when the risk lands.

- **Releases are cut by release-please, and `package.json` holds the only version.** A conventional commit on `main` opens or updates a release PR; merging it tags `vX.Y.Z`, writes `CHANGELOG.md`, and drives the build, checksum and Homebrew cask jobs in `.github/workflows/release.yml`. Never hand-edit a version: `src-tauri/tauri.conf.json` derives it and `src-tauri/Cargo.toml`'s is pinned at `0.0.0`, which `D49` explains. The freeze covers that line and nothing else: a dependency added to the same file lands with the regenerated `Cargo.lock` beside it, which is what `cargo test --locked` checks. A stranded or partial release is republished with `gh workflow run release.yml -f tag=vX.Y.Z`, because the push path cannot redo it.

- **After introducing a new pattern, feature, convention, or structural change, ask whether `AGENTS.md`, `ARCHITECTURE.md`, `DESIGN.md`, `DECISIONS.md`, `SPEC.md`, `DEFERRED.md`, or `README.md` should be updated, then apply the changes.** Docs rot as soon as the code moves without them. Catching the update at the point of change is when it reliably happens at all.

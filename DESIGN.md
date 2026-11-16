# Design

notras gives the note the largest share of the window. Interface additions should help reading, writing, or finding notes without competing with the document. This document guides new interface choices. Components and styles own exact dimensions, colors, and timing.

## Layout and interaction

The editor is the primary surface. The optional browser occupies a docked column on the right, and the optional note panel docks on the left with the open note's outline, links, and tags. The palette holds note actions such as rename, move, pin, and tags. Prefer an existing action surface before adding another bar or permanent control.

Actions need keyboard access through a shortcut or the palette. Pointer controls need accessible names, visible focus, and an interaction state that remains understandable without hover. Preserve selection, caret position, and undo history when switching views or applying an action to the open document.

Use the same component for the same interaction across surfaces. Multiple entry points can call one operation; they should not acquire separate behavior. Components in `src/components/ui/` own their appearance. Call sites choose placement and supported variants. Extend the owning component when its existing variants cannot express the intended control.

macOS conventions guide desktop interaction. Window dragging and controls must coexist: a draggable band must not swallow a button, input, or tab interaction. Native behavior needs checking in the desktop app because a DOM test cannot establish window dragging or keyboard fidelity.

## Typography and surfaces

Use the system sans stack for interface text and prose, and the system monospace stack for code and machine text. Follow existing component sizes instead of introducing per-control typography. The reading column constrains prose; wide content scrolls within its surface rather than widening the window.

A theme in `src/themes/` owns the palette: every color token, in a dark and a light scheme. `src/styles.css` owns the other interface tokens and the `.typeset-note` preset. Tune the note surface there. `src/typeset.css` is vendored and remains byte-for-byte upstream. The preset owns reading rhythm; components should not recreate it with isolated margins.

Color carries a role. The primary color identifies actions and the current item in a set, such as the outline heading being read or a lit toggle in the note panel. The selection color identifies text selection, and the accent identifies active command rows. Use semantic tokens and derive tints from them so every theme and scheme stays consistent. Contrast tests cover declared pairs; inspect rendered interaction states too.

Inki is the default theme. Its dark scheme pairs warm near-black backgrounds with ivory text, and its light scheme uses ivory paper and dark ink. Its primary is pink, its selection blue, and its accent violet. Catppuccin takes Mocha for dark and Latte for light, with mauve as its primary and a surface gray as its accent, and a tint of Overlay 2 as its selection. A Latte ink that misses a contrast floor is darkened, keeping its hue. Paper prints in the active theme's light scheme.

Use the existing radius ladder and spacing conventions. Nested radii account for the parent's padding. A new surface should have a clear relationship to the surrounding editor, shell, or floating controls. Avoid adding borders, shadows, and fills that express the same boundary more than once.

The icon master and regeneration instructions live in `CONTRIBUTING.md`. Reuse the app's mark component instead of drawing a second interpretation of its geometry.

## Copy and state

Controls and titles use lowercase. Descriptions, help, and error reasons use sentence case. Small section labels become uppercase through CSS. Name the action a control performs.

Errors have two parts: the UI names what failed, and the typed failure supplies the reason as a sentence without an error number. Preserve the reason rather than replacing it with a generic message. A failed load needs a visible explanation and a retry where supported. Empty results, loading, and failure are distinct states.

Toast types identify the result: success follows the user's action, information reports news, warning reports unfinished work after a committed change, and error reports a failed action. A persistence failure must remain visible where the user can act on it.

## Motion and accessibility

Motion explains state changes. Pointer-driven dragging tracks the pointer without a transition. The mark's blink, on the welcome screen and in an empty jot, is the existing decorative exception. Reduced motion removes decorative movement and transitions while preserving the final state and direct manipulation.

Interactive elements retain visible keyboard focus. Focus is one mark: a 2px solid outline in the ring color from the base layer, with no glow or border change on top. Menu items and palette rows show focus with their highlight fill instead. Rows, tabs and scroll areas that sit flush in a clipping container, and a control packed inside a chip, draw it inset; everything else draws it 2px outside. Dialogs keep their accessible title inside the portalled content. Controls remain named when their visible content is only an icon. Validate keyboard operation and native interactions in the running app as well as through component tests.

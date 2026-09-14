## Context

See proposal.md for motivation. Provider and Model currently handle only
left/right input in their row modules. The editor consumes up/down, Escape,
Save, and Test before dispatching row input. Its existing hidden-overlay helper
already supports opening a child dialog and restoring the form.

The editor snapshots all registry models, including their display names and
authentication availability. `selectProvider` chooses the first registry model
and adjusts thinking compatibility; `selectModel` adjusts thinking after model
selection. The existing preset picker demonstrates text input alongside list
navigation, but its matching behavior is a separate user-facing contract.

This design is needed because selector input crosses the editor, row, and
overlay boundaries and must not mutate the draft while browsing.

## Goals / Non-Goals

### Goals

- Isolate selector input and temporary search state from editor state.
- Reuse existing overlay handling, input primitives, and draft transitions.
- Keep search deterministic and testable without terminal interaction.

### Non-goals

- No global provider/model palette, persistent recent choices, curated defaults,
  semantic search, or availability-only filter.
- No change to the main preset picker's ranking algorithm.
- No new storage format, dependency, or general-purpose configurable selection
  framework.

## Decisions

### Open a child selector rather than expand the form

Add one small selection overlay shared by Provider and Model. Use the editor's
`runAsync` and hidden-overlay path, exposing the necessary opening method
through `EditorRowHost`. Enter in either row opens the child; left/right remains
in the row's current handler.

The child owns search input, results, and highlight. Resolve with an option
identity or cancellation, then restore the originating row. Editor shortcuts
cannot reach the hidden form. Inline expansion was rejected because it
complicates form layout and conflicts with the editor's up/down and Escape
handling.

### Compose existing input and list primitives

Use Pi TUI's `Input` for text entry and `SelectList` for rendering and up/down
confirmation. Feed it pre-ranked options rather than using its prefix-only
`setFilter`. Rebuild the list when results change and restore the specified
highlight. Derive visible rows from terminal height after reserving dialog
chrome. Render an explicit empty-state message instead of the built-in
command-specific wording.

Before implementation, verify these APIs and overlay focus behavior against the
supported Pi documentation and examples. Do not import private host components
or copy the entire preset picker.

### Use deterministic token matching

Normalize identifiers, model display names, and queries to lowercase, replace
punctuation runs with spaces, collapse whitespace, and trim. Match all query
tokens by substring across normalized identifier and display name text. Rank
exact normalized identifier, identifier prefix, then remaining token matches;
preserve input order within each group.

Record this minor scope assumption: fuzzy matching is omitted from the first
version. Name/version token search directly addresses the confirmed need and
avoids surprising subsequence matches. Numeric tokens remain ordinary
substrings: `5` can match `4-5` or `50`; there is no semantic version parser.
Exact and prefix ranking help but do not infer a model generation.

Keep this pure ranking function local to the selector feature. Do not generalize
`rankPresets` or alter its existing semantics.

### Commit only a changed confirmed identity

Construct provider options from the existing distinct registry provider list.
Construct model options from `modelsForProvider`, retaining model IDs and
`(no key)` annotations; display names are searchable metadata. Use the captured
option's identity rather than its formatted label when confirming.

On a changed provider, call the existing provider transition with the original
model array, not a sorted or filtered result list. On a changed model, call the
existing model transition. Clear the same diagnostics as arrow cycling.
Confirming the current identity is a no-op, preventing an existing provider from
resetting its model or an unchanged model from adjusting a stored thinking
value. Cancellation makes no state transition.

Unknown stored values remain untouched unless the user confirms a replacement.
Query state lives only in the child and starts empty on every opening.

### Keep hints specific to the active surface

Advertise Enter selection on the two form rows, retaining other established
footer tokens. The selector shows search, navigation, selection, and
cancellation hints. No automatic model dialog follows provider selection, and no
extra model-count adornment is required on the form.

## Risks / Trade-offs

- First registry model may not be the provider's preferred model. Mitigation:
  this is the user-confirmed existing default; leave subsequent model selection
  explicit.
- Token substring matching can include nearby versions. Mitigation: show full
  identifiers and use deterministic exact/prefix ranking; test the documented
  behavior rather than guessing version semantics.
- Nested overlays can mishandle Escape or focus. Mitigation: reuse
  hidden-overlay cleanup and cover cancellation, confirmation, failure cleanup,
  and repeated opening in the editor harness.
- Long identifiers and hundreds of results can overflow small terminals.
  Mitigation: use bounded list height, width-aware rendering, and a manual
  narrow-terminal check.

## Migration Plan

No preset migration is required. Add the selector and editor wiring together,
validate through focused tests and `mise run check`, and smoke-test in Pi before
release. Reverting the UI change restores arrow-only selection without touching
stored presets.

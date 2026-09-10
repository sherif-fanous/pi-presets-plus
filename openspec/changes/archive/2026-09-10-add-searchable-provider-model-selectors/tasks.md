## 1. Search and selector

- [x] 1.1 Read supported Pi TUI and extension documentation and examples for Input, SelectList, custom overlays, and focus restoration; verify the planned APIs exist and record any compatibility constraints in the implementation handoff.
- [x] 1.2 Add deterministic selector ranking for provider IDs and model IDs/display names; verify tests cover case, whitespace, punctuation, order-independent tokens, numeric substrings, exact/prefix precedence, stable ties, empty queries, and excluded availability annotations.
- [x] 1.3 Add the shared searchable overlay using existing input/list primitives and bounded rendering; verify component tests cover initial current-value selection, immediate typing, backspace, up/down, query reset, no matches, no options, Enter confirmation, and Escape cancellation.
- [x] 1.4 Keep highlighted results visible with hundreds of options and long identifiers; verify rendering tests cover scrolling and constrained width/height.

## 2. Editor integration

- [x] 2.1 Wire Enter from Provider and Model through the editor's async hidden-overlay path; verify editor tests show the correct provider/model option sets, selectable `(no key)` entries, and unchanged left/right cycling.
- [x] 2.2 Apply changed confirmations through existing draft transitions and diagnostic clearing; verify tests cover first-registry-model defaults despite filtered results, thinking compatibility, provider preservation on model selection, and return to the originating row without chained model selection.
- [x] 2.3 Preserve draft and diagnostics on cancellation and same-value confirmation; verify tests cover unknown stored values, nondefault existing models, stored thinking values, repeated opening, and fresh queries.
- [x] 2.4 Isolate underlying editor shortcuts during selection and restore the editor after close or failure; verify harness tests show no Save/Test/form navigation leaks and correct overlay visibility and focus restoration.
- [x] 2.5 Update Provider/Model contextual help and footer hints to advertise Enter selection; verify hint assertions retain existing navigation and Save/Test behavior and review added UI prose against project conventions.

## 3. Integration validation

- [x] 3.1 Run focused selector/editor tests and `mise run check`; verify all checks pass and existing preset picker search behavior remains unchanged.
- [x] 3.2 Smoke-test create and edit flows in Pi with many providers and hundreds of models, including a narrow terminal; verify name/version filtering, current-value visibility, unavailable entries, provider default selection, cancellation, and focus restoration, and record the observed results. Marked complete on the user's confirmation on 2026-09-10; the agent did not perform the interactive smoke test.

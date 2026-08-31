## 1. Policy report vocabulary and rendering

- [x] 1.1 Add the `Preset Policy` title and policy row labels to the shared user-facing labels module, and verify the labels follow the project voice convention.
- [x] 1.2 Update the pure policy formatter to filter shadowed and unavailable presets, partition usable presets with the activation permission decision, preserve merged order, collapse unresolved defaults to `none`, and verify focused formatter tests cover each outcome.
- [x] 1.3 Render the bold accent title, aligned muted rows, conditional prohibited-label asterisk, and exact override footnote; pass the UI theme from the thin runner and verify styled output through formatter and runner tests.

## 2. Policy report behavior coverage

- [x] 2.1 Replace rule-diagnostic assertions with exact user-facing report assertions covering mixed, all-allowed, all-prohibited, unavailable, shadowed, resolved-default, unresolved-default, and no-matching-rule cases; verify `mise run test` passes.
- [x] 2.2 Preserve the command's warning surfacing and read-only behavior, and verify the existing policy-file immutability test passes with the themed runner context.

## 3. Project validation

- [x] 3.1 Run `mise run check` and `openspec validate improve-policy-output --strict`, resolving any failures before marking the change implementation complete.

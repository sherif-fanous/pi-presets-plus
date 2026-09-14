## 1. Configuration loading

- [x] 1.1 Add the user-global `config.json` path helper under `presets-plus` and
      verify it resolves beside the existing policy and preset paths.
- [x] 1.2 Implement versioned configuration loading for `showInactiveStatus`,
      defaulting to `true` for a missing file, absent field, invalid JSON,
      unsupported version, or non-boolean field; verify missing, valid, and
      invalid cases with unit tests.
- [x] 1.3 Thread configuration warnings through the existing startup warning
      boundary and verify malformed configuration does not prevent preset
      loading or activation.

## 2. Footer behavior

- [x] 2.1 Update the status renderer and session status refresh to clear the
      `presets-plus` slot when no preset is active and `showInactiveStatus` is
      `false`, while always rendering active presets; verify enabled, disabled,
      active, dirty, and fallback cases with unit tests.
- [x] 2.2 Change status-badge expectations and related specification-facing
      strings to the title-case `Preset: none`; verify the status and
      user-facing string tests pass.
- [x] 2.3 Ensure session startup receives the effective configuration before
      restoring state and refreshing the footer; verify a disabled inactive
      status is applied on a fresh session and after extension reload.

## 3. Reload and documentation

- [x] 3.1 Load configuration during `session_start` so `/reload` picks up
      external edits; verify an external `config.json` change takes effect after
      reload.
- [x] 3.2 Keep `/presets reload` limited to the two preset scope files and its
      existing count and warning report; verify it does not become the
      configuration reload path.
- [x] 3.3 Document `config.json`, `showInactiveStatus`, its default, fail-open
      behavior, and `/reload` usage in `README.md`; verify the documented
      examples match the implemented file shape.

## 4. Validation

- [x] 4.1 Run the focused configuration, status, session, and reload tests and
      resolve failures.
- [x] 4.2 Run `mise run check` and verify the complete formatting, lint,
      type-check, and test gate passes.

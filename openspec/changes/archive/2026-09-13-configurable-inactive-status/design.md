## Context

The extension currently stores presets and policy separately and renders the inactive footer from `ActivePresetSession` through the pure status formatter. The status writer already owns every footer refresh, while `/reload` reconstructs the extension and runs `session_start`. See proposal.md and the delta specs for the intended behavior.

## Goals / Non-Goals

**Goals:**

- Add a separately stored, user-global configuration file.
- Make `showInactiveStatus` available to footer rendering with a default of `true`.
- Apply configuration changes through extension startup and `/reload`.
- Preserve `/presets reload` as a preset-file reload command.
- Keep status formatting pure and keep the session class as the single status writer.
- Align the footer label with the repository's title-case convention: `Preset: none`.

**Non-Goals:**

- Consolidating presets, policy, and extension settings into one file.
- Adding project-local configuration.
- Adding a configuration editor or a new command.
- Changing active-preset, drift, policy, or preset-file semantics.

## Decisions

### Use a separate user-global config file

Add `config.json` below the existing user-global `presets-plus` directory. This keeps configuration independent from the preset list and avoids coupling a preference change to preset-file writes. Project-local configuration is excluded so the preference remains a user-level UI choice.

The file uses `{ "version": 1, "showInactiveStatus": boolean }`. Missing files and missing fields resolve to `true`, preserving existing behavior. Invalid JSON, unsupported versions, and invalid field types produce warnings and also resolve to `true`, matching the existing fail-open policy configuration behavior.

### Load configuration during extension initialization

Read configuration as part of the `session_start` setup, alongside the existing preset load. Thread the resolved value into the session's status-refresh path rather than caching file contents at module scope. A fresh extension instance therefore sees edits after `/reload`, and `ctx.reload()` remains the canonical way to apply configuration changes.

### Keep `/presets reload` narrow

Do not make `/presets reload` reload extension configuration. Its current contract is to re-read both preset scope files and report their count and warnings. Users who edit configuration use `/reload`, which also resets extension-local state and reruns startup loading.

### Clear the status slot when inactive status is hidden

Pass the effective preference to the pure badge renderer or to the session's status-refresh operation. When there is no active preset and the preference is false, call `ctx.ui.setStatus("presets-plus", undefined)` so Pi removes the slot. Active presets always render their name, even if inactive status is disabled.

### Keep title-case text in the contract

Update the affected footer requirement and scenarios to use `Preset: ...`, matching the implementation, tests, and repository user-facing string convention. The lower-case wording in the existing main specification is a documentation defect, not a desired runtime change.

## Risks / Trade-offs

- [Risk] Users may expect `/presets reload` to reload every file under `presets-plus`. → Keep its existing narrow description and document `/reload` as the configuration reload path.
- [Risk] A malformed config could hide the footer or prevent startup. → Fail open to `showInactiveStatus: true`, emit one warning through the existing warning boundary, and never rewrite the file.
- [Risk] Passing configuration through status-refresh code could blur session ownership. → Keep `ActivePresetSession` as the only caller of `setStatus`; expose only the smallest preference input needed by that class.
- [Risk] Pi may render an empty status value differently from an undefined value. → Use the host's documented status-clearing convention and cover the exact argument in tests.

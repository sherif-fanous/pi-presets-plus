## Context

The storage layer currently has separate readers for user settings, user policy, and scoped presets. Preset mutations replace an entire `presets.json`, while settings and policy are read-only. Every call reads disk state again so `/reload` and direct file edits take effect without a cache.

The user version 1 `config.json` occupies the same path as its version 2 replacement. Project presets use a separate `presets.json`; project settings and policy do not exist today. Startup already collects warnings and sends them at the UI boundary.

## Goals / Non-Goals

Goals:

- Give every scope one parsed document that supplies settings and presets while the user document also supplies policy.
- Make migration safe to retry after failures and safe when more than one Pi process starts at the same time.
- Preserve sections and unknown keys when the preset editor rewrites a configuration.
- Keep disk reads uncached.

Non-goals:

- Adding policy support at project scope.
- Adding a migration command or editor UI for settings and policy.
- Preserving comments, whitespace, or other formatting that JSON parsing discards.
- Searching for and migrating projects that Pi has not opened.

## Decisions

### Use one version 2 document model per scope

The version 2 shape is:

```json
{
  "version": 2,
  "showInactiveStatus": true,
  "presets": [],
  "policy": {
    "rules": []
  }
}
```

All fields except `version` are optional. `showInactiveStatus` remains top-level to minimize the user migration. `policy.rules` keeps policy separate from settings and allows the body of a version 1 policy file to move under `policy` without changing its shape.

A scope loader returns the parsed source object, validated section values, and one warning list. Callers combine user and project presets as they do today. They resolve `showInactiveStatus` from project, then user, then `true`. Policy callers use only the user document and re-read it for every policy operation.

An alternative was to nest settings under `settings`. That gives one boolean an unnecessary container and makes migration harder to read.

### Run migration before the first configuration load

The `session_start` handler runs migration for the user scope and current project scope before it loads settings, presets, or policy. Each scope is independent. A failure in one scope does not prevent migration or loading in the other.

User migration accepts any existing combination of these version 1 files:

- `config.json`, which contributes `showInactiveStatus` when present.
- `presets.json`, which contributes `presets`.
- `policy.json`, which contributes the object stored as `policy`.

Project migration accepts `presets.json` and contributes `presets`. A scope with no legacy file needs no migration. The first preset save creates a version 2 file.

Migration validates only the legacy document structure needed to move the data. It does not validate individual presets, rules, matchers, or regular expressions. The version 2 loader performs those checks after migration, so migration never drops an entry.

The package reads and validates all legacy inputs for a scope before writing anything. If any input fails structural validation, it leaves every file unchanged and uses defaults for that scope during the current session. The next session tries again.

An alternative was to keep the legacy loaders after a migration failure. Those loaders already treat structural failures as empty, so keeping them would add code without preserving usable data.

### Commit the destination before cleanup

Migration serializes the complete version 2 document and writes it through the existing atomic-write mechanism. For user migration, the rename replaces `config.json` version 1 at the same path. After that commit, migration removes the represented `presets.json` and `policy.json` sidecar files. Project migration removes `presets.json`.

A missing sidecar during cleanup counts as success because another Pi process may have completed the same migration. Any other cleanup failure produces a warning naming the remaining file, but the committed version 2 configuration stays active. Later sessions ignore the leftover file.

Deleting before writing was rejected because a failed destination write could lose the only copy. Renaming every legacy file to a backup was rejected because the atomic destination write already preserves the data and permanent backup files would add clutter.

### Treat version 2 as the sole source of truth

Once a scope has a version 2 `config.json`, loaders and migration ignore all legacy sidecar files without warning. This makes startup deterministic and avoids repeated notices after a successful migration or cleanup race.

A version 1 user `config.json` remains eligible for migration. Other versions at either configuration path are unsupported and produce a normal configuration warning rather than being interpreted as legacy preset storage.

Merging version 2 and legacy sections was rejected because stale files could unexpectedly override current values.

### Preserve the source document during preset mutations

A preset mutation reads and validates the complete target document, then replaces only its `presets` property. Serialization retains `showInactiveStatus`, `policy`, and unknown top-level keys. JSON formatting may be normalized because the file is parsed and serialized.

Any warning from the target document blocks the mutation. This includes invalid settings, invalid presets, invalid policy, and a project policy section. This keeps the writer from normalizing or preserving a document it cannot certify as safe. Reads still fail open by section where the specifications require it.

Cross-scope moves retain the current destination-first transaction. Rollback restores the complete previous destination document instead of only its preset array.

An alternative was to validate only `presets` before writes. That would allow the editor to rewrite a file containing policy or settings errors and make the safety rule depend on which section happened to trigger the write.

### Keep policy user-only

The policy loader ignores `policy` in the project document. Startup adds one warning when the key is present. Because that warning makes the project document unsafe to mutate, users must remove the unsupported section by editing the file directly.

This preserves the existing trust boundary. A repository cannot add policy defaults that automatically activate a project preset and its instructions.

### Aggregate migration outcomes at startup

Migration returns structured outcomes to the startup UI boundary and does not notify from storage code. If all attempted scope migrations and cleanups succeed, startup sends one info notification describing the migrated scopes. If any attempt fails or cleanup remains, startup sends one warning notification containing both successful and failed outcomes. Migration failures name the affected file and direct the user to the README migration section.

Other configuration and loading warnings continue through the existing startup warning collection. `/presets reload` does not run migration; `/reload` does because it causes a new `session_start`.

## Risks / Trade-offs

- [Opening a project changes its working tree] -> Document that the first session replaces `.pi/presets-plus/presets.json` with `config.json`, so teams can commit the migration.
- [Two Pi processes migrate the same scope] -> Use atomic replacement, read all inputs before writing, and accept missing cleanup files.
- [A process commits version 2 but cannot remove a sidecar] -> Keep version 2 active, report the cleanup failure once, and ignore the sidecar on later starts.
- [JSON formatting changes during preset edits] -> Preserve values and unknown keys, but document that the extension serializes the complete JSON object.
- [One invalid section prevents preset edits] -> Keep reads available, identify every warning, and require the user to fix the document before the extension rewrites it.
- [A migration failure temporarily hides otherwise valid sections in that scope] -> Leave all source files untouched, report the exact failure, and retry on the next session.

## Migration Plan

1. Introduce version 2 parsing and serialization while retaining the legacy paths only as migration inputs.
2. Run user and current-project migration before startup loads effective state.
3. Load settings, presets, and user policy from version 2 documents.
4. Route preset mutations through read-modify-write of the complete document.
5. Update the README examples and migration troubleshooting, then note automatic project-file migration in the changelog.
6. Keep rollback data-compatible by leaving version 2 files in place. An older extension will reject version 2 without modifying it; users who must roll back can restore version 1 files from source control or reconstruct them from the documented sections.

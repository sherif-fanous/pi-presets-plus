## 1. Version 2 configuration model

- [x] 1.1 Replace the scoped preset paths with user and project `config.json`
      paths while retaining legacy paths for migration inputs, and verify path
      tests cover default and injected roots.
- [x] 1.2 Add the version 2 document parser and section validation for settings,
      presets, and policy, and verify unit tests cover missing files, malformed
      JSON, unsupported versions, optional sections, invalid entries, and
      preserved raw values.
- [x] 1.3 Resolve `showInactiveStatus` from project, user, then the `true`
      default, and verify tests cover inheritance, override, and invalid project
      values.
- [x] 1.4 Ignore project policy with one warning while loading policy only from
      the user document, and verify policy tests cover the trust boundary and
      existing fail-open rule behavior.

## 2. Automatic migration

- [x] 2.1 Add structural readers for user version 1 `config.json`,
      `presets.json`, and `policy.json` plus project `presets.json`, and verify
      tests show that invalid documents block one scope while individual invalid
      entries are copied unchanged.
- [x] 2.2 Build version 2 documents from every existing legacy input without
      dropping unknown entry data, and verify fixture tests cover each file
      alone and all supported user files together.
- [x] 2.3 Commit migration through atomic replacement before removing sidecar
      files, and verify tests cover write failure, missing cleanup files,
      cleanup failure, and two migration attempts against the same scope.
- [x] 2.4 Make an existing version 2 file bypass legacy reads and cleanup
      without warning, and verify a test leaves coexisting legacy files
      untouched.
- [x] 2.5 Run user and current-project migrations before startup loads
      configuration, return structured outcomes to the UI boundary, and verify
      startup tests cover one aggregated info result, mixed-scope warning
      results, README guidance on failure, and retry after failure.

## 3. Loading and preset mutations

- [x] 3.1 Route scoped preset loading through version 2 documents while
      preserving merge order, shadowing, availability, and hotkey analysis, and
      verify the existing storage and hotkey tests pass with version 2 fixtures.
- [x] 3.2 Change single-scope mutations to replace only `presets` in the parsed
      document and preserve settings, policy, unknown keys, and a trailing
      newline, and verify CRUD tests compare the complete saved object.
- [x] 3.3 Refuse every preset mutation when any section in the target scope
      produced a warning, and verify tests cover invalid settings, presets,
      policy, and unsupported project policy.
- [x] 3.4 Preserve complete source and destination documents during cross-scope
      moves and rollback, and verify tests cover successful moves, source-write
      failure, and rollback failure without losing unrelated values.
- [x] 3.5 Update startup, `/presets reload`, policy inspection, activation
      policy checks, and policy defaults to use the consolidated loaders without
      adding an on-disk cache, and verify their focused test suites pass.

## 4. Documentation and release checks

- [x] 4.1 Rewrite the README storage, settings, policy, and reload sections
      around the version 2 file, add automatic migration and troubleshooting
      guidance, and verify every documented JSON example is valid.
- [x] 4.2 Add a changelog entry that explains automatic user migration and the
      project working-tree change, and review the prose with the `humanizer` and
      `unslop` skills.
- [x] 4.3 Remove obsolete legacy loading code and tests after migration coverage
      is in place, and verify code search finds legacy filenames only in
      migration, tests, and migration documentation.
- [x] 4.4 Run `mise run check` and
      `openspec validate consolidate-config-file --strict`, and fix every
      reported problem before marking the change complete.

## MODIFIED Requirements

### Requirement: Storage CRUD primitives

The package SHALL expose programmatic operations on the storage layer to load all presets across both scopes, save an entire scope, add a preset to a scope, update an existing preset within a scope, remove a preset from a scope, reorder presets within a scope, and move a preset between scopes.

Before a read-modify-write operation changes a scope, it SHALL load the complete current scope file. If loading produces any warning, the operation SHALL return a failure and SHALL NOT write that file. A missing file is a valid empty scope and SHALL remain writable.

Accepted single-scope mutations SHALL persist immediately through an atomic write to that scope file. A cross-scope move SHALL validate both scope files, source existence, and destination name availability before its first write. It SHALL write the destination before removing the source. If source removal fails while the process remains running, it SHALL attempt to restore the previous destination contents before reporting the failure.

#### Scenario: Add to project scope

- **WHEN** `addPreset(p, "project", ctx)` is called with a valid preset and the project scope is safe to mutate
- **THEN** the preset SHALL be appended to the project file's `presets` array and the file SHALL be written atomically
- **AND** the global file SHALL not be touched

#### Scenario: Rename via update

- **WHEN** `updatePreset("old", "user", { name: "new", ... }, ctx)` is called and the user scope is safe to mutate
- **THEN** the preset entry SHALL retain its position in the file and only its `name` and any other changed fields SHALL change

#### Scenario: Reorder within scope

- **WHEN** `reorderWithinScope("user", ["b", "a", "c"], ctx)` is called, the user file currently has `[a, b, c]`, and the user scope is safe to mutate
- **THEN** the user file SHALL be rewritten with the presets in the requested order

#### Scenario: Remove

- **WHEN** `removePreset("plan", "project", ctx)` is called, the project file contains `plan`, and the project scope is safe to mutate
- **THEN** the preset SHALL be removed from the project file and the file SHALL be written atomically

#### Scenario: Mutation refuses an incomplete load

- **WHEN** a read-modify-write operation loads an affected scope file and loading reports a read error, invalid JSON, unsupported version, invalid top-level structure, invalid preset, or duplicate preset name
- **THEN** the operation SHALL return a failure stating that the file was not changed because it could not be loaded completely
- **AND** the operation SHALL leave the file unchanged

#### Scenario: Move validates before writing

- **WHEN** a cross-scope move has equal source and destination scopes, a missing source preset, a destination name collision, or a warning from either scope file
- **THEN** the move SHALL return a failure before writing either scope

#### Scenario: Move succeeds

- **WHEN** a cross-scope move has two safe scope files, an existing source preset, and no destination name collision
- **THEN** the destination file SHALL contain the moved preset
- **AND** the source file SHALL no longer contain the original preset

#### Scenario: Source removal fails during move

- **WHEN** the destination write succeeds and the following source write fails while the process remains running
- **THEN** the move SHALL attempt to restore the previous destination contents
- **AND** the move SHALL report the source failure

#### Scenario: Move rollback also fails

- **WHEN** the source write fails after the destination write and restoring the previous destination contents also fails
- **THEN** the move SHALL report both failures

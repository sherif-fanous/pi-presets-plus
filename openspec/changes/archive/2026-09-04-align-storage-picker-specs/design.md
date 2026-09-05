## Context

See `proposal.md` for motivation. The current storage loader returns valid presets and warnings together, but mutation callers discard the warnings before rewriting a scope. The editor moves a preset by adding it to the destination and then removing it from the source. If source removal fails, the destination copy remains.

The current picker measures variable-height cards inside the TUI component. It may pack, correct the scroll offset, and pack again several times. The specification also fixes this implementation in place by requiring its correction helper and render result shape.

## Goals / Non-Goals

**Goals:**

- Keep unsafe preset files unchanged during read-modify-write operations.
- Give cross-scope moves one storage-owned failure contract.
- Keep the selected picker card visible using one pure viewport calculation.
- Replace implementation-specific picker requirements with a behavior contract.

**Non-Goals:**

- Add a transaction journal or guarantee recovery after a process crash between scope writes.
- Add file watching, revision checks, or cross-process mutation locking.
- Change the preset file format.
- Change picker navigation behavior or card rendering.

## Decisions

### Reject mutations when loading reports a warning

Each mutation will require a complete representation of the current file before it rewrites that file. A missing file will remain a valid empty scope. Every load warning will make the scope read-only until the user repairs it.

Rewriting only the valid subset was rejected because it can destroy malformed entries or replace an unreadable file with new content.

### Move cross-scope orchestration into storage

The storage module will validate both scopes before writing. It will write the destination first so the source remains present until a destination copy exists. If source removal fails, it will make one best-effort attempt to restore the previous destination contents.

Keeping add-then-remove orchestration in the editor was rejected because it gives the UI ownership of storage failure rules and leaves a destination copy after a source-write failure. A transaction journal was rejected because its recovery machinery is disproportionate to two local configuration files.

### Calculate picker layout in one pure module

The viewport calculation will receive counts, indices, line budget, and a lazy card-height reader. It will return the visible range, corrected scroll offset, and measured page size. The picker will render that range and store the returned scroll and page values.

Keeping packing and repeated correction attempts inside the TUI component was rejected because it mixes layout calculation with rendering and state repair. A fixed card count was rejected because optional rows make card heights variable.

## Risks / Trade-offs

- A process crash between scope writes can leave the preset in both scopes. Writing the destination first prevents preset loss.
- A manual file edit between the safety read and final write can be overwritten. Atomic replacement prevents partial files but does not provide optimistic concurrency.
- A card taller than the viewport exceeds the line budget. The layout will still include that selected card so navigation never hides the selection.

## Migration Plan

No data migration is required. Implement storage safety and viewport layout behind the existing file format and picker behavior, run the full validation gate, then sync the delta specifications into the main specifications. Reverting the implementation will not require persisted-data recovery.

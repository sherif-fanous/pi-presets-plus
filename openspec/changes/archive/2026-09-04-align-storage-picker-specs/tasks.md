## 1. Storage safety and moves

- [x] 1.1 Make every read-modify-write storage operation reject scope files that produce load warnings, and verify tests leave unsafe files unchanged while missing files remain writable.
- [x] 1.2 Add one storage-owned cross-scope move operation that validates both scopes before writing, and verify tests cover success, invalid inputs, destination failure, source failure with rollback, and rollback failure.
- [x] 1.3 Route editor scope changes through the storage move operation, and verify editor tests cover successful moves and rejected persistence results while storage tests cover move-specific rejection results.

## 2. Picker viewport layout

- [x] 2.1 Implement one pure variable-height viewport calculation, and verify unit tests cover mixed heights, selection above and below the viewport, oversized cards, empty lists, and measured page size.
- [x] 2.2 Route picker rendering through the viewport calculation and remove the superseded correction helper and fixed-page-size path, then verify picker navigation tests keep every selected card visible.

## 3. Validation

- [x] 3.1 Run `openspec validate align-storage-picker-specs --strict` and resolve every specification error.
- [x] 3.2 Run `mise run check` and verify formatting, type checking, linting, and the full test suite pass.

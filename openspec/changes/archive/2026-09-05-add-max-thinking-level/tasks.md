## 1. Define and validate the level

- [x] 1.1 Add `"max"` to one shared thinking-level registry and derive the local type from that registry.
- [x] 1.2 Use the shared registry for storage validation, activation capability checks, and editor choices.
- [x] 1.3 Verify storage accepts `"max"` and still rejects unknown values.

## 2. Apply, warn, and restore

- [x] 2.1 Apply `"max"` only when the selected model maps it to a non-null value.
- [x] 2.2 Return the existing thinking-adjustment notice with Pi's actual fallback, including when the model disables `"off"`.
- [x] 2.3 Use the activation capability rule for load-time clamp warnings.
- [x] 2.4 Capture and restore `"max"` as an overlay baseline value.

## 3. Update the editor and picker

- [x] 3.1 Offer `"max"` in the editor and verify model changes disable or snap an unsupported selection.
- [x] 3.2 Format the picker value as `"Max"` and use the `thinkingMax` theme color.
- [x] 3.3 Fall back to `thinkingXhigh` only when an older theme API reports that `thinkingMax` is unknown.

## 4. Document and validate

- [x] 4.1 Document that using max requires Pi 0.80.6 while existing levels remain supported on Pi 0.80.5; leave the changelog entry to the release PR.
- [x] 4.2 Review changed user-facing text with the humanizer and unslop rules.
- [x] 4.3 Run `mise run check`.
- [x] 4.4 Run `openspec validate "add-max-thinking-level" --type change --strict`.

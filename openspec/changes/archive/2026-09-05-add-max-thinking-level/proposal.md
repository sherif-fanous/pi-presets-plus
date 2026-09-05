## Why

Pi supports a seventh thinking level, `"max"`, but this package rejects presets that declare it and does not expose it in the editor or picker.

## What changes

- Accept `"max"` in stored presets.
- Treat `"max"` as available only when the selected model maps it to a non-null value, matching Pi's model capability rules.
- When an unsupported level falls back and the model also disables `"off"`, predict Pi's nearest supported level so notices and restore state remain accurate.
- Add `"max"` to the editor and restore it when it was part of a preset baseline.
- Display `"Max"` in the picker with Pi's matching theme color. Fall back to the extra-high color when an older Pi theme API does not recognize the max color.
- Mark presets that request an unsupported `"max"` level with the existing clamp warning.
- Document that using `"max"` requires Pi 0.80.6 or later. Existing thinking levels remain supported on Pi 0.80.5.

## Capabilities

### New capabilities

None.

### Modified capabilities

- `preset-storage`: Accept `thinkingLevel: "max"` during load-time validation.
- `preset-activation`: Apply and restore `"max"` when the model supports it, or return the existing adjustment notice when it does not.
- `preset-editor`: Offer `"max"`, gate it by model capability, and flag presets that Pi will clamp.
- `preset-picker`: Display `"Max"` without failing on older theme APIs.

## Impact

This change affects thinking-level validation, model capability checks, activation, baseline restoration, editor choices, picker rendering, and tests. It adds no dependency and does not change the behavior of existing preset values. The release PR will own the changelog entry.

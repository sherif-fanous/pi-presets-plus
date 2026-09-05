## Context

Pi 0.80.6 added `"max"` to its thinking-level type, model capability rules, session API, and theme colors. Pi 0.80.5 remains the extension's baseline for existing thinking levels, so the new path must fail safely when an older host encounters a preset that declares `"max"`.

## Decisions

### Keep one local thinking-level registry

Define the ordered level list once and derive the local `ThinkingLevel` type from it. Validation, model capability checks, and the editor use that registry so they cannot disagree when Pi adds a level.

### Match Pi's model capability rule

Keep a local validity helper aligned with pi-ai because Pi does not expose its helper through the extension API. A `null` mapping disables any level. The extended `"xhigh"` and `"max"` levels also require an explicit mapping.

Use the same helper for activation, editor choices, and load-time clamp warnings. This keeps the warning consistent with the value activation will apply. If an invalid request falls back to `"off"` but the model disables that level too, use pi-ai's clamp helper to predict the level Pi will select. Record that predicted value in notices, drift snapshots, and the active overlay.

### Preserve older-host behavior

Read `thinkingLevelMap` defensively. Models on Pi 0.80.5 cannot advertise `"max"`, so a stored max value resolves to `"off"` with the existing adjustment notice instead of reaching the old host's unsupported path. Full max support starts with Pi 0.80.6.

### Fall back only for the missing max theme color

Render max values with `thinkingMax`. If an older theme API reports that this color is unknown, retry with `thinkingXhigh`. Propagate every other rendering error.

### Keep dependency updates separate

Current main already locks Pi packages newer than 0.80.6. This feature needs no package or lockfile update.

## Risks

- Matching an error message for the old theme fallback depends on Pi's established `Unknown theme color` text. Restrict the fallback to max rendering and rethrow all other errors.
- Pi 0.80.5 cannot provide functional max thinking. Release notes must distinguish safe loading from actual feature support.

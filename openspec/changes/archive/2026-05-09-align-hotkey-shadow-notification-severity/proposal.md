## Why

The `preset-shortcuts` capability today specifies that a preset whose
hotkey matches a documented Pi built-in emits an **info-level**
notification at session start, while two presets sharing the same
hotkey emit a **warning-level** notification. That distinction was
deliberate (info = "FYI, here's what's happening"; warning = "your
config has a problem"), but in practice users perceive the two
conditions as the same kind of event — "this preset's hotkey
collides with something else, and one binding will lose" — and
expect them to be presented uniformly.

The on-screen result of the current vocabulary is that the shadow
message renders dim/muted with no visible severity prefix, while the
conflict message renders with the `Warning:` prefix and warning
color. A user comparing the two outputs reasonably reads this as
inconsistency, not as deliberate UX choice. The shadow message also
does not start with a severity prefix, so a user skimming
notifications cannot tell at a glance that it is presenting a
collision-style condition at all.

This change aligns the two surfaces by promoting the shadow
notification to **warning-level**, so both collision conditions
share the same severity, the same visual treatment, and the same
discoverability. The semantics — "Pi built-in shadowed; preset
binding takes precedence" — are unchanged, only the severity is
adjusted.

## What Changes

- Promote the Pi-builtin-shadow notification from `info` to
  `warning` severity. The notification's text is unchanged.
- Update the `preset-shortcuts` requirement "Hotkey conflict with
  pi built-in" to specify warning-level severity and add a
  scenario asserting that.
- Update the implementation in `src/hotkey-registry.ts`
  `bindForSession` to pass `"warning"` to `ctx.ui.notify` instead
  of `"info"` for the shadow path.
- No change to the conflict-between-presets path (already warning).
- No change to the `LoadedPreset.hotkeyShadowsBuiltin` annotation
  semantics or to picker / editor read sites that consume it.

## Capabilities

### New Capabilities

_(none — this change modifies an existing capability)_

### Modified Capabilities

- `preset-shortcuts`: the requirement "Hotkey conflict with pi
  built-in" changes the mandated severity from `info` to `warning`
  for the session-start notification. The accompanying scenario
  is updated to assert the new severity.

## Impact

- One-line code change in `src/hotkey-registry.ts` (severity arg
  on the existing `ctx.ui.notify` call).
- Spec delta on `preset-shortcuts` (one MODIFIED requirement).
- One existing test in `tests/hotkey-registry.test.ts` may need
  to adjust if it asserts on the severity value passed to a
  notify spy. No user-facing string changes.
- No change to storage formats, pi extension API, command
  surfaces, or persistent session state.
- User-visible behavior change: at session start, a preset that
  shadows a Pi built-in now produces a warning-styled notification
  (yellow/orange theme color, `Warning:` prefix) instead of a
  dim info-styled notification. This is the intended effect.

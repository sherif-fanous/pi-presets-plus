## Context

See `proposal.md` for motivation and compatibility scope. The two delta specs
define startup eligibility and its observable effects.

`src/index.ts` restores preset state, attempts `--preset`, then calls
`maybeApplyPolicyDefault`. The current helper receives only flag and restore
precedence. Applying a default changes model and thinking, can change tools, and
attaches instructions for later turns.

The inspected pi-subagents child path supplies a resolved model to
`createAgentSession` before binding extensions in print mode. Pi exposes mode
and the current model to extensions, but does not expose selection origin or the
running session's settings manager. `SettingsManager.create` can load
file-backed defaults, including project trust, and reports load errors through
`drainErrors`.

Design is warranted because this change crosses startup wiring and activation
logic and needs precise settings and thinking comparison semantics.

## Goals / Non-Goals

### Goals

- Put the new decision at the automatic activation boundary so explicit preset
  paths keep their existing behavior.
- Keep decision inputs local to each startup invocation, including in-process
  child sessions.
- Reuse Pi's settings merge and supported thinking behavior without reproducing
  model selection or introducing a dependency.
- Test both the decision and the real startup wiring without launching a
  third-party subagent or making model requests.

### Non-goals

- Detect whether a matching interactive selection was explicit.
- Discover SDK-only in-memory defaults or require launcher changes.
- Add flags, environment signals, process-argument inspection, or a Pi API.
- Redefine reload, resume, fork, new-session, or cleared-state eligibility.
- Change permission checks, policy inspection output, manual activation,
  restoration, or the apply/clear engine.
- Preserve explicit tool or instruction choices when all compared interactive
  values match. Those fields do not participate in this rule.

## Decisions

### Capture a startup snapshot before preset processing

At the start of the extension's startup handler, capture provider, model
identity, and current thinking from the original context and Pi API before
preset processing or asynchronous startup work can replace them. Pass the
snapshot to automatic-default eligibility. Do not reread a preset-mutated
context to reconstruct startup state.

Keep the existing restore-then-flag sequence. A successful flag wins over a
restored attachment. Failed or cancelled flag activation still falls through to
the remaining checks.

An optional final dependency parameter is sufficient for test seams. Do not
introduce a service container or module-level state.

### Use mode as the first automatic-default eligibility check

After existing flag and restore precedence checks, require `ctx.mode === "tui"`.
A context with print, RPC, missing, or unsupported mode does not qualify. Do not
use `hasUI`, since RPC can support dialogs.

Only the automatic-default step returns early. Configuration loading, migration,
warning aggregation, status handling, completion setup, and hotkey registration
continue as before. Explicit flag activation and restore also remain available
through their existing paths.

A general child-session detector would require launcher-specific knowledge. The
mode rule covers every non-interactive launcher without such a dependency, and
interactive children use the same comparison as other interactive sessions.

### Read file-backed defaults through SettingsManager

For interactive startup with no higher-precedence preset, create a settings
reader for `ctx.cwd`, the Pi agent directory, and `ctx.isProjectTrusted()`. Use
`getDefaultProvider`, `getDefaultModel`, and `getDefaultThinkingLevel` rather
than parsing and merging JSON directly.

Inspect the reader's reported errors before using its values. A read failure,
parse failure, invalid field, incomplete required model identity, or unresolved
model yields an ineligible result. Do not use a partial settings result after an
error. Do not write settings, prompt for a repair, or notify about comparison
failures.

Keep any catch around settings resolution narrow. Settings I/O failures mean a
silent skip in this flow; unrelated programmer errors must not be hidden as
settings failures. Return comparison outcomes as data rather than throwing for
missing or invalid values.

Read again for each startup evaluation. Do not cache defaults or a
SettingsManager across sessions or reloads. No settings read is needed when
mode, successful flag activation, or restoration already preempts the default.

### Normalize thinking using Pi startup semantics

Resolve the configured provider and model exactly through the available
registry. Do not run Pi's model fallback search, infer a default from the
current model, or rewrite an unavailable default to make equality succeed.

For a valid configured thinking level, normalize it using the same
model-capability clamp used by Pi startup. When thinking is absent, use Pi's
startup fallback if it can be established from the supported host contract, then
clamp it. If the required fallback or normalization cannot be established
reliably, return ineligible.

The existing preset apply helper includes preset-specific behavior for invalid
levels. Do not assume that behavior is identical to Pi's startup clamp. Use the
public `clampThinkingLevel` export from `@earendil-works/pi-ai`. Pi 0.80.5 uses
`medium` as its startup fallback when no thinking level is configured, so the
comparison uses that value before calling the clamp. Focused tests cover a
supported level, a restricted model, a non-reasoning model, and absent thinking
without private imports or a duplicate host model resolver.

Provider and model use exact identity equality. Thinking compares the captured
current value with the normalized expected value. No normalization writes to the
session.

### Keep policy resolution and application unchanged after eligibility

Only an eligible startup reaches the existing policy resolver and apply
operation. Its longest-match rule, file-order tie break, permitted and available
candidate filter, refusal behavior, and combined success outcome remain
unchanged.

A skipped automatic activation creates no attachment or active entry, so it adds
no directory-default instructions on later turns. Do not apply only the
non-model parts of a skipped preset.

Independent configuration and policy validation warnings remain visible under
existing rules. An ineligible startup does not attempt default resolution, so it
does not emit a default-resolution warning. A settings comparison failure is
always silent, as requested.

### Preserve attachment-based lifecycle behavior

The startup event reason does not add another eligibility check. A reload or
resumed session with a restored preset remains protected by restoration. A
cleared, unavailable, or missing attachment proceeds through mode and value
comparison.

This deliberately leaves automatic reactivation possible after clear and reload
when values match defaults. Redefining freshness would be a separate behavior
change.

### Cover behavior with local tests

Extend `tests/activation/policy-default.test.ts` for precedence, mode checks,
comparison decisions, and unchanged policy outcomes. Add focused settings-reader
tests with isolated file-backed settings and injected failures where needed. Use
the existing startup test structure in `tests/index.test.ts` to prove snapshot
capture and all side-effect assertions.

A local print-mode SDK-shaped test should start with a requested model and a
conflicting directory preset, then invoke startup and the next-turn handler.
Assert no model, thinking, or tools writes, no automatic active entry, and no
added default instructions. This reproduces the extension boundary without
depending on the installed pi-subagents package, launching children, or spending
model tokens.

Include matching values as a positive case and explicit equal-value interactive
choices as an accepted limitation. Tests must not assert universal
explicit-choice detection.

## Proposed flow

```text
Capture startup values
  |
Restore attachment, then attempt --preset
  |
Successful flag or restored attachment? -- Yes --> Skip automatic default
  |
  No
  |
TUI mode? ------------------------------- No ---> Skip automatic default
  |
  Yes
  |
Resolve file-backed defaults and thinking
  |
Reliable exact match? ------------------- No ---> Skip silently
  |
  Yes
  |
Resolve permitted available directory default
  |
  +--> None configured --> Keep baseline
  +--> Unresolvable ----> Keep baseline and existing warning
  +--> Apply refused ---> Keep baseline and existing warning
  +--> Applied ---------> Attach preset and one combined success outcome
```

## Risks / Trade-offs

- Explicit interactive selections equal to file-backed defaults remain eligible.
  Document this case and test it as expected behavior. Do not advertise complete
  detection of launcher intent.
- Print and RPC users lose automatic defaults even without an explicit model
  selection. Call out this compatibility change; explicit preset requests retain
  their existing paths and permission rules.
- SDK in-memory defaults are invisible to a separate file-backed reader.
  Document that the comparison source is file-backed settings, and use the same
  deterministic comparison for interactive SDK hosts.
- Thinking behavior can vary with the supported Pi version. Verify public
  helpers and startup fallback behavior during implementation, test
  non-reasoning and restricted-level models, and skip silently if comparison is
  unresolved.
- Another extension can change state before this handler runs. The snapshot
  describes state observed at handler entry, not original launcher intent. Do
  not claim ordering independence across unrelated extensions.
- Files can change after the host resolved its model or after the comparison
  read. Read once per eligibility evaluation without caching; accept that
  comparison describes the file-backed defaults at that evaluation.
- Silent skips can hide a malformed settings file from this extension's users.
  This is the agreed contract. Do not add a warning or suppress diagnostics that
  Pi or unrelated loading paths already produce.

## Migration plan

No configuration or session migration is required. Implement the guards and
tests, update README and changelog with the mode restriction and known
limitation, and run `mise run check` before release. Keep existing user
configurations unchanged.

Rollback removes the eligibility restriction and restores prior
automatic-default behavior without a data migration. That rollback also restores
the reported overwrite risk.

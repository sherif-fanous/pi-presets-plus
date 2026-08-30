## 1. Storage: policy file

- [x] 1.1 Add `getGlobalPolicyPath(agentDir)` to `src/store/paths.ts`
      resolving `<agent-dir>/presets-plus/policy.json`, mirroring
      `getGlobalPresetsPath` and its module JSDoc.
- [x] 1.2 Add a loader/validator (e.g. `src/store/policy.ts`) that reads
      `policy.json` fresh on every call and returns a compiled rule set plus
      `warnings: string[]`. Treat a missing file or empty `rules` as no policy;
      treat malformed JSON / unsupported `version` as absent plus a warning;
      never write the file.
- [x] 1.3 Compile each rule's `match` regex and every matcher `pattern`
      (`allow`, `prohibit`, `default`) with raw, unanchored `RegExp` semantics,
      defaulting `field` to `"name"`. On a compile failure, skip that rule (bad
      `match`) or that matcher (bad `pattern`) and emit a loud warning naming the
      offending pattern (fail-open but visible).

## 2. Permission model

- [x] 2.1 Add a `resolveMatchingRules(cwd, rules)` helper returning the rules
      whose `match` matches the cwd, each with its matched-substring length (from
      `RegExp.exec`) for later longest-path selection.
- [x] 2.2 Add a pure `isPermitted(preset, matchedRules)` that unions the
      `allow` and `prohibit` matchers across matched rules and applies the rule:
      permitted iff (allow union empty OR matches an allow) AND matches no
      prohibit; prohibit wins over allow. Matchers evaluate `name`, `provider`,
      or the combined `provider/model` per `field`.

## 3. Permission gate + overlay

- [x] 3.1 Add a warning overlay (e.g. `src/ui/policy-overlay.ts`) reusing the
      `openConfirm` two-outcome pattern from `src/ui/confirm.ts`, naming the
      preset and summarizing why it is discouraged here, with override / cancel.
- [x] 3.2 Add a `gateActivation(...)` helper that loads the policy, evaluates
      `isPermitted` for the candidate, shows the overlay on a non-permitted
      target, and resolves "proceed" only on explicit override; on cancel it
      resolves "abort" with no state change.

## 4. Wire the gate into every NEW activation

- [x] 4.1 Route the `--preset` flag activation in `src/flag.ts` through the gate
      before `apply()`.
- [x] 4.2 Route manual `/presets <name>` activation (router) and picker
      `onActivate` through the gate before `apply()`.
- [x] 4.3 Route per-preset hotkey activation in `src/hotkey-registry.ts`
      through the gate before `apply()`.
- [x] 4.4 Confirm session restore (`restoreFromBranch`) does NOT consult the
      gate — add a regression test rather than code.

## 5. Policy default resolution + auto-apply

- [x] 5.1 Add `resolvePolicyDefault(cwd, presets, rules)` that: selects the
      matched rule with a `default` whose `match` consumes the longest cwd
      substring (ties → earliest file order); filters the merged preset list to
      permitted, available candidates matching the default matcher; and returns
      the first in merged file order (or a typed "none"/"unresolvable"
      result for warnings).
- [x] 5.2 Add a `maybeApplyPolicyDefault(...)` step (e.g.
      `src/activation/policy-default.ts`) that applies the resolved default via
      `apply()` on success, emits one info notification naming it, and on a
      refusal or unresolvable default surfaces a warning and leaves the Pi
      baseline untouched (never throws).
- [x] 5.3 In `src/index.ts` `session_start`, call the policy-default step after
      `restoreFromBranch` and `applyPresetFlag`, guarded so it runs only when the
      flag did not activate a preset AND restore did not attach one (including a
      failed restore). Thread the flag/restore outcomes so the guard needs no
      state re-read.

## 6. Read-only `/presets policy` view

- [x] 6.1 Add a pure formatter (e.g. `src/commands/presets/policy.ts`)
      returning a string listing the rules matching the current cwd, the
      effective (unioned) allow/prohibit matchers, and the resolved default with
      the winning rule and why it won (longest span or file-order tie). Never
      writes any file.
- [x] 6.2 Add a thin `runPolicy(ctx)` runner routing the formatter through
      `ctx.ui.notify`, and register `policy` in the `SUBCOMMANDS` registry in
      `src/commands/presets/router.ts` (autocomplete + dispatch).

## 7. Tests

- [x] 7.1 Loader/validator tests: missing file, empty rules, unsupported
      version (+warning), malformed JSON, invalid `match` regex skips the rule
      (+warning), invalid matcher `pattern` skips the matcher (+warning).
- [x] 7.2 Matcher tests: unanchored substring match; author-anchored `^…$`
      non-match; `field: "provider"` on provider; `field: "model"` spans a whole
      provider (`^anthropic/`); `field` defaults to `name`.
- [x] 7.3 Permission tests: no rules → all permitted; prohibit blocks; allow as
      whitelist; allow admits; prohibit wins over allow; union across rules.
- [x] 7.4 Gate tests: override proceeds to apply; cancel leaves model, thinking,
      tools, and attachment untouched; flag/manual/picker/hotkey gated; restore
      exempt.
- [x] 7.5 Default-selection tests: longest-path rule wins; file-order breaks a
      span tie; first-by-file-order chosen; non-permitted candidates excluded; no
      default configured; default resolves to nothing (+warning).
- [x] 7.6 Default auto-apply precedence tests: flag overrides; successful
      restore preempts; failed restore falls through; one info notification on
      apply and none when preempted; apply refusal is non-fatal (baseline +
      warning).
- [x] 7.7 `/presets policy` formatter tests: matching rules + effective sets +
      resolved default listed; no-matching-rules message; never writes.

## 8. Docs & verify

- [x] 8.1 Document `policy.json` (location, schema, `{ field, pattern }`
      matchers incl. `model`, raw/unanchored regex, union permission model,
      longest-path + file-order default selection, fail-open behavior, restore
      exemption, `/presets policy`) in `README.md`, following user-facing string
      conventions.
- [x] 8.2 Run `mise run check` (format-check, type-check, lint, test) and
      resolve any violations.

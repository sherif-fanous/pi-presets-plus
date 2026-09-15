## 1. Resolve startup comparison inputs

- [x] 1.1 Verify the supported Pi settings API, startup thinking fallback, and
      public model-capability clamp against installed docs and source. Record
      the chosen helper and fallback in the design, with focused tests proving
      supported, restricted, non-reasoning, and absent-thinking behavior without
      private imports.
- [x] 1.2 Add a focused file-backed defaults reader using Pi's settings merge
      and project trust, with an optional final test seam. Verify global values,
      partial trusted project overrides, untrusted project exclusion, and
      rereads after settings edits using isolated settings fixtures.
- [x] 1.3 Implement exact provider/model and normalized thinking comparison with
      silent ineligible outcomes for missing or invalid values, unresolved
      models, absent startup model, reported settings errors, and settings I/O
      failures. Verify no writes or notifications occur, partial reads cannot
      authorize activation, and matching explicit choices remain eligible.

## 2. Integrate automatic-default eligibility

- [x] 2.1 Capture startup provider, model, and thinking before preset processing
      in the session-start handler and pass the snapshot into automatic
      eligibility. Verify with startup tests that later preset processing does
      not replace the captured inputs.
- [x] 2.2 Keep successful flag and restore precedence, then require TUI mode and
      a successful comparison before policy-default resolution. Verify print,
      RPC with dialog support, and missing or unsupported mode skip without
      loading comparison settings or applying a default; verify each differing
      interactive field skips and all matching fields allow activation.
- [x] 2.3 Preserve permitted candidate selection, explicit permission checks,
      refusal reporting, and combined activation outcomes. Verify existing tests
      still cover prohibited candidates, absent and unresolvable defaults, apply
      refusal, successful explicit flags, failed or cancelled flags, restored
      attachments, and failed restores under the new eligibility conditions.

## 3. Prove startup behavior across sessions

- [x] 3.1 Add a startup regression with a print-mode SDK-shaped child, a
      requested model, and a conflicting directory preset. Verify startup and
      the next-turn handler preserve model, thinking, and tools, append no
      automatic active-preset entry, and inject no default instructions without
      launching pi-subagents or calling a model.
- [x] 3.2 Add interactive startup cases for a differing CLI-selected model,
      matching file-backed defaults, explicit equal-value selections, a
      same-model preset with different tools or instructions, and SDK-only
      in-memory defaults. Verify the documented value-based rule without reading
      process arguments or requiring launcher signals.
- [x] 3.3 Exercise startup, reload, new, resume, and fork with restored, absent,
      cleared, and unavailable attachments. Verify successful restore never
      reapplies its model, while unattached sessions continue through the same
      mode and comparison checks.
- [x] 3.4 Verify silent settings skips do not prevent completion setup, hotkey
      binding, or status handling, and do not suppress unrelated preset or
      policy warnings. Verify an ineligible startup emits no
      unresolvable-default warning and no comparison warning leaks into the
      aggregated startup notification.

## 4. Document and validate

- [x] 4.1 Update README and changelog with the print/RPC compatibility change,
      interactive comparison rule, trusted project overrides, silent
      unresolved-settings behavior, explicit preset precedence, and equal-value
      and SDK-only settings limitations. Verify the prose describes user-visible
      behavior and apply the humanizer and unslop skills.
- [x] 4.2 Run focused comparison and startup tests, then `mise run check`.
      Verify all checks pass and review the diff for unintended changes to
      manual activation, permission checks, restoration, or lifecycle
      eligibility.

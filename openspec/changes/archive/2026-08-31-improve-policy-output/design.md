## Context

`formatPolicy` currently turns matching rules into a diagnostic report containing raw regex metadata. The command already loads the merged preset list and policy rules, and the policy store already exposes the permission and default-resolution functions needed to derive user-facing outcomes. `/presets status` provides the established title and aligned-row presentation to follow.

## Goals / Non-Goals

**Goals:**

- Derive the displayed allowed and prohibited lists from the same permission decision used by activation.
- Match `/presets status` visually without changing that formatter.
- Keep `formatPolicy` pure and keep `runPolicy` as the I/O and notification boundary.

**Non-Goals:**

- Change policy matching, permission, override, or default-selection behavior.
- Add a verbose or policy-debugging mode.
- Extract a shared report-layout abstraction for two small formatters.

## Decisions

### Classify only usable merged presets

`formatPolicy` will discard presets marked `shadowed` or `unavailable`, then partition the remaining presets with the existing policy permission function and the rules matching the current directory. Filtering preserves merged order and avoids claiming that a preset blocked by model availability can be activated.

Using the existing permission function is preferred over reconstructing allow and prohibit logic in the formatter. It keeps the report and activation gate consistent.

### Keep report rendering local to the policy formatter

The formatter will accept an optional minimal styler with an identity default, mirroring `formatStatus`. The runner will pass `ctx.ui.theme`. A local fixed-width row helper will render muted labels and values.

Extracting the private status row helper into a shared module was considered and rejected. The helper is only padding and theme application, while sharing it would widen the change and couple two independently shaped label sets.

### Share durable vocabulary, not layout mechanics

The `Preset Policy` title and policy row labels will live in the existing user-facing labels module. The conditional `Prohibited presets*` form and explanatory footnote remain in the policy formatter because they are composition specific to this report.

### Collapse default outcomes to the observable result

Both an absent default and an unresolvable default will display `none`. Rule identity and tie-breaking reason will not be rendered. Policy-loading warnings remain separate notifications through the existing warning path, so malformed configuration is still visible.

### Render the override note only when relevant

If the prohibited list is non-empty, the label gains an asterisk and the report appends the agreed footnote after a blank line. With an empty prohibited list, the plain label and `none` value are shown without a footnote.

## Risks / Trade-offs

- [Removing rule diagnostics makes regex troubleshooting less direct] -> Policy-load errors still identify invalid rules and matchers; this command intentionally prioritizes effective outcomes over engine internals.
- [Long preset lists may produce wide rows] -> Preserve the existing comma-separated report style; add wrapping only if real terminal use shows a readability problem.
- [Policy and availability can change between invocations] -> Keep the existing fresh reads on every command invocation.

## Migration Plan

No data migration is needed. Release the formatter and test changes together. Rollback restores the previous formatter output without touching user policy files.

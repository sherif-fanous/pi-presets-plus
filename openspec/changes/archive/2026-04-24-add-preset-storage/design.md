## Context

This change is the storage layer for `pi-presets-plus`. It is intentionally separated from activation (change 3) so the read/write path can be unit-tested in isolation, without mocking pi runtime APIs. Once this change lands, users can hand-edit JSON files and view the parsed result via `/presets list` — a usable, if minimal, workflow that mirrors `pi list`.

The data model and file format are decisions whose rationale was captured during the original umbrella discussion (see `openspec/breakdown.md` for the cross-change rationale). This document captures the storage-specific decisions only.

## Goals / Non-Goals

**Goals**

- Single load entry point (`loadAll`) that returns a deterministic, ordered, scope-tagged list of presets.
- Atomic writes that survive process kill mid-write without corrupting the destination file.
- Validation that distinguishes "broken file" (silent treat-as-empty + warning) from "broken individual preset" (skip + warning) so one bad preset never disables all of them.
- Pure modules: `load`, `validate`, `save`, and `paths` must be testable without mocking pi.
- Make all preset CRUD primitives available to later changes via a single `store/api.ts` module.

**Non-Goals**

- Any apply/clear/restore behavior — change 3.
- Any UI — changes 4 and 5.
- Drift detection — change 6.
- File-watching for live refresh. v1 reloads on `session_start` and `/reload` only.
- Cross-process locking. Last-write-wins for concurrent edits is acceptable at human edit rates.

## Decisions

### Data model

```ts
// src/types.ts (additions)
export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export interface Preset {
  name: string; // unique within file
  provider: string;
  model: string;
  thinkingLevel?: ThinkingLevel; // default "off" at apply time (change 3)
  tools?: string[]; // omit/empty = inherit current/default tools
  instructions?: string; // appended to system prompt (change 3)
  hotkey?: string; // honored in change 7
  order?: number; // user-controlled cycle order; default = file order
}

export interface PresetsFile {
  version: 1;
  presets: Preset[];
}

export type PresetScope = "user" | "project";

export interface LoadedPreset extends Preset {
  scope: PresetScope; // derived from source file
  shadowed?: boolean; // global preset hidden by same-named project preset
  unavailable?: "no-key" | "no-model"; // computed at load time
}
```

`hotkey`, `order`, `instructions`, and `tools` are accepted by the loader and round-trip through save, but no behavior reads them in this change beyond the picker-less `/presets list` text output. That keeps each subsequent change focused on adding behavior, not extending the data shape.

### File format

```jsonc
{
  "version": 1,
  "presets": [
    {
      "name": "plan",
      "provider": "anthropic",
      "model": "claude-opus-4.5",
      "thinkingLevel": "high",
      "tools": ["read", "grep", "find", "ls"],
      "instructions": "You are in PLAN mode...",
      "order": 0,
    },
  ],
}
```

**Why an array, not a `Record<name, preset>`**: preserves user-controlled order trivially, makes `hotkey` and `order` first-class, and diffs cleanly in version control. Cost is small: validation must check for duplicate names within a file.

**Why `version: 1`**: a future change may evolve the shape (e.g. `tools: string[] | { inherit, include, exclude }`). A version field lets us read v1 files in a v2 binary unambiguously. Unsupported versions are not rewritten — we treat them as empty and warn.

### Storage paths

- Global: `getAgentDir()` + `/presets-plus/presets.json` — the agent dir is exposed by `@mariozechner/pi-coding-agent` so we don't hardcode `~/.pi/agent`.
- Project: `<ctx.cwd>/.pi/presets-plus/presets.json`.

The `presets-plus/` subdirectory leaves room for future siblings (`history.json`, `hotkeys.json`) without polluting the parent.

### Merge and shadow semantics

```text
1. Load both files; missing → { version: 1, presets: [] }.
2. Validate version. Wrong version → empty + warn; do not delete.
3. Tag each preset with its scope.
4. Project preset with same `name` as a global preset:
     - The project preset is the active one (used at activation time).
     - The global preset is kept in the loaded list with `shadowed: true`,
       so the picker can render it greyed.
5. Order: globals first (file order), then projects (file order). When `order`
   is set on presets, the picker may resort by that field; the storage layer
   itself preserves file order.
```

Shadowing is a feature, not a quirk: a user can ship a project-specific override of a personal preset. We surface it instead of hiding it.

### Atomic write recipe

```ts
async function atomicWrite(target: string, contents: string) {
  const dir = dirname(target);
  await mkdir(dir, { recursive: true });
  const tmp = `${target}.tmp.${process.pid}.${Date.now()}`;
  const fh = await open(tmp, "w");
  try {
    await fh.writeFile(contents);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, target);
}
```

- `process.pid` + timestamp in the tmp name prevents collision if two pi processes save concurrently.
- `fsync` before rename ensures bytes are on disk before the rename is observed.
- Rename is atomic on POSIX filesystems and on NTFS with `MOVEFILE_REPLACE_EXISTING` (Node's `fs.rename` does this).
- Concurrent edits are last-write-wins. A future change could add a content hash check, but it's overkill at human edit rates.

### Validation policy

Two layers:

```text
FILE-LEVEL          BEHAVIOR
──────────          ────────
JSON parse error    treat file as empty; warn; do not modify
version != 1        treat file as empty; warn; do not modify
top-level not       treat file as empty; warn
  { version, presets }

PRESET-LEVEL        BEHAVIOR
────────────        ────────
missing name/       skip preset; warn naming the offender
  provider/model
duplicate name      first wins; skip duplicates with warning
  within file
invalid             skip preset; warn
  thinkingLevel
unknown tool name   keep preset; tool list is filtered/warned
                    at apply time (change 3), not load time
hotkey present      keep preset; not parsed in this change
order non-numeric   skip the field; preset still loads
```

The "skip preset, don't fail load" rule means one broken preset never disables `/presets list` for the user. Loud-but-non-fatal warnings via `ctx.ui.notify`.

### `presets-package` modification: command routing

The bare `/presets` command from change 1 is now a router:

```ts
pi.registerCommand("presets", {
  description:
    "Manage and switch presets that bundle a model, thinking level, tools, and system prompt.",
  getArgumentCompletions: (prefix) => {
    return [
      { value: "list", label: "list" },
      { value: "reload", label: "reload" },
    ].filter((i) => i.value.startsWith(prefix));
  },
  handler: async (args, ctx) => {
    const [sub, ...rest] = (args ?? "").trim().split(/\s+/);
    switch (sub) {
      case "":
        return showStubNotice(ctx);
      case "list":
        return runList(ctx);
      case "reload":
        return runReload(ctx);
      default:
        return ctx.ui.notify(
          `Unknown subcommand "${sub}". Try /presets list.`,
          "warning",
        );
    }
  },
});
```

Stub notice replaces the change-1 message with: "No UI yet — try `/presets list` to see loaded presets."

`/presets list` formats the loaded presets as a multi-line text block (one preset per block), showing name, scope, provider/model, thinking, tools, hotkey, availability, shadowed flag. This is intentionally text — no `ctx.ui.custom` yet.

`/presets reload` calls `loadAll(ctx)` again and reports the count of loaded presets and any warnings.

### API surface for later changes

```ts
// src/store/api.ts
export async function loadAll(ctx: ExtensionContext): Promise<{
  presets: LoadedPreset[]; // ordered, with scope/shadowed/unavailable computed
  warnings: string[]; // surfaced by the caller
}>;

export async function saveScope(
  scope: PresetScope,
  presets: Preset[],
  ctx: ExtensionContext,
): Promise<void>;

export async function addPreset(
  preset: Preset,
  scope: PresetScope,
  ctx: ExtensionContext,
): Promise<LoadedPreset>;

export async function updatePreset(
  oldName: string,
  scope: PresetScope,
  next: Preset,
  ctx: ExtensionContext,
): Promise<LoadedPreset>;

export async function removePreset(
  name: string,
  scope: PresetScope,
  ctx: ExtensionContext,
): Promise<void>;

export async function reorderWithinScope(
  scope: PresetScope,
  orderedNames: string[],
  ctx: ExtensionContext,
): Promise<void>;
```

These APIs are used by changes 4 (picker reorder), 5 (editor + capture), and 6/7 don't need new storage. Each mutating operation re-loads, mutates, and atomically writes the affected scope file.

## Risks / Trade-offs

- **Duplicate names across scopes** are intentional (shadowing). A user could be confused by "two `plan` presets in the list." Mitigation: list output marks shadowed entries clearly.
- **Validation warnings can spam the UI** if a user has many broken presets after editing. Mitigation: collect warnings during `loadAll`, then surface a single rolled-up notification ("3 presets had issues; run `/presets list` for details").
- **Tools list isn't validated against `pi.getAllTools()` at load time** — only at apply time in change 3. A user could save a preset with a typo and not see the warning until activation. Mitigation: deliberate; we don't want load-time validation to depend on pi runtime state more than necessary, and the picker (change 4) can re-check.
- **`process.pid + timestamp` tmp file naming** isn't strictly collision-free across very fast concurrent saves. Mitigation: realistic concurrency on a human-edited file is zero; we just need to not leave half-written files behind.
- **No file-watching** — users editing the JSON in another editor must `/presets reload` (or `/reload`) to pick up changes. Mitigation: documented in the `/presets list` help text.

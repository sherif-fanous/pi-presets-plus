# pi-presets-plus

A [Pi](https://github.com/badlogic/pi) extension that lets you bundle a model, thinking level, tools, and system prompt into a named preset, then switch between presets with one hotkey.

## Why

Pi lets you choose the model, thinking effort, tools, and system prompt separately. That works for one-off changes. It gets tedious when you keep returning to the same setups: a fast, cheap model for boilerplate; a heavier model for tricky design; a "review only" setup with no write tools and a strict prompt; or separate planning and implementation modes.

`pi-presets-plus` saves those settings together as a named preset. You can switch presets with one keystroke.

## Install

```shell
pi install npm:@sherif-fanous/pi-presets-plus
```

Or try it without installing:

```shell
pi -e npm:@sherif-fanous/pi-presets-plus
```

To uninstall:

```shell
pi remove npm:@sherif-fanous/pi-presets-plus
```

## Quick start

1. Run `/presets` in any Pi session to open the preset picker.
2. Press `n` to create a new preset, or `e` to edit an existing one.
3. Press `Enter` on the Prompt row to open the multi-line prompt editor, or press `F1` on any row to get help for that row.
4. Save your preset and, optionally, give it a hotkey. From then on, pressing the hotkey switches to the preset. Run `/presets clear` to go back to Pi's defaults.

The picker can also filter by name, switch scopes, reorder presets, make copies, and delete them. Its footer shows the available keys.

## What's in a preset

| Field    | What it does                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| Name     | A short, memorable label for the preset. Names are unique within their scope.                                      |
| Scope    | _User_ presets work across every project. _Project_ presets stay with one repo, and you can share them.            |
| Provider | The service that hosts the model (OpenAI, Anthropic, etc.). Only providers Pi knows about appear here.             |
| Model    | The specific model Pi will use when this preset is active.                                                         |
| Thinking | How much extra reasoning effort to ask for. Some models don't support every level; unavailable ones appear dimmed. |
| Tools    | Either keep whatever tools are active, or pin an exact tool list to the preset.                                    |
| Prompt   | Extra instructions added to Pi's system prompt while the preset is active. Pi keeps its default prompt too.        |
| Hotkey   | Optional. A single key combination (like `ctrl+shift+1`) that switches to this preset.                             |

## Where presets live

| Scope   | Path                                                                                        |
| ------- | ------------------------------------------------------------------------------------------- |
| User    | `<agent-dir>/presets-plus/presets.json` (typically `~/.pi/agent/presets-plus/presets.json`) |
| Project | `<repo>/.pi/presets-plus/presets.json`                                                      |

If a project preset and a user preset share a name, the project preset wins while you're working in that project.

## Directory access policy

An optional policy file at `<agent-dir>/presets-plus/policy.json` can warn you before you activate the wrong preset in a directory. It can also choose a default preset for fresh sessions. The extension reads this file but never creates or rewrites it.

```json
{
  "version": 1,
  "rules": [
    {
      "match": "^/Users/me/work/",
      "allow": [{ "field": "provider", "pattern": "^anthropic$" }],
      "prohibit": [{ "pattern": "^personal-" }],
      "default": { "field": "model", "pattern": "^anthropic/claude-opus" }
    }
  ]
}
```

The extension tests each rule's `match` against the current working directory. `allow`, `prohibit`, and `default` use `{ "field", "pattern" }` matchers. The field may be `name`, `provider`, or `model`; it defaults to `name`. A `model` matcher tests the combined `provider/model` value.

All patterns are raw, unanchored JavaScript regular expressions. For example, `apple` matches `apple-opus`, while `^apple-` only matches names with that prefix.

The extension combines the `allow` and `prohibit` matchers from every rule that matches the current directory. A non-empty allow set acts as a whitelist, and prohibit always wins. If the flag, command, picker, or hotkey tries to activate a non-permitted preset, the extension asks you to Override or Cancel. Session restore does not run this check.

For fresh sessions, the matching default rule whose `match` consumes the longest part of the current directory wins. File order breaks equal-length ties. Its matcher selects the first available preset permitted by the combined rules, using the existing merged preset order. The `--preset` flag and a successful session restore take precedence over this default.

Invalid JSON or an unsupported version disables the file and shows a warning. An invalid rule `match` skips that rule, while an invalid matcher pattern skips only that matcher. Policy errors fail open: a typo will not block activation, and the warning identifies the rule or matcher that the extension skipped. Run `/presets policy` to see the matching rules, combined allow and prohibit sets, and resolved default.

## Commands

| Command                       | What it does                                                    |
| ----------------------------- | --------------------------------------------------------------- |
| `/presets`                    | Opens the picker.                                               |
| `/presets <name>`             | Activates the named preset.                                     |
| `/presets clear`              | Clears the active preset and returns to Pi's defaults.          |
| `/presets reload`             | Re-reads your preset files (use after editing them by hand).    |
| `/presets status`             | Shows the active preset's settings compared to Pi's defaults.   |
| `/presets policy`             | Shows the access policy for the current directory.              |
| `/presets show-prompt [name]` | Shows the active preset's prompt, or the named preset's prompt. |

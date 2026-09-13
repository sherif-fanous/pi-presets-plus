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

## Configuration

Pi Presets Plus reads these files:

| Scope   | File                                   | Notes                                                                                                                        |
| ------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| User    | `<agent-dir>/presets-plus/config.json` | Available in every project. It can contain presets, the inactive-status setting, and policy rules.                           |
| Project | `<repo>/.pi/presets-plus/config.json`  | Available in that repository. It can contain presets and the inactive-status setting. Policy rules in this file are ignored. |

The following table lists the configuration keys. Paths use `[]` for an item in an array. User files support every key. Project files support `showInactiveStatus` and `presets`; a project `policy` section is ignored and produces a warning.

| Key                                 | Explanation                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `showInactiveStatus`                | Set to `false` to hide `Preset: none` when no preset is active. The project value overrides the user value. |
| `presets`                           | An array of preset objects. Project presets take precedence when both scopes contain the same name.         |
| `presets[].name`                    | Required unique name within the file.                                                                       |
| `presets[].provider`                | Required provider that hosts the model.                                                                     |
| `presets[].model`                   | Required model identifier.                                                                                  |
| `presets[].thinkingLevel`           | Reasoning level to request, such as `low`, `medium`, or `high`.                                             |
| `presets[].tools`                   | Exact tool list. Omit it or leave it empty to keep the active tools.                                        |
| `presets[].instructions`            | Extra instructions added to Pi's system prompt.                                                             |
| `presets[].hotkey`                  | Optional key combination that activates the preset.                                                         |
| `presets[].order`                   | Optional ordering value preserved in the file. The array order is used by default.                          |
| `policy`                            | Contains directory rules. Only the user configuration supports this key.                                    |
| `policy.rules`                      | Array of directory policy rules.                                                                            |
| `policy.rules[].match`              | Regular expression tested against the current working directory.                                            |
| `policy.rules[].allow`              | Matchers that form the allow list. If present, a preset must match one of them.                             |
| `policy.rules[].prohibit`           | Matchers that prevent activation. Prohibited matches override allowed matches.                              |
| `policy.rules[].default`            | Matcher used to choose a preset in a fresh session.                                                         |
| `policy.rules[].allow[].field`      | Field to test: `name`, `provider`, or `model`. It defaults to `name`.                                       |
| `policy.rules[].allow[].pattern`    | Regular expression tested against the selected field.                                                       |
| `policy.rules[].prohibit[].field`   | Field to test: `name`, `provider`, or `model`. It defaults to `name`.                                       |
| `policy.rules[].prohibit[].pattern` | Regular expression tested against the selected field.                                                       |
| `policy.rules[].default.field`      | Field to test: `name`, `provider`, or `model`. It defaults to `name`.                                       |
| `policy.rules[].default.pattern`    | Regular expression tested against the selected field.                                                       |

User presets work across projects. Project presets stay with their repository. Run `/reload` after editing either configuration file.

Policy rules use raw, unanchored JavaScript regular expressions. Rules whose `match` fits the current directory combine their `allow` and `prohibit` matchers. The default from the rule with the longest matching directory path wins, with file order breaking ties. The `--preset` flag and a successful session restore take precedence over an automatic default.

When a command, picker action, flag, or hotkey targets a prohibited preset, Pi asks whether to Override or Cancel. Session restore does not run this check. Invalid policy patterns are skipped with a warning, so they do not block activation. Run `/presets policy` to inspect the effective policy.

## Commands

| Command                       | What it does                                                    |
| ----------------------------- | --------------------------------------------------------------- |
| `/presets`                    | Opens the picker.                                               |
| `/presets <name>`             | Activates the named preset.                                     |
| `/presets clear`              | Clears the active preset and returns to Pi's defaults.          |
| `/presets reload`             | Re-reads your preset files (use after editing them by hand).    |
| `/presets status`             | Shows the active preset's settings compared to Pi's defaults.   |
| `/presets policy`             | Shows allowed and prohibited presets for the current directory. |
| `/presets show-prompt [name]` | Shows the active preset's prompt, or the named preset's prompt. |

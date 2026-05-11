# pi-presets-plus

A [Pi](https://github.com/badlogic/pi) extension that lets you bundle a model, thinking level, tools, and system prompt into a named preset, then switch between presets with one hotkey.

## Why

Pi already lets you change the model you talk to, how hard it thinks, which tools it can use, and what system prompt it follows. Each of those is its own setting, and tweaking them one at a time is fine for ad-hoc work but it gets tedious when you have a handful of working modes you keep coming back to: a fast cheap model for boilerplate, a heavy reasoning model for tricky design, a "review only" setup with no write tools and a strict prompt, a planning mode, an implementation mode.

`pi-presets-plus` lets you save a complete setup as a named preset and switch to it with one keystroke.

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

The picker also lets you filter by name, switch the scope filter, reorder, duplicate, and delete presets. The footer always shows the keys you can press.

## What's in a preset

| Field    | What it does                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| Name     | A short, memorable label for the preset. Names are unique within their scope.                                      |
| Scope    | _User_ presets follow you across every project. _Project_ presets stay tied to one repo and can be shared.         |
| Provider | The service that hosts the model (OpenAI, Anthropic, etc.). Only providers Pi knows about appear here.             |
| Model    | The specific model Pi will use when this preset is active.                                                         |
| Thinking | How much extra reasoning effort to ask for. Some models don't support every level; unavailable ones appear dimmed. |
| Tools    | Either keep whatever tools are active, or pin an exact tool list to the preset.                                    |
| Prompt   | Extra instructions added to Pi's system prompt while the preset is active. Pi's defaults are kept either way.      |
| Hotkey   | Optional. A single key combination (like `ctrl+shift+1`) that switches to this preset.                             |

## Where presets live

| Scope   | Path                                                                                        |
| ------- | ------------------------------------------------------------------------------------------- |
| User    | `<agent-dir>/presets-plus/presets.json` (typically `~/.pi/agent/presets-plus/presets.json`) |
| Project | `<repo>/.pi/presets-plus/presets.json`                                                      |

If a project preset and a user preset share a name, the project preset wins while you're working in that project.

## Commands

| Command                       | What it does                                                  |
| ----------------------------- | ------------------------------------------------------------- |
| `/presets`                    | Opens the picker.                                             |
| `/presets clear`              | Clears the active preset and returns to Pi's defaults.        |
| `/presets reload`             | Re-reads your preset files (use after editing them by hand).  |
| `/presets status`             | Shows the active preset's settings compared to Pi's defaults. |
| `/presets show-prompt [name]` | Shows the active preset's prompt, or the named preset's prompt. |

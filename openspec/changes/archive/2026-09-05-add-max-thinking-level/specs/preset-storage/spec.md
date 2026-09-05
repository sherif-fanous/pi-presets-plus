## MODIFIED Requirements

### Requirement: Preset shape validation at load time

Each preset SHALL contain at minimum a non-empty string `name`, a string `provider`, and a string `model`. It MAY additionally contain `thinkingLevel` (one of `"off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"`), `tools` (string array), `instructions` (string), `hotkey` (string), and `order` (number). Invalid presets SHALL be skipped with a warning; the rest of the file SHALL still load.

#### Scenario: Minimal valid preset

- **WHEN** a preset declares only `name`, `provider`, and `model`
- **THEN** the preset SHALL load successfully

#### Scenario: Missing required field

- **WHEN** a preset omits `name`, `provider`, or `model`
- **THEN** the preset SHALL be skipped during load and a warning SHALL be emitted naming the offending entry
- **AND** other valid presets in the same file SHALL still load

#### Scenario: Duplicate names within one file

- **WHEN** a single file contains two presets with the same `name`
- **THEN** the first occurrence SHALL be kept and subsequent duplicates SHALL be skipped with a warning

#### Scenario: Invalid thinking level

- **WHEN** a preset declares a `thinkingLevel` not in the allowed set
- **THEN** the preset SHALL be skipped with a warning

#### Scenario: Max thinking level accepted

- **WHEN** a preset declares `thinkingLevel: "max"`
- **THEN** the preset SHALL load successfully with `"max"` as its declared thinking level

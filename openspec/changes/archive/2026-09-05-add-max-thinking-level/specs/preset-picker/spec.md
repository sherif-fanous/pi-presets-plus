## ADDED Requirements

### Requirement: Picker renders the max thinking level compatibly

The picker SHALL render a preset with `thinkingLevel: "max"` as `Max` using the `thinkingMax` theme color. If the active Pi theme API reports that `thinkingMax` is unknown, the picker SHALL render the value using `thinkingXhigh` instead. The fallback SHALL NOT hide unrelated theme errors.

#### Scenario: Max uses its theme color

- **WHEN** the picker renders a max preset and the active theme supports `thinkingMax`
- **THEN** the Thinking value SHALL read `Max`
- **AND** it SHALL use `thinkingMax`

#### Scenario: Older theme API uses the fallback

- **WHEN** the picker renders a max preset and the active theme reports that `thinkingMax` is unknown
- **THEN** the Thinking value SHALL read `Max`
- **AND** it SHALL use `thinkingXhigh`
- **AND** rendering SHALL NOT throw

#### Scenario: Unrelated theme error propagates

- **WHEN** rendering a max preset fails for a reason other than an unknown `thinkingMax` color
- **THEN** the picker SHALL propagate the error

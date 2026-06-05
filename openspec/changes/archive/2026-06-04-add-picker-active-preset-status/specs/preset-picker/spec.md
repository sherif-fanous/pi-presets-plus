## ADDED Requirements

### Requirement: Picker displays a permanent active-preset status row

The picker SHALL render a permanent status row, on its own line within
the picker chrome (distinct from the bordered header line and the filter
input row), that names the currently active preset. The row's visibility
SHALL be a function of session state ONLY: it SHALL render in every
picker state, independent of focus mode, scope filter, filter query,
scroll position, and reorder.

When a preset is active, the row SHALL read `Active: <name> (<Scope>)`,
where `<name>` is the active preset's name and `<Scope>` is `User` or
`Project`. The scope suffix SHALL render in the `dim` color and exists to
disambiguate presets that share a name across scopes, matching the
in-list dot's name + scope identity. When no preset is active, the row
SHALL read `Active: none` with the `none` sentinel rendered in the `dim`
color so it stays distinct from an active preset literally named `none`.
The row SHALL always be present, so only its text varies between these
two cases.

The status row SHALL show the active preset's name only and SHALL NOT
append a drift or `(modified)` indicator; drift signaling remains the
responsibility of the in-list card. The status row SHALL NOT replace the
in-list active-preset dot and accent highlight; both SHALL continue to
render so the row provides always-visible identity while the dot
provides the in-list locator.

When the active preset name is too long for the interior width, the row
SHALL middle-ellipsize the name so that both the leading and trailing
portions remain visible.

#### Scenario: Active preset shown on open with the active card off-screen

- **WHEN** a preset is active and the picker opens with that preset
  scrolled below the visible list region
- **THEN** the status row SHALL read `Active: <name> (<Scope>)` for the
  active preset even though no active dot is visible in the list

#### Scenario: No preset active

- **WHEN** the picker is open and no preset is active
- **THEN** the status row SHALL read `Active: none` with the `none`
  sentinel rendered in the `dim` color

#### Scenario: Scope suffix disambiguates same-named presets

- **WHEN** the active preset shares its name with a preset in the other
  scope
- **THEN** the status row SHALL append the active preset's scope as
  `(User)` or `(Project)` so the row identifies the same preset the
  in-list dot marks

#### Scenario: Status row invariant under filter query

- **WHEN** a preset is active and the user types a filter query that
  excludes the active preset from the visible list
- **THEN** the status row SHALL continue to read
  `Active: <name> (<Scope>)` for the active preset

#### Scenario: Status row invariant under scope filter

- **WHEN** a user-scope preset is active and the user toggles the scope
  filter to project-only so the active preset is no longer in the list
- **THEN** the status row SHALL continue to read
  `Active: <name> (<Scope>)` for the active preset

#### Scenario: Status row invariant under focus mode

- **WHEN** a preset is active and the user switches between list focus
  and filter focus
- **THEN** the status row text SHALL remain unchanged across both focus
  modes

#### Scenario: Status row omits drift indicator

- **WHEN** the active preset is dirty/drifted
- **THEN** the status row SHALL read `Active: <name> (<Scope>)` with no
  drift or `(modified)` suffix, and the in-list card SHALL retain its
  drift signaling

#### Scenario: Long active preset name is middle-ellipsized

- **WHEN** the active preset's name exceeds the interior width of the
  status row
- **THEN** the row SHALL render the name middle-ellipsized so both the
  leading and trailing portions remain visible

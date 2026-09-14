## ADDED Requirements

### Requirement: Searchable provider and model selectors

Pressing Enter on the Provider or Model row SHALL open a selector with an
immediately editable search field. Provider options SHALL contain distinct known
providers in registry order. Model options SHALL contain only models belonging
to the selected provider, including selectable entries marked `(no key)`. Model
results SHALL display their identifiers so similarly named versions remain
distinguishable.

The selector SHALL start with an empty query and highlight the current value if
present, otherwise the first option. Opening it SHALL NOT replace an unknown
stored value. The form SHALL retain its left/right cycling behavior when no
selector is open. Focused Provider and Model rows SHALL advertise Enter
selection in their contextual hints.

#### Scenario: Open a provider selector

- **WHEN** the user presses Enter on Provider
- **THEN** the selector opens with a focused empty search field and the current
  provider highlighted if present
- **AND** typing filters provider options immediately

#### Scenario: Open a model selector

- **WHEN** the user presses Enter on Model
- **THEN** only models for the selected provider appear
- **AND** the current model is highlighted if present
- **AND** entries without configured authentication remain selectable and marked
  `(no key)`

#### Scenario: Preserve arrow cycling

- **WHEN** the selector is closed and the user presses left or right on Provider
  or Model
- **THEN** the editor cycles that field as before without opening a selector

### Requirement: Name and version search

Search SHALL be case-insensitive and ignore surrounding whitespace. Provider
search SHALL use the provider identifier. Model search SHALL use the model
identifier and display name, without searching availability annotations.

Matching SHALL treat punctuation separators as spaces, collapse whitespace, and
split the query into tokens. Every query token SHALL occur as a substring in the
normalized searchable text, regardless of token order. Results SHALL rank
normalized exact identifier matches first, identifier prefix matches second, and
other token matches third. Ties SHALL preserve registry order. Empty queries
SHALL restore registry order. The initial version SHALL NOT apply fuzzy
subsequence matching or semantic aliases.

Changing the query SHALL highlight the first ranked result. Clearing it SHALL
highlight the current field value when present, otherwise the first result. No
matches SHALL show a complete-sentence empty-state message; Enter SHALL NOT
confirm a nonexistent result.

#### Scenario: Search across model separators

- **WHEN** the user searches for `OPUS 5`
- **THEN** identifiers such as `claude-opus-5` and `claude-5-opus` match
- **AND** a model named `Fable 5` without `opus` in its identifier or display
  name does not match

#### Scenario: Search by display name

- **WHEN** the user searches for `astra` and a model's display name contains
  `Astra` but its identifier does not
- **THEN** that model appears in the results

#### Scenario: Rank and reset results

- **WHEN** a query matches an exact normalized identifier, an identifier prefix,
  and other token matches
- **THEN** those groups appear in that order with stable registry order within
  each group
- **AND** clearing the query restores the full registry order and current field
  highlight when present

#### Scenario: No matching entries

- **WHEN** the query matches no entries, or the selector has no options
- **THEN** the selector displays an empty-state message and remains cancellable
- **AND** Enter leaves the selector open without changing the draft

### Requirement: Selector confirmation and cancellation

Up/down SHALL move the highlight through results while typed text and backspace
edit the query. The highlighted result SHALL remain visible in a bounded
viewport. Enter SHALL confirm the highlighted result and return to the form
focused on the originating row. Escape SHALL cancel only the selector and return
to that row.

Browsing, filtering, opening, and cancellation SHALL NOT change draft values or
diagnostics. Editor Save, Test, and form-navigation shortcuts SHALL NOT act on
the underlying form while the selector is open. Reopening a selector SHALL
discard its previous query.

Confirming a different provider SHALL select its first model in original
registry order, apply the existing thinking-level compatibility adjustment,
clear Provider and Model diagnostics, and return to the form without opening
model selection. Confirming a different model SHALL apply the existing
thinking-level compatibility adjustment and clear Model diagnostics. Confirming
the already selected value SHALL leave the draft and diagnostics unchanged.

#### Scenario: Confirm a provider

- **WHEN** the user confirms a different provider after filtering the provider
  list
- **THEN** the draft selects that provider and its first registry model,
  regardless of search ranking
- **AND** the existing thinking-level compatibility adjustment applies and
  Provider and Model diagnostics clear
- **AND** focus returns to Provider without opening a model selector

#### Scenario: Confirm a model

- **WHEN** the user confirms a different model
- **THEN** the draft selects that model without changing provider
- **AND** the existing thinking-level compatibility adjustment applies and Model
  diagnostics clear
- **AND** focus returns to Model

#### Scenario: Cancel after browsing

- **WHEN** the user filters and navigates results, then presses Escape
- **THEN** the selector closes, the editor remains open, and all draft values
  and diagnostics remain unchanged
- **AND** focus returns to the originating row

#### Scenario: Confirm the current value

- **WHEN** the user confirms the provider or model already selected in the form
- **THEN** the selector closes without resetting the model, thinking level, or
  diagnostics

#### Scenario: Isolate selector input

- **WHEN** the selector is open and the user presses an editor Save, Test, or
  form-navigation shortcut
- **THEN** the underlying form is not saved, tested, closed, or navigated

#### Scenario: Browse a large result set

- **WHEN** navigation moves beyond the currently visible results
- **THEN** the viewport scrolls to keep the highlighted result visible without
  exceeding the available terminal height

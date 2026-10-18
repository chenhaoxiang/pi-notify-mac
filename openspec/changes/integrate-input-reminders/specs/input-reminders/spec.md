## ADDED Requirements

### Requirement: One package with independent reminder controls
The package SHALL provide completion and waiting-for-input reminders through one manifest entry, with independent enable switches, without importing a legacy extension or approval policy.

#### Scenario: Completion disabled while input remains enabled
- **WHEN** completion is disabled and an eligible TUI prompt remains open
- **THEN** the input reminder is still eligible and no completion notification is requested

### Requirement: Remind only for actual supported interactive prompts
The package SHALL remind for confirm, select, input and editor prompts and for custom question UI explicitly identified by the opaque `pi:input-required` producer event; it SHALL NOT remind for an unexecuted tool call, unrelated display custom UI (including one shown while another question tool is executing), non-TUI or non-macOS sessions.

#### Scenario: Question custom UI opens
- **WHEN** the maintained question producer emits a matching `pi:input-required` start and its custom prompt opens
- **THEN** at most one reminder is scheduled for the outer prompt interval and a matching end cancels it

#### Scenario: Display overlay opens
- **WHEN** an unrelated custom UI opens
- **THEN** no alert, sound or terminal focus is requested

### Requirement: Reminder lifetime follows the prompt
The package SHALL cancel pending reminders, alert and sound subprocesses and late focus callbacks on prompt resolution or session invalidation. Acknowledging an alert SHALL only dismiss the reminder, not answer or approve the TUI prompt.

#### Scenario: User answers before or after dispatch
- **WHEN** the prompt ends
- **THEN** no pending or repeated reminder remains and an old jump callback cannot focus a terminal

### Requirement: Private and bounded delivery
The package SHALL use fixed reminder messages without prompt contents or tool arguments; tty lookup and focus commands SHALL be asynchronous and bounded, and failures SHALL NOT block or decide the underlying interaction.

#### Scenario: Terminal cannot be found
- **WHEN** exact Terminal selection fails
- **THEN** failure is reported without pretending another Terminal instance is the target

### Requirement: Reversible single-source installation
The local migration installer SHALL require an existing settings file, preserve legacy files/settings outside discovery, install all runtime modules, select only the new package source, remove exact legacy extension declarations and preserve unrelated settings. It SHALL acquire Pi's `settings.json.lock` lease before reading/modifying settings, refuse an existing or replaced lease, and SHALL NOT overwrite a conflicting installed version. A missing settings file SHALL be rejected without creating configuration or installing a selected package; fresh first-write belongs to official Pi installation.

#### Scenario: Upgrade from a manual approval reminder and old package
- **WHEN** migration succeeds
- **THEN** only the new complete package is enabled, legacy bytes/settings are preserved for rollback and no legacy shim remains in discovery

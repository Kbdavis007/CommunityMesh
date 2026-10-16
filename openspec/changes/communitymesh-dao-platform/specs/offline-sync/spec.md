# Spec Delta

## Purpose

Lets members continue using previously synchronized community data while offline and safely reconcile supported local changes with the authoritative service after connectivity returns.

## ADDED Requirements

### Requirement: Members can read scoped synchronized data offline
The application MUST display the most recently synchronized public data for the selected community and the signed-in member's minimum profile and task data while offline, and MUST identify when displayed data may be stale.

#### Scenario: Open a previously synchronized view offline
- **WHEN** a member opens a view whose data is stored on the device while disconnected
- **THEN** the application renders that local data and indicates its last successful synchronization time

#### Scenario: Open a view with no local copy
- **WHEN** a member requests data that has not been synchronized to the device
- **THEN** the application explains that the data is unavailable offline and does not show it as current

### Requirement: Supported offline changes are durably queued
The application MUST let a signed-in member create, edit, or archive listings, edit their own profile, and submit task-completion evidence offline, and MUST mark each queued change as pending until the server accepts it.

#### Scenario: Save a supported change offline
- **WHEN** a member makes a supported change while disconnected
- **THEN** the application persists it locally, displays the local result, and marks it pending synchronization

#### Scenario: Attempt a connectivity-dependent action offline
- **WHEN** a member attempts to claim a task or cast a governance vote while disconnected
- **THEN** the application explains that the action requires server confirmation and does not present it as accepted

### Requirement: Local and server changes synchronize bidirectionally
The system MUST upload queued supported local changes and download server changes after connectivity returns, while preserving a synchronization cursor and retrying incomplete work without duplicating accepted changes.

#### Scenario: Reconnect with pending local changes
- **WHEN** a device reconnects with queued changes
- **THEN** the system submits them for server authorization, records accepted results, and downloads subsequent server changes

#### Scenario: Retry after an interrupted synchronization
- **WHEN** synchronization is interrupted and retried
- **THEN** the system resumes from its last confirmed progress without duplicating accepted writes or losing unacknowledged changes

### Requirement: Concurrent edits are resolved transparently
The system MUST merge non-overlapping edits and MUST preserve both versions for member resolution when the same field changed locally and on the server; server-authoritative governance, credit, and moderation outcomes MUST NOT be overwritten by local data.

#### Scenario: Non-overlapping changes
- **WHEN** local and server edits affect different fields of the same record
- **THEN** the system merges the changes and synchronizes the merged record

#### Scenario: Overlapping changes
- **WHEN** local and server edits change the same field before synchronization
- **THEN** the system retains both values, identifies the conflict, and asks the member to choose the value to submit

### Requirement: Offline data is scoped and protected
The system MUST limit device data to public content for the selected community and the signed-in member's minimum profile and task data, and MUST NOT persist authentication secrets or private governance ballots in the offline dataset.

#### Scenario: Switch account or sign out
- **WHEN** a member signs out or switches accounts while private data or queued changes remain on the device
- **THEN** the application offers synchronization or explicit discard, prevents another account from viewing those records, and does not silently discard pending changes

#### Scenario: Synchronize public content
- **WHEN** public community data is stored for offline use
- **THEN** the stored records remain scoped to the selected community and exclude private profile fields and ballots

### Requirement: Offline storage failures are explicit
The application MUST report when device storage cannot persist or update queued data and MUST NOT report an unsaved change as safely queued.

#### Scenario: Local storage is unavailable or full
- **WHEN** the browser refuses a local write or reports insufficient storage
- **THEN** the application explains that the change was not safely saved and provides an online retry path

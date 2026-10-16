# Spec Delta

## Purpose

Coordinates community maintenance work and recognizes verified contributions through transparent, auditable platform credits that cannot be mistaken for money or blockchain assets.

## ADDED Requirements

### Requirement: Contributors can discover and claim tasks
The system MUST let authenticated members view eligible open tasks and claim a task only while it remains available.

#### Scenario: Claim an open task
- **WHEN** an authenticated member claims an eligible open task
- **THEN** the system assigns the task to that member and prevents another member from claiming it concurrently

#### Scenario: Claim an unavailable task
- **WHEN** a member attempts to claim a task that is no longer open or is not eligible for them
- **THEN** the system rejects the claim and leaves the task assignment unchanged

### Requirement: Task completion is reviewed
The system MUST let an assigned contributor submit completion evidence and MUST record the review outcome before awarding completion-based Work Credits.

#### Scenario: Approve completed work
- **WHEN** an authorized reviewer approves the contributor's submitted evidence
- **THEN** the system marks the task complete and initiates the configured Work Credit award

#### Scenario: Reject submitted work
- **WHEN** a reviewer rejects the submitted evidence
- **THEN** the system records the reason, leaves the task incomplete, and does not award completion-based Work Credits

### Requirement: Credit awards follow published rules
The system MUST maintain separate Contribution Credit, Work Credit, and DAO Token balances and identify the published rule that authorizes each award.

#### Scenario: Award an eligible contribution
- **WHEN** a qualifying activity satisfies a published award rule
- **THEN** the system records the credit type, amount, recipient, source activity, rule, and time

#### Scenario: Activity does not qualify
- **WHEN** an activity does not satisfy an award rule
- **THEN** the system creates no credit award and does not change the member's balance

### Requirement: Credit ledger is auditable and retry-safe
The system MUST preserve an append-only history of credit changes and MUST apply each source activity's award no more than once.

#### Scenario: Retry an award request
- **WHEN** the same award request is processed more than once
- **THEN** the system records at most one award for that source activity and returns the existing result for retries

#### Scenario: Inspect credit history
- **WHEN** a member views their credit history
- **THEN** the system shows each balance separately with its award or adjustment reason and source

### Requirement: Credits are not represented as money
The system MUST identify Contribution Credits, Work Credits, and DAO Tokens as internal platform records and MUST NOT represent them as cash, transferable assets, or guaranteed financial value.

#### Scenario: View a credit balance
- **WHEN** a member views a credit balance
- **THEN** the system identifies its type and displays the applicable platform rules without implying monetary value
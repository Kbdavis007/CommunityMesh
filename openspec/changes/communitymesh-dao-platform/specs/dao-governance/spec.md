# Spec Delta

## Purpose

Enables community members to propose and decide on platform rule changes through transparent, auditable governance with deterministic voting and execution outcomes.

## ADDED Requirements

### Requirement: Members can create governance proposals
Eligible members MUST be able to submit a proposal with a description, requested action, and voting period for community review.

#### Scenario: Submit a valid proposal
- **WHEN** an eligible member submits a complete proposal
- **THEN** the system records its author, content, status, and voting period

#### Scenario: Reject an incomplete proposal
- **WHEN** a proposal omits required content or uses an invalid voting period
- **THEN** the system rejects it with validation details and creates no active proposal

### Requirement: Proposal votes use one-member-one-vote
The system MUST accept at most one vote per eligible member per proposal, without weighting votes by DAO Token or credit balances.

#### Scenario: Eligible member votes
- **WHEN** an eligible member casts a vote during the proposal's voting period
- **THEN** the system records one vote for that member and proposal

#### Scenario: Duplicate or late vote
- **WHEN** a member attempts to vote a second time or after the voting period closes
- **THEN** the system rejects the vote and preserves the existing tally

### Requirement: Proposal outcomes follow published governance rules
The system MUST calculate quorum and approval using the rule values recorded when voting opens and MUST expose the resulting tally and outcome.

#### Scenario: Proposal passes
- **WHEN** voting closes and the proposal meets its recorded quorum and approval thresholds
- **THEN** the system marks the proposal passed and makes its authorized execution available

#### Scenario: Proposal fails quorum or approval
- **WHEN** voting closes and the proposal misses either recorded threshold
- **THEN** the system marks the proposal failed and does not execute its requested action

### Requirement: Proposal execution is authorized and auditable
The system MUST execute a passed proposal at most once and MUST record its execution result in the public governance history.

#### Scenario: Execute a passed proposal
- **WHEN** an authorized execution is requested for a passed proposal
- **THEN** the system applies the approved action once and records the actor, time, and result

#### Scenario: Execute an unsupported action
- **WHEN** a passed proposal requests an action that cannot be safely executed by the platform
- **THEN** the system does not perform the action and records that human or operational follow-up is required

### Requirement: Governance history is publicly inspectable
The system MUST expose proposal text, voting rules, tally, outcome, and execution history without exposing private voter profile information.

#### Scenario: Inspect governance history
- **WHEN** a visitor opens the governance history
- **THEN** the system displays proposal outcomes and execution records while identifying votes only in aggregate